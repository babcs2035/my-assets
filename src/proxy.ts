import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

const STATIC_ASSETS = [
  "favicon.ico",
  "icon.svg",
  "manifest.json",
  "_next/static",
  "node_modules",
  "robots.txt",
];

// ─── Rate Limiting ───────────────────────────────────────────────────────────
// IP-based rate limiting for failed auth attempts.
// Uses a module-level Map which persists in Node.js runtime.
// Edge Runtime does not persist global state, so rate limiting is best-effort.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 10;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes block after max failures
const MAX_MAP_SIZE = 10_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

let rateLimitMap: Map<string, RateLimitEntry> | null = null;

function getRateLimitMap(): Map<string, RateLimitEntry> {
  if (!rateLimitMap) {
    if (typeof globalThis !== "undefined") {
      if (!(globalThis as Record<string, unknown>).__rateLimitMap) {
        (globalThis as Record<string, unknown>).__rateLimitMap = new Map();
      }
      rateLimitMap = (globalThis as Record<string, unknown>)
        .__rateLimitMap as Map<string, RateLimitEntry>;
    } else {
      rateLimitMap = new Map();
    }
  }
  return rateLimitMap;
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  const map = getRateLimitMap();
  for (const [ip, entry] of map.entries()) {
    if (now > entry.resetAt && now > entry.blockedUntil) {
      map.delete(ip);
    }
  }
}

function maybeCleanup(): void {
  const now = Date.now();
  // Clean up every ~5 minutes of wall-clock time
  const lastCleanupKey = "__rateLimitLastCleanup";
  const lastCleanup =
    ((globalThis as Record<string, unknown>)[lastCleanupKey] as number) ?? 0;
  if (now - lastCleanup > 5 * 60 * 1000) {
    cleanupExpiredEntries();
    (globalThis as Record<string, unknown>)[lastCleanupKey] = now;
  }
  // Force cleanup if map exceeds size limit
  const map = getRateLimitMap();
  if (map.size > MAX_MAP_SIZE) {
    const entries = Array.from(map.entries()).sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const toDelete = Math.floor(MAX_MAP_SIZE / 2);
    for (let i = 0; i < toDelete; i++) {
      map.delete(entries[i][0]);
    }
  }
}

function getRateLimitInfo(ip: string): {
  blocked: boolean;
  remaining: number;
  retryAfter?: string;
} {
  const now = Date.now();
  const map = getRateLimitMap();
  const entry = map.get(ip);

  if (!entry) {
    return { blocked: false, remaining: MAX_FAILURES };
  }

  // Check if still blocked
  if (now < entry.blockedUntil) {
    const seconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return { blocked: true, remaining: 0, retryAfter: `${seconds}s` };
  }

  // Reset window if expired
  if (now > entry.resetAt) {
    map.set(ip, {
      count: 0,
      resetAt: now + WINDOW_MS,
      blockedUntil: 0,
    });
    return { blocked: false, remaining: MAX_FAILURES };
  }

  return { blocked: false, remaining: MAX_FAILURES - entry.count };
}

function recordAuthFailure(ip: string): void {
  maybeCleanup();
  const now = Date.now();
  const map = getRateLimitMap();
  const entry = map.get(ip);

  if (!entry || now > entry.resetAt) {
    map.set(ip, {
      count: 1,
      resetAt: now + WINDOW_MS,
      blockedUntil: 0,
    });
    return;
  }

  entry.count++;
  if (entry.count >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
  }
}

function getIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  // Next.js does not expose request.ip in middleware; fall back to a placeholder
  // In production behind a reverse proxy, x-forwarded-for is always present
  return "127.0.0.1";
}

function isStaticAsset(url: string): boolean {
  return STATIC_ASSETS.some(
    asset => url.includes(`/${asset}`) || url.includes(`/${asset}.`),
  );
}

function parseBasicAuth(
  header: string,
): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(
      header.replace("Basic ", ""),
      "base64",
    ).toString("utf-8");
    const [username, password] = decoded.split(":", 2);
    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

function makeUnauthorizedResponse(
  request: NextRequest,
  reason: "Invalid credentials format" | "Invalid credentials" | null,
): NextResponse {
  const ip = getIP(request);

  // Only count actual credential failures, not missing auth headers.
  // A first request without an auth header is a normal browser prompt,
  // not a brute-force attempt.
  if (reason !== null) {
    recordAuthFailure(ip);
  }

  const info = getRateLimitInfo(ip);
  const response = NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );
  response.headers.set("WWW-Authenticate", 'Basic realm="my-assets"');
  if (info.blocked) {
    response.headers.set("Retry-After", info.retryAfter ?? "900");
  }
  return response;
}

function checkAuth(request: NextRequest): NextResponse | null {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "BASIC_AUTH credentials not set in production. Denying access.",
      );
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
      );
    }
    return null; // Skip if no auth configured (dev mode)
  }

  const url = request.nextUrl.pathname;
  if (isStaticAsset(url)) {
    return null; // Allow static assets
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return makeUnauthorizedResponse(request, null);
  }

  const credentials = parseBasicAuth(authHeader);
  if (!credentials) {
    return makeUnauthorizedResponse(request, "Invalid credentials format");
  }

  const userMatch = constantTimeEqual(credentials.username, BASIC_AUTH_USER);
  const passMatch = constantTimeEqual(
    credentials.password,
    BASIC_AUTH_PASSWORD,
  );

  if (!userMatch || !passMatch) {
    return makeUnauthorizedResponse(request, "Invalid credentials");
  }

  // Auth passed — reset the counter for this IP
  const ip = getIP(request);
  const map = getRateLimitMap();
  map.delete(ip);

  return null; // Auth passed
}

export function proxy(request: NextRequest) {
  const response = checkAuth(request);
  if (response) {
    return response;
  }

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
