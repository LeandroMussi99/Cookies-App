// src/db.ts
import { neon } from '@neondatabase/serverless';

export function getDb(env: { NEON_DATABASE_URL: string }) {
  // env.NEON_DATABASE_URL viene del secret que guardaste con wrangler
  return neon(env.NEON_DATABASE_URL);
}
