import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { UiConfig, UiIdentity } from "@/lib/ui-config";

export function actorFrom(request: NextRequest) {
  return identityFrom(request).username;
}

export function identityFrom(request: NextRequest, fallback?: UiConfig["identity"]): UiIdentity {
  const trustedProxy = process.env.TRUSTED_AUTH_PROXY === "true";
  const header = (process.env.TRUSTED_AUTH_HEADER || "x-auth-request-user").toLowerCase();
  if (trustedProxy) {
    const username = request.headers.get(header)?.slice(0, 255) || "unknown";
    const displayNameHeader = (process.env.TRUSTED_DISPLAY_NAME_HEADER || "x-auth-request-name").toLowerCase();
    const roleHeader = (process.env.TRUSTED_ROLE_HEADER || "x-auth-request-role").toLowerCase();
    return {
      username,
      displayName: request.headers.get(displayNameHeader)?.slice(0, 80) || username,
      role: request.headers.get(roleHeader)?.slice(0, 80) || fallback?.fallbackRole || "Cluster administrator",
      source: "trusted-proxy",
    };
  }
  if (process.env.NODE_ENV === "development") {
    return { username: "local-admin", displayName: fallback?.fallbackDisplayName || "Local Administrator", role: fallback?.fallbackRole || "Cluster administrator", source: "local-development" };
  }
  return { username: "unknown", displayName: "Identity unavailable", role: "Authentication proxy required", source: "unconfigured" };
}

export function sourceIpFrom(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export function verifyMutationRequest(request: NextRequest) {
  const apiToken = process.env.API_MUTATION_TOKEN;
  const providedApiToken = request.headers.get("x-api-mutation-token");
  if (apiToken && providedApiToken && safeEqual(apiToken, providedApiToken)) return;
  const csrfHeader = request.headers.get("x-csrf-token");
  const csrfCookie = request.cookies.get("kai_csrf")?.value;
  if (!csrfHeader || !csrfCookie || !safeEqual(csrfHeader, csrfCookie)) throw new RequestSecurityError("Missing or invalid CSRF token");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new RequestSecurityError("Cross-origin mutation rejected");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class RequestSecurityError extends Error {}
