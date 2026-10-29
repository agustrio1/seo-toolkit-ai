import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum dikonfigurasi. Isi connection string Neon di environment server.",
    );
  }
  return url;
}

/**
 * Neon HTTP driver: cocok untuk serverless (tidak menahan koneksi TCP).
 * Satu instance dikached per warm function agar tidak membuat objek baru tiap request.
 */
export function getDb(): Db {
  if (!cached) {
    cached = drizzle(neon(connectionString()), { schema });
  }
  return cached;
}

export { schema };
