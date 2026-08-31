import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'oasis_dev',
  database: process.env.DB_NAME || 'oasis',
  max: 10,
});

export async function q(text: string, params: any[] = []): Promise<any[]> {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function q1(text: string, params: any[] = []): Promise<any | null> {
  const rows = await q(text, params);
  return rows.length ? rows[0] : null;
}

export async function tx<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function initSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(ddl);
}
