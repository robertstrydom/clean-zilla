const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const buildMagicLink = (token) => {
  const baseUrl = process.env.MAGIC_LINK_BASE_URL || "https://www.kleanzilla.co.za";
  return `${baseUrl}/?token=${encodeURIComponent(token)}`;
};

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) {
    context.res = { status: 400, headers, body: { error: "Missing email." } };
    return;
  }

  try {
    await ensureTables();
    const bookings = getTableClient(TABLES.bookings);
    const tokens = getTableClient(TABLES.tokens);

    const bookingRows = [];
    for await (const row of bookings.listEntities({
      queryOptions: { filter: `PartitionKey eq '${email.replace(/'/g, "''")}'` },
    })) {
      bookingRows.push(row);
    }

    if (!bookingRows.length) {
      context.res = { status: 404, headers, body: { error: "No bookings found for this email." } };
      return;
    }

    bookingRows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const latest = bookingRows[0];

    const token = crypto.randomBytes(24).toString("base64url");
    const now = new Date();
    const ttlHours = Number(process.env.MAGIC_LINK_TTL_HOURS || 168);
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    await tokens.createEntity({
      partitionKey: "token",
      rowKey: token,
      email,
      bookingId: latest.rowKey,
      scope: "gallery",
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const sendGridFrom = process.env.SENDGRID_FROM;

    if (!sendGridApiKey || !sendGridFrom) {
      context.res = {
        status: 500,
        headers,
        body: { error: "SendGrid settings not configured." },
      };
      return;
    }

    sgMail.setApiKey(sendGridApiKey);

    const magicLink = buildMagicLink(token);
    const subject = "Your Clean Zilla photo gallery link";
    const textBody = `
Here is your secure link to view your booking and photos:

${magicLink}

If you did not request this, you can ignore this email.
    `.trim();

    const htmlBody = `
      <p>Here is your secure link to view your booking and photos:</p>
      <p><a href="${magicLink}">${magicLink}</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    await sgMail.send({
      from: sendGridFrom,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });

    context.res = { status: 200, headers, body: { ok: true } };
  } catch (error) {
    context.log.error("Magic link request failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Magic link request failed." } };
  }
};
