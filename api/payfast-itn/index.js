const https = require("https");
const sgMail = require("@sendgrid/mail");
const { getTableClient, TABLES } = require("../shared/table");
const { buildSignature, buildParamString, parseFormBody } = require("../shared/payfast");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.headers["x-client-ip"] || req.headers["x-real-ip"] || "";
};

const validateWithPayfast = (validateUrl, paramString) =>
  new Promise((resolve) => {
    if (!validateUrl) {
      resolve({ ok: true, skipped: true });
      return;
    }
    const reqOptions = new URL(validateUrl);
    const request = https.request(
      {
        method: "POST",
        hostname: reqOptions.hostname,
        path: reqOptions.pathname + (reqOptions.search || ""),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(paramString),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ ok: data.trim() === "VALID", response: data.trim() });
        });
      }
    );
    request.on("error", (error) => resolve({ ok: false, error }));
    request.write(paramString);
    request.end();
  });

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const data = parseFormBody(req);
  const signature = data.signature;
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const notifyEmail = process.env.NOTIFY_EMAIL || process.env.SENDGRID_FROM;
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const sendGridFrom = process.env.SENDGRID_FROM;
  const ipWhitelist = String(process.env.PAYFAST_IP_WHITELIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!merchantId) {
    context.res = { status: 500, headers, body: "Merchant config missing." };
    return;
  }

  const dataForSignature = { ...data };
  delete dataForSignature.signature;
  const computedSignature = buildSignature(dataForSignature, passphrase);
  if (!signature || computedSignature !== signature) {
    context.log.warn("Payfast ITN signature mismatch.");
    context.res = { status: 400, headers, body: "Invalid signature." };
    return;
  }

  const clientIp = getClientIp(req);
  if (ipWhitelist.length && clientIp && !ipWhitelist.includes(clientIp)) {
    context.log.warn(`Payfast ITN invalid IP: ${clientIp}`);
    context.res = { status: 400, headers, body: "Invalid source IP." };
    return;
  }

  if (data.merchant_id !== merchantId) {
    context.log.warn("Payfast ITN merchant ID mismatch.");
    context.res = { status: 400, headers, body: "Merchant mismatch." };
    return;
  }

  const bookingId = String(data.m_payment_id || "");
  const customerEmail = normalizeEmail(data.custom_str1 || data.email_address || "");

  if (!bookingId || !customerEmail) {
    context.res = { status: 400, headers, body: "Missing booking reference." };
    return;
  }

  const bookings = getTableClient(TABLES.bookings);
  let booking;
  try {
    booking = await bookings.getEntity(customerEmail, bookingId);
  } catch (error) {
    context.log.warn("Payfast ITN booking not found.");
    context.res = { status: 404, headers, body: "Booking not found." };
    return;
  }

  const amountGross = Number(data.amount_gross || data.amount || 0);
  const expectedAmount = Number(booking.paymentAmount || booking.totalMax || 0);
  if (expectedAmount && amountGross && Math.abs(amountGross - expectedAmount) > 0.01) {
    context.log.warn(`Payfast ITN amount mismatch: ${amountGross} vs ${expectedAmount}`);
    context.res = { status: 400, headers, body: "Amount mismatch." };
    return;
  }

  const validateUrl = process.env.PAYFAST_VALIDATE_URL || "";
  const paramString = buildParamString(dataForSignature);
  const validation = await validateWithPayfast(validateUrl, paramString);
  if (!validation.ok) {
    context.log.warn("Payfast ITN validation failed.", validation);
    context.res = { status: 400, headers, body: "Validation failed." };
    return;
  }

  const paymentStatus = String(data.payment_status || "").toUpperCase();
  const now = new Date().toISOString();

  await bookings.updateEntity(
    {
      partitionKey: customerEmail,
      rowKey: bookingId,
      status: paymentStatus === "COMPLETE" ? "paid" : booking.status || "quote",
      payfastPaymentId: data.pf_payment_id || "",
      payfastStatus: paymentStatus,
      paidAt: paymentStatus === "COMPLETE" ? now : booking.paidAt || "",
      updatedAt: now,
    },
    "Merge"
  );

  if (paymentStatus === "COMPLETE" && sendGridApiKey && sendGridFrom) {
    sgMail.setApiKey(sendGridApiKey);
    const subject = `Payment received · Booking ${bookingId}`;
    const textBody = `Thanks! We’ve received your Payfast payment for ${booking.cleanType || "your booking"}.\n\nBooking: ${bookingId}\nAmount: R${expectedAmount}\nWe’ll confirm availability shortly.`;
    const htmlBody = `
      <p>Thanks! We’ve received your Payfast payment for <strong>${booking.cleanType || "your booking"}</strong>.</p>
      <p><strong>Booking:</strong> ${bookingId}<br/>
      <strong>Amount:</strong> R${expectedAmount}</p>
      <p>We’ll confirm availability shortly.</p>
    `;
    await sgMail.send({
      from: sendGridFrom,
      to: [notifyEmail, customerEmail].filter(Boolean),
      subject,
      text: textBody,
      html: htmlBody,
    });
  }

  context.res = { status: 200, headers, body: "OK" };
};
