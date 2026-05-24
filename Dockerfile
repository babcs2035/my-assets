# syntax=docker/dockerfile:1

# ==============================================================================
# Base Stage
# ==============================================================================
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.2.2
WORKDIR /app

# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN echo "node-linker=hoisted" > .npmrc
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# ==============================================================================
# Stage 2: Build the application
# ==============================================================================
FROM base AS build-cache
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
# Node 24 + arm64 does not have the WASM DMMF bug (prisma/prisma#29464)
RUN pnpm exec prisma generate

# Playwright install (Note: Only needed if build process uses it, otherwise move to runner)
# Installing here to ensure binaries are available for copy
RUN pnpm exec playwright install-deps chromium && \
    pnpm exec playwright install chromium

# Build Next.js application
RUN --mount=type=cache,id=nextjs,target=/app/.next/cache pnpm build

# ==============================================================================
# Stage 3: Production runner
# ==============================================================================
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Tokyo
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nextjs/.cache/ms-playwright

# Install system dependencies
RUN apt-get update && apt-get install -y tzdata openssl \
    && pnpm dlx playwright install-deps chromium \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Install global tools (needed for CMD: prisma migrate deploy, seed)
RUN pnpm add -g prisma@7.8.0 tsx@4.21.0

# Copy standalone build
COPY --from=build-cache --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build-cache --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build-cache --chown=nextjs:nodejs /app/public ./public
COPY --from=build-cache --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build-cache --chown=nextjs:nodejs /app/prisma.config.ts ./
# Copy node_modules for prisma/config and @prisma/config subpath imports (needed by prisma.config.ts)
COPY --from=build-cache --chown=nextjs:nodejs /app/node_modules ./node_modules
# Copy Playwright binaries
COPY --from=build-cache --chown=nextjs:nodejs /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright

# Setup permissions
RUN mkdir -p .cache /pnpm && chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm

# Switch to non-root user
USER nextjs

EXPOSE 3000

CMD ["/bin/sh", "-c", "prisma migrate deploy 2>&1 || true && tsx prisma/seed.ts && node server.js"]
