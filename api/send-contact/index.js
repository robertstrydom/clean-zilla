const sgMail = require("@sendgrid/mail");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const normalize = (value) => String(value || "").trim();

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const body = req.body || {};
  const name = normalize(body.name);
  const email = normalize(body.email).toLowerCase();
  const phone = normalize(body.phone);
  const message = normalize(body.message);

  if (!name || !email || !message) {
    context.res = { status: 400, headers, body: { error: "Missing required fields." } };
    return;
  }

  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const sendGridFrom = process.env.SENDGRID_FROM;
  const contactEmail = process.env.CONTACT_EMAIL || "zillaklean@gmail.com";

  if (!sendGridApiKey || !sendGridFrom) {
    context.res = {
      status: 500,
      headers,
      body: { error: "SendGrid settings not configured." },
    };
    return;
  }

  sgMail.setApiKey(sendGridApiKey);

  const subject = `KleanZilla enquiry from ${name}`;
  const textBody = `
New enquiry received:

Name: ${name}
Email: ${email}
Phone: ${phone || "N/A"}

Message:
${message}
  `.trim();

  const htmlBody = `
    <p><strong>New enquiry received:</strong></p>
    <ul>
      <li><strong>Name:</strong> ${name}</li>
      <li><strong>Email:</strong> ${email}</li>
      <li><strong>Phone:</strong> ${phone || "N/A"}</li>
    </ul>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, "<br />")}</p>
  `;

  try {
    await sgMail.send({
      from: sendGridFrom,
      to: contactEmail,
      subject,
      text: textBody,
      html: htmlBody,
      replyTo: email,
    });

    context.res = { status: 200, headers, body: { ok: true } };
  } catch (error) {
    context.log.error("Contact form email failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Unable to send enquiry." } };
  }
};
