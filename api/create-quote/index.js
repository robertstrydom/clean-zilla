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

const formatZar = (value) => {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "N/A";
  }
  return `R${number.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
};

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const body = req.body || {};
  const email = normalizeEmail(body.email);

  if (!email) {
    context.res = { status: 400, headers, body: { error: "Missing email." } };
    return;
  }

  const bookingId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const ttlHours = Number(process.env.MAGIC_LINK_TTL_HOURS || 168);
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  try {
    await ensureTables();

    const customers = getTableClient(TABLES.customers);
    const bookings = getTableClient(TABLES.bookings);
    const tokens = getTableClient(TABLES.tokens);

    await customers.upsertEntity(
      {
        partitionKey: "customer",
        rowKey: email,
        email,
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        phone: body.phone || "",
        updatedAt: now.toISOString(),
        createdAt: body.createdAt || now.toISOString(),
      },
      "Merge"
    );

    await bookings.createEntity({
      partitionKey: email,
      rowKey: bookingId,
      email,
      address: body.address || "",
      cleanType: body.cleanType || "",
      propertyType: body.propertyType || "",
      bedrooms: body.bedrooms || "",
      bathrooms: body.bathrooms || "",
      occupancy: body.occupancy || "",
      addOns: JSON.stringify(body.addOns || []),
      basePrice: Number(body.basePrice || 0),
      addOnTotal: Number(body.addOnTotal || 0),
      totalMin: Number(body.totalMin || 0),
      totalMax: Number(body.totalMax || 0),
      bookingDate: body.bookingDate || "",
      bookingTime: body.bookingTime || "",
      paymentMethod: body.paymentMethod || "",
      status: "quote",
      createdAt: now.toISOString(),
    });

    await tokens.createEntity({
      partitionKey: "token",
      rowKey: token,
      email,
      bookingId,
      scope: "gallery",
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const sendGridFrom = process.env.SENDGRID_FROM;
    const notifyEmail = process.env.NOTIFY_EMAIL || sendGridFrom;

    if (!sendGridApiKey || !sendGridFrom) {
      context.res = {
        status: 500,
        headers,
        body: { error: "SendGrid settings not configured." },
      };
      return;
    }

    sgMail.setApiKey(sendGridApiKey);

    const totalMin = Number(body.totalMin || 0);
    const totalMax = Number(body.totalMax || 0);
    const totalDisplay =
      totalMin && totalMax && totalMin !== totalMax
        ? `${formatZar(totalMin)}–${formatZar(totalMax)}`
        : formatZar(totalMin || totalMax || 0);

    const magicLink = buildMagicLink(token);

    const subject = `Your Clean Zilla quote · ${totalDisplay}`;
    const textBody = `
Hi ${body.firstName || "there"},

Thanks for requesting a quote. Here are your details:

Service: ${body.cleanType || "N/A"} (${body.bedrooms || "N/A"} bedrooms)
Address: ${body.address || "N/A"}
Date/time: ${body.bookingDate || "N/A"} ${body.bookingTime || ""}
Add-ons: ${(body.addOns || []).join(", ") || "None"}
Estimated total: ${totalDisplay}

View your booking and photos here:
${magicLink}

We will confirm availability shortly.
    `.trim();

    const htmlBody = `
      <p>Hi ${body.firstName || "there"},</p>
      <p>Thanks for requesting a quote. Here are your details:</p>
      <ul>
        <li><strong>Service:</strong> ${body.cleanType || "N/A"} (${body.bedrooms || "N/A"} bedrooms)</li>
        <li><strong>Address:</strong> ${body.address || "N/A"}</li>
        <li><strong>Date/time:</strong> ${body.bookingDate || "N/A"} ${body.bookingTime || ""}</li>
        <li><strong>Add-ons:</strong> ${(body.addOns || []).join(", ") || "None"}</li>
        <li><strong>Estimated total:</strong> ${totalDisplay}</li>
      </ul>
      <p>View your booking and photos here:</p>
      <p><a href="${magicLink}">${magicLink}</a></p>
      <p>We will confirm availability shortly.</p>
    `;

    await sgMail.send({
      from: sendGridFrom,
      to: [notifyEmail, email].filter(Boolean),
      subject,
      text: textBody,
      html: htmlBody,
    });

    context.res = {
      status: 200,
      headers,
      body: { ok: true, bookingId },
    };
  } catch (error) {
    context.log.error("Quote creation failed:", error && error.message ? error.message : error);
    context.res = {
      status: 500,
      headers,
      body: { error: "Quote creation failed." },
    };
  }
};
