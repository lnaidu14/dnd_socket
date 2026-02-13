import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const schema = `
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id),
    player_count INTEGER DEFAULT 0,
    connected_users JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

let schemaRun = false;

export async function runSchema() {
  if (schemaRun) return;
  const client = await pool.connect();
  try {
    await client.query(schema);
    schemaRun = true;
  } finally {
    client.release();
  }
}

export async function getDb() {
  await runSchema();
  return {
    get: async (sql, params) => {
      const client = await pool.connect();
      try {
        const res = await client.query(sql, params);
        return res.rows[0] ?? null;
      } finally {
        client.release();
      }
    },
    run: async (sql, params) => {
      const client = await pool.connect();
      try {
        await client.query(sql, params);
      } finally {
        client.release();
      }
    },
  };
}
