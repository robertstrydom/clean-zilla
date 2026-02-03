const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
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

  const adminKey = req.headers["x-admin-key"] || (req.body && req.body.adminKey);
  const token = req.body && req.body.token;

  const { email, bookingId, fileName, contentType, stage } = req.body || {};
  if (!email || !bookingId || !fileName || !stage) {
    context.res = {
      status: 400,
      headers,
      body: { error: "Missing email, bookingId, stage, or fileName." },
    };
    return;
  }

  const normalizedStage = String(stage).toLowerCase();
  if (!["before", "after"].includes(normalizedStage)) {
    context.res = { status: 400, headers, body: { error: "Invalid stage." } };
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
    const bookings = getTableClient(TABLES.bookings);
    const tokens = getTableClient(TABLES.tokens);

    if (token) {
      const tokenEntity = await tokens.getEntity("token", token);
      const expiresAt = new Date(tokenEntity.expiresAt);
      if (!tokenEntity || tokenEntity.scope !== "admin" || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        context.res = { status: 401, headers, body: { error: "Token expired or invalid." } };
        return;
      }
    } else if (!adminKey || adminKey !== process.env.ADMIN_UPLOAD_KEY) {
      context.res = { status: 401, headers, body: { error: "Unauthorized." } };
      return;
    }

    await bookings.getEntity(String(email).trim().toLowerCase(), bookingId);

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
    const safeEmail = sanitizePathPart(email);
    const safeBooking = sanitizePathPart(bookingId);
    const blobName = `${safeEmail}/${safeBooking}/${normalizedStage}/${fileName}`;

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
    context.log.error("Admin SAS failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Unable to create admin upload SAS." } };
  }
};
