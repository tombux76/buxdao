const { neon } = require("@neondatabase/serverless");

const databaseUrl =
  process.env.CASINO_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
const sql = databaseUrl ? neon(databaseUrl) : null;

const ALLOWED_ORIGINS = [
  "https://1000s.space",
  "https://www.1000s.space",
  "https://buxdao.com",
  "https://www.buxdao.com",
  "https://buxdao-mu.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function setCors(res, origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

/** One-line message for DB connection errors (e.g. ENOTFOUND) to avoid huge stack dumps. */
function formatDbConnectionErr(err) {
  if (!err) return null;
  const cause = err.cause || err;
  const msg = cause.message || err.message || "";
  const code = cause.code || cause.errno;
  if (err.name === "NeonDbError" || code === "ENOTFOUND" || msg.includes("fetch failed") || msg.includes("getaddrinfo")) {
    return "Database unreachable: " + (cause.hostname ? cause.hostname + " " : "") + (msg || code || "connection failed");
  }
  return null;
}

module.exports = { sql, setCors, json, ALLOWED_ORIGINS, formatDbConnectionErr };
