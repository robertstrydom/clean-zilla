const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isAllowedAdmin = (email) => {
  const raw = process.env.ADMIN_EMAILS || "";
  const allowed = raw
    .split(/[,\s;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email);
};

const buildAdminLink = (token) => {
  const baseUrl = process.env.ADMIN_LINK_BASE_URL || process.env.MAGIC_LINK_BASE_URL || "https://www.kleanzilla.co.za";
  const path = baseUrl.endsWith("/") ? `${baseUrl}admin.html` : `${baseUrl}/admin.html`;
  return `${path}?adminToken=${encodeURIComponent(token)}`;
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

  if (!isAllowedAdmin(email)) {
    context.res = { status: 403, headers, body: { error: "Not authorized." } };
    return;
  }

  try {
    await ensureTables();
    const tokens = getTableClient(TABLES.tokens);

    const token = crypto.randomBytes(24).toString("base64url");
    const now = new Date();
    const ttlHours = Number(process.env.MAGIC_LINK_TTL_HOURS || 168);
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    await tokens.createEntity({
      partitionKey: "token",
      rowKey: token,
      email,
      bookingId: "admin",
      scope: "admin",
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

    const adminLink = buildAdminLink(token);
    const subject = "Your Clean Zilla admin upload link";
    const textBody = `
Here is your secure admin upload link:

${adminLink}
    `.trim();

    const htmlBody = `
      <p>Here is your secure admin upload link:</p>
      <p><a href="${adminLink}">${adminLink}</a></p>
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
    context.log.error("Admin link request failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Admin link request failed." } };
  }
};
