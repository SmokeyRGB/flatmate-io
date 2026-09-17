import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// `prepare: false` is required, not optional: Supabase's transaction-mode Supavisor pooler
// (research.md §1) does not support prepared statements. Without this, writes fail
// unpredictably once a connection is reused across pooled transactions.
const queryClient = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(queryClient);
