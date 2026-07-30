import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema.ts";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create a Postgres database and add the connection string to your Secrets.",
  );
}

const client = postgres(process.env.DATABASE_URL, { max: 5 });

export const db = drizzle(client, { schema });
export { schema };
