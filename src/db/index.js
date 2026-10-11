import Database from 'better-sqlite3';
import fs from 'node:fs';
fs.mkdirSync('data', { recursive: true });
export const db = new Database(process.env.DATABASE_URL?.replace('sqlite:', '') || 'data/assessor.db');
db.pragma('journal_mode = WAL');
