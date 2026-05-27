import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // CORS headers for Server Actions
  const allowedOrigins = [
    "https://ktak.dev",
    "http://localhost:3000",
    "http://localhost:3400",
  ];
  const origin = request.headers.get("origin") ?? "";
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const result = NextResponse.next();
  if (isAllowedOrigin) {
    result.headers.set("Access-Control-Allow-Origin", origin);
  }
  result.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  result.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  result.headers.set("Access-Control-Allow-Credentials", "true");
  result.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'strict-dynamic'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  );

  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("X-XSS-Protection", "1; mode=block");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  result.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  return result;
}

export const config = {
  matcher: "/my-assets/:path*",
};
