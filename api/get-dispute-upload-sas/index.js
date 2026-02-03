const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  const { token, fileName, contentType } = req.body || {};
  if (!token || !fileName) {
    context.res = { status: 400, headers, body: { error: "Missing token or fileName." } };
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

  try {
    await ensureTables();
    const tokens = getTableClient(TABLES.tokens);
    const tokenEntity = await tokens.getEntity("token", token);
    const expiresAt = new Date(tokenEntity.expiresAt);
    if (!tokenEntity || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      context.res = { status: 401, headers, body: { error: "Token expired or invalid." } };
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
    const safeEmail = sanitizePathPart(tokenEntity.email);
    const safeBooking = sanitizePathPart(tokenEntity.bookingId);
    const blobName = `${safeEmail}/${safeBooking}/dispute/${fileName}`;

    const expiresOn = new Date(Date.now() + 20 * 60 * 1000);
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

    context.res = { status: 200, headers, body: { sasUrl, blobUrl } };
  } catch (error) {
    context.log.error("Dispute SAS failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Unable to create dispute upload SAS." } };
  }
};
