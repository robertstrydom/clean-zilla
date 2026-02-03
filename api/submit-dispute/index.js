const sgMail = require("@sendgrid/mail");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const { token, notes, files = [] } = req.body || {};
  if (!token) {
    context.res = { status: 400, headers, body: { error: "Missing token." } };
    return;
  }

  try {
    await ensureTables();
    const tokens = getTableClient(TABLES.tokens);
    const bookings = getTableClient(TABLES.bookings);

    const tokenEntity = await tokens.getEntity("token", token);
    const expiresAt = new Date(tokenEntity.expiresAt);
    if (!tokenEntity || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      context.res = { status: 401, headers, body: { error: "Token expired or invalid." } };
      return;
    }

    const booking = await bookings.getEntity(tokenEntity.email, tokenEntity.bookingId);

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const sendGridFrom = process.env.SENDGRID_FROM;
    const notifyEmail = process.env.NOTIFY_EMAIL || sendGridFrom;

    if (!sendGridApiKey || !sendGridFrom) {
      context.res = { status: 500, headers, body: { error: "SendGrid settings not configured." } };
      return;
    }

    sgMail.setApiKey(sendGridApiKey);

    const fileList = files.length ? files.map((url) => `• ${url}`).join("\n") : "No files uploaded.";
    const subject = `KleanZilla dispute submitted: ${booking.rowKey}`;
    const textBody = `
Dispute submitted
Booking: ${booking.rowKey}
Client: ${booking.email}
Service: ${booking.cleanType || "N/A"} (${booking.bedrooms || "N/A"} bedrooms)
Date: ${booking.bookingDate || "N/A"}

Notes:
${notes || "No notes provided."}

Dispute uploads:
${fileList}
    `.trim();

    const htmlBody = `
      <h2>Dispute submitted</h2>
      <p><strong>Booking:</strong> ${booking.rowKey}</p>
      <p><strong>Client:</strong> ${booking.email}</p>
      <p><strong>Service:</strong> ${booking.cleanType || "N/A"} (${booking.bedrooms || "N/A"} bedrooms)</p>
      <p><strong>Date:</strong> ${booking.bookingDate || "N/A"}</p>
      <p><strong>Notes:</strong></p>
      <p>${notes || "No notes provided."}</p>
      <p><strong>Dispute uploads:</strong></p>
      <ul>${
        files.length
          ? files.map((url) => `<li><a href="${url}">${url}</a></li>`).join("")
          : "<li>No files uploaded.</li>"
      }</ul>
    `;

    await sgMail.send({
      from: sendGridFrom,
      to: [notifyEmail, booking.email].filter(Boolean),
      subject,
      text: textBody,
      html: htmlBody,
    });

    context.res = { status: 200, headers, body: { ok: true } };
  } catch (error) {
    context.log.error("Dispute submit failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Dispute submit failed." } };
  }
};

