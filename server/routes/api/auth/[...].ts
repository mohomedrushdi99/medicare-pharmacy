/**
 * Nitro catch-all for Better Auth on Vercel.
 * Covers /api/auth/* including sign-up/email, sign-in/email, get-session, sign-out.
 */
import { defineEventHandler } from "h3";
import { auth } from "../../../../src/lib/auth/server";

export default defineEventHandler((event) => {
  // h3 v2 / Nitro provides event.req as a Web Request in many presets
  const request = (event as any).req ?? (event as any).web?.request;
  if (request) {
    return auth.handler(request);
  }

  // Fallback for older node adapter
  const url = new URL(
    event.node?.req?.url || event.path || "/",
    `http://${event.node?.req?.headers?.host || "localhost"}`,
  );
  return auth.handler(
    new Request(url, {
      method: event.method || event.node?.req?.method || "GET",
      headers: event.headers || event.node?.req?.headers,
    }),
  );
});
