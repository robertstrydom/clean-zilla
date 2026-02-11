const crypto = require("crypto");
const querystring = require("querystring");

const encodeValue = (value) =>
  encodeURIComponent(String(value ?? ""))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const buildParamString = (data) => {
  const entries = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, value]) => `${encodeValue(key)}=${encodeValue(value)}`).join("&");
};

const buildSignature = (data, passphrase) => {
  const paramString = buildParamString(data);
  const signedString = passphrase ? `${paramString}&passphrase=${encodeValue(passphrase)}` : paramString;
  return crypto.createHash("md5").update(signedString).digest("hex");
};

const parseFormBody = (req) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = req.rawBody || req.body || "";
  return querystring.parse(String(raw));
};

module.exports = {
  buildSignature,
  buildParamString,
  parseFormBody,
};
