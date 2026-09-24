import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
