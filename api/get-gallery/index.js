const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobServiceClient,
} = require("@azure/storage-blob");
const { ensureTables, getTableClient, TABLES } = require("../shared/table");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  const token = (req.query && req.query.token) || (req.body && req.body.token);
  if (!token) {
    context.res = { status: 400, headers, body: { error: "Missing token." } };
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
    const bookings = getTableClient(TABLES.bookings);

    const tokenEntity = await tokens.getEntity("token", token);
    const expiresAt = new Date(tokenEntity.expiresAt);
    if (!tokenEntity || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      context.res = { status: 401, headers, body: { error: "Token expired or invalid." } };
      return;
    }

    const booking = await bookings.getEntity(tokenEntity.email, tokenEntity.bookingId);

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
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const safeEmail = sanitizePathPart(tokenEntity.email);
    const safeBooking = sanitizePathPart(tokenEntity.bookingId);
    const prefix = `${safeEmail}/${safeBooking}/`;

    const readExpiry = new Date(Date.now() + 30 * 60 * 1000);
    const gallery = { before: [], after: [], dispute: [] };

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const blobName = blob.name;
      const relative = blobName.slice(prefix.length);
      const stage = relative.split("/")[0];
      if (!gallery[stage]) {
        continue;
      }

      const sas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse("r"),
          expiresOn: readExpiry,
        },
        credential
      ).toString();

      const blobUrl = `https://${AccountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(
        blobName
      )}`;
      gallery[stage].push({ url: `${blobUrl}?${sas}`, name: blobName.split("/").pop() });
    }

    context.res = {
      status: 200,
      headers,
      body: {
        booking: {
          id: booking.rowKey,
          email: booking.email,
          cleanType: booking.cleanType,
          bedrooms: booking.bedrooms,
          bookingDate: booking.bookingDate,
        },
        gallery,
      },
    };
  } catch (error) {
    context.log.error("Gallery fetch failed:", error && error.message ? error.message : error);
    context.res = { status: 500, headers, body: { error: "Gallery fetch failed." } };
  }
};
