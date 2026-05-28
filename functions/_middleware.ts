// Project-wide middleware. Runs for every Functions request and adds
// baseline security headers so we don't have to remember them per route.

import type { Env } from "./_lib/types";

export const onRequest: PagesFunction<Env> = async ({ next }) => {
  const response = await next();
  const headers = new Headers(response.headers);
  if (!headers.has("X-Content-Type-Options")) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "no-referrer");
  }
  if (!headers.has("Strict-Transport-Security")) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  if (!headers.has("X-Frame-Options")) {
    headers.set("X-Frame-Options", "DENY");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
