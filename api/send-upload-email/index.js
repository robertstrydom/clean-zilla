const sgMail = require("@sendgrid/mail");

module.exports = async function (context, req) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const {
    clientEmail,
    listingId,
    apartmentSize,
    cleaningType,
    extras = [],
    notes = "",
    date,
    files = [],
  } = req.body || {};

  if (!clientEmail || !listingId) {
    context.res = {
      status: 400,
      headers,
      body: { error: "Missing clientEmail or listingId." },
    };
    return;
  }

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

  const extraList = extras.length ? extras.map((item) => `• ${item}`).join("\n") : "None";
  const fileList = files.length ? files.map((url) => `• ${url}`).join("\n") : "No files uploaded.";

  const subject = `KleanZilla listing details: ${listingId}`;
  const textBody = `
Listing details
Listing: ${listingId}
Client: ${clientEmail}
Date: ${date || "N/A"}
Apartment size: ${apartmentSize || "N/A"}
Cleaning type: ${cleaningType || "N/A"}

Extras:
${extraList}

Notes:
${notes || "None"}

Uploaded photos:
${fileList}
  `.trim();

  const htmlBody = `
    <h2>Listing details</h2>
    <p><strong>Listing:</strong> ${listingId}</p>
    <p><strong>Client:</strong> ${clientEmail}</p>
    <p><strong>Date:</strong> ${date || "N/A"}</p>
    <p><strong>Apartment size:</strong> ${apartmentSize || "N/A"}</p>
    <p><strong>Cleaning type:</strong> ${cleaningType || "N/A"}</p>
    <p><strong>Extras:</strong></p>
    <ul>${extras.length ? extras.map((item) => `<li>${item}</li>`).join("") : "<li>None</li>"}</ul>
    <p><strong>Notes:</strong> ${notes || "None"}</p>
    <p><strong>Uploaded photos:</strong></p>
    <ul>${files.length ? files.map((url) => `<li><a href="${url}">${url}</a></li>`).join("") : "<li>No files uploaded.</li>"}</ul>
  `;

  try {
    await sgMail.send({
      from: sendGridFrom,
      to: [notifyEmail, clientEmail].filter(Boolean),
      subject,
      text: textBody,
      html: htmlBody,
    });

    context.res = {
      status: 200,
      headers,
      body: { ok: true },
    };
  } catch (error) {
    context.log.error("Email send failed:", error && error.message ? error.message : error);
    context.res = {
      status: 500,
      headers,
      body: {
        error: "Email send failed.",
        detail: error && error.message ? error.message : "Unknown SendGrid error.",
      },
    };
  }
};
