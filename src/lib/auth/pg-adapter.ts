import PostgresAdapter from "@auth/pg-adapter";
import type { Adapter, AdapterUser } from "@auth/core/adapters";

type DbUserRow = {
  id: number | string;
  email: string | null;
  emailVerified: Date | null;
  discord_id: string | null;
  discord_username: string | null;
  discord_image: string | null;
};

function mapDbUser(row: DbUserRow): AdapterUser {
  return {
    id: String(row.id),
    email: row.email ?? "",
    emailVerified: row.emailVerified,
    name: row.discord_username,
    image: row.discord_image,
  };
}

const userSelect = `id, email, "emailVerified", discord_id, discord_username, discord_image`;
const userSelectAliased = `u.id, u.email, u."emailVerified", u.discord_id, u.discord_username, u.discord_image`;

/**
 * Auth.js adapter: stores Discord profile in discord_* columns (not name/image).
 * Maps discord_username/discord_image ↔ User.name/User.image for Auth.js runtime.
 */
export function BuxdaoPostgresAdapter(client: Parameters<typeof PostgresAdapter>[0]): Adapter {
  const base = PostgresAdapter(client);

  return {
    ...base,
    async createUser(user) {
      const result = await client.query<DbUserRow>(
        `INSERT INTO users (email, "emailVerified", discord_username, discord_image)
         VALUES ($1, $2, $3, $4)
         RETURNING ${userSelect}`,
        [user.email ?? null, user.emailVerified ?? null, user.name ?? null, user.image ?? null],
      );
      return mapDbUser(result.rows[0]);
    },
    async getUser(id) {
      const result = await client.query<DbUserRow>(
        `SELECT ${userSelect} FROM users WHERE id = $1`,
        [id],
      );
      return result.rowCount ? mapDbUser(result.rows[0]) : null;
    },
    async getUserByEmail(email) {
      const result = await client.query<DbUserRow>(
        `SELECT ${userSelect} FROM users WHERE email = $1`,
        [email],
      );
      return result.rowCount ? mapDbUser(result.rows[0]) : null;
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const result = await client.query<DbUserRow>(
        `SELECT ${userSelectAliased}
         FROM users u
         JOIN accounts a ON u.id = a."userId"
         WHERE a.provider = $1 AND a."providerAccountId" = $2`,
        [provider, providerAccountId],
      );
      return result.rowCount ? mapDbUser(result.rows[0]) : null;
    },
    async updateUser(user) {
      const result = await client.query<DbUserRow>(
        `UPDATE users SET
          email = COALESCE($2, email),
          "emailVerified" = COALESCE($3, "emailVerified"),
          discord_username = COALESCE($4, discord_username),
          discord_image = COALESCE($5, discord_image),
          updated_at = now()
         WHERE id = $1
         RETURNING ${userSelect}`,
        [user.id, user.email ?? null, user.emailVerified ?? null, user.name ?? null, user.image ?? null],
      );
      return mapDbUser(result.rows[0]);
    },
    async getSessionAndUser(sessionToken) {
      if (!sessionToken) {
        return null;
      }

      const sessionResult = await client.query(
        `SELECT * FROM sessions WHERE "sessionToken" = $1`,
        [sessionToken],
      );
      if (!sessionResult.rowCount) {
        return null;
      }

      const session = sessionResult.rows[0];
      const userResult = await client.query<DbUserRow>(
        `SELECT ${userSelect} FROM users WHERE id = $1`,
        [session.userId],
      );
      if (!userResult.rowCount) {
        return null;
      }

      return { session, user: mapDbUser(userResult.rows[0]) };
    },
  };
}
