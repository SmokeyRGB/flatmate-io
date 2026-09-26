import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Extra hostnames `next dev` accepts, e.g. a phone on the LAN opening http://<machine-ip>:3000.
  // Read from .env.local (loaded before this file), so no machine's address is committed.
  allowedDevOrigins:
    process.env.ALLOWED_DEV_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
  // join-screen design.md Decision 11 (G-A5, dev only — "this option doesn't affect production
  // builds"): next dev's own incoming-request log otherwise prints every `GET /join/<CODE>`, which
  // would put the code exactly where G-A5 forbids it. The production access log stays a deployment
  // obligation (proposal.md Impact), unaffected by this. `serverFunctions` is left at its default —
  // it stays on, because after this change no action on this route returns a code, name, email or
  // password anywhere but inside a FormData, which the logger prints as `{}` (constraint 5).
  logging: {
    incomingRequests: {
      ignore: [/^\/join\//],
    },
  },
};

export default nextConfig;
