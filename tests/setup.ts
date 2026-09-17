import { config } from "dotenv";

// `quiet: true` suppresses dotenv's own stdout "tip" advertisements (confirmed in its source,
// node_modules/dotenv/lib/main.js) — not a security concern, just noise in test output.
config({ path: ".env.local", quiet: true });
