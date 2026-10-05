export async function register(): Promise<void> {
  // next build sets NEXT_PHASE to phase-production-build and does not call register
  // (instrumentation-globals.external.js). This still only runs in the Node.js server runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertTrustedIpHeaderConfigured } = await import("./app/request-ip");
  assertTrustedIpHeaderConfigured(process.env);
}
