import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is required");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return pool;
}
