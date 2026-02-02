const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");

const containerName = (process.env.BLOB_CONTAINER || "kleanzilla").toLowerCase();

const parseConnectionString = (connectionString) => {
  const parts = String(connectionString || "").split(";");
  const map = {};
  parts.forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      map[key] = value;
    }
  });
  return map;
};

const sanitizePathPart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

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
    fileName,
    contentType,
    date,
  } = req.body || {};

  if (!clientEmail || !listingId || !fileName) {
    context.res = {
      status: 400,
      headers,
      body: { error: "Missing clientEmail, listingId, or fileName." },
    };
    return;
  }

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    context.res = {
      status: 500,
      headers,
      body: { error: "Storage connection string not configured." },
    };
    return;
  }

  const { AccountName, AccountKey } = parseConnectionString(connectionString);
  if (!AccountName || !AccountKey) {
    context.res = {
      status: 500,
      headers,
      body: { error: "Invalid storage connection string." },
    };
    return;
  }

  const credential = new StorageSharedKeyCredential(AccountName, AccountKey);
  const safeEmail = sanitizePathPart(clientEmail);
  const safeListing = sanitizePathPart(listingId);
  const datePart = date || new Date().toISOString().slice(0, 10);
  const blobName = `${safeEmail}/${safeListing}/${datePart}/${fileName}`;

  const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"),
      expiresOn,
      contentType: contentType || "application/octet-stream",
    },
    credential
  ).toString();

  const blobUrl = `https://${AccountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(
    blobName
  )}`;
  const sasUrl = `${blobUrl}?${sas}`;

  context.res = {
    status: 200,
    headers,
    body: { sasUrl, blobUrl },
  };
};
