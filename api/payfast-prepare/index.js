const { getTableClient, TABLES } = require("../shared/table");
const { buildSignature } = require("../shared/payfast");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const formatAmount = (value) => {
  const number = Number(value || 0);
  if (Number.isNaN(number) || number <= 0) {
    return "0.00";
  }
  return number.toFixed(2);
};

module.exports = async function (context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const bookingId = String(body.bookingId || "").trim();

  if (!email || !bookingId) {
    context.res = { status: 400, headers, body: { error: "Missing booking details." } };
    return;
  }

  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const sandbox = String(process.env.PAYFAST_SANDBOX || "").toLowerCase() === "true";
  const returnUrl = process.env.PAYFAST_RETURN_URL || "https://www.kleanzilla.co.za/book-a-clean.html?paid=1";
  const cancelUrl = process.env.PAYFAST_CANCEL_URL || "https://www.kleanzilla.co.za/book-a-clean.html?pay=cancelled";
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL || "https://prod-kz-fn-email-processor.azurewebsites.net/api/payfast-itn";

  if (!merchantId || !merchantKey) {
    context.res = { status: 500, headers, body: { error: "Payfast settings not configured." } };
    return;
  }

  try {
    const bookings = getTableClient(TABLES.bookings);
    const booking = await bookings.getEntity(email, bookingId);

    const amount = formatAmount(booking.paymentAmount || booking.totalMax || booking.totalMin || 0);
    const itemName = `KleanZilla cleaning (${booking.cleanType || "service"})`;
    const itemDescription = `${booking.address || ""} ${booking.bookingDate || ""} ${booking.bookingTime || ""}`.trim();

    const data = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      m_payment_id: bookingId,
      amount,
      item_name: itemName,
      item_description: itemDescription,
      name_first: booking.firstName || "",
      name_last: booking.lastName || "",
      email_address: booking.email || email,
      custom_str1: booking.email || email,
    };

    const signature = buildSignature(data, passphrase);
    const payfastUrl = sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process";

    context.res = {
      status: 200,
      headers,
      body: {
        ok: true,
        payfastUrl,
        fields: { ...data, signature },
      },
    };
  } catch (error) {
    context.log.error("Payfast prepare failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Payfast prepare failed." } };
  }
};
