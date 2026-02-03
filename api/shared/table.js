const { TableClient, TableServiceClient } = require("@azure/data-tables");

const connectionString = process.env.STORAGE_CONNECTION_STRING;

const TABLES = {
  customers: process.env.TABLE_CUSTOMERS || "KZCustomers",
  bookings: process.env.TABLE_BOOKINGS || "KZBookings",
  tokens: process.env.TABLE_TOKENS || "KZTokens",
};

let ensurePromise;

const getServiceClient = () => {
  if (!connectionString) {
    throw new Error("Storage connection string not configured.");
  }
  return TableServiceClient.fromConnectionString(connectionString);
};

const ensureTables = async () => {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const serviceClient = getServiceClient();
      await Promise.all(
        Object.values(TABLES).map(async (name) => {
          try {
            await serviceClient.createTable(name);
          } catch (error) {
            if (error && error.statusCode === 409) {
              return;
            }
            throw error;
          }
        })
      );
    })();
  }
  return ensurePromise;
};

const getTableClient = (tableName) => {
  if (!connectionString) {
    throw new Error("Storage connection string not configured.");
  }
  return TableClient.fromConnectionString(connectionString, tableName);
};

module.exports = { TABLES, ensureTables, getTableClient };
