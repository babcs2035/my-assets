# -----------------------------------------------------------------------------
# Base Stage
# -----------------------------------------------------------------------------
FROM node:25.6.1-bookworm AS base
RUN npm install -g pnpm@10.29.3

# -----------------------------------------------------------------------------
# Dependency Stage
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy package files first to leverage cache
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Install dependencies including devDependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder Stage
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy deps from deps stage to avoid reinstalling
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client and build Next.js
RUN pnpm prisma generate
# Compile seed script separately
RUN pnpm tsc prisma/seed.ts --module commonjs --target es2020 --moduleResolution node --skipLibCheck --allowSyntheticDefaultImports
RUN pnpm build

# -----------------------------------------------------------------------------
# Runner Stage
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/app
ENV XDG_CACHE_HOME=/app/.cache
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ="Asia/Tokyo"

# Install system dependencies for Playwright
RUN pnpm dlx playwright@1.58.2 install-deps chromium && \
    pnpm dlx playwright@1.58.2 install chromium

# Prepare user and directories
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p .next .cache $PLAYWRIGHT_BROWSERS_PATH && \
    chown -R nextjs:nodejs .next .cache $PLAYWRIGHT_BROWSERS_PATH

# Install Prisma globally (needed for runtime CLI commands like db push)
RUN pnpm add -g prisma@7.4.0

# Copy application artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files needed for seeding and schema ops
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed.js ./prisma/seed.js
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps --chown=nextjs:nodejs /app/package.json ./package.json

# Fix permissions for cache after global install
RUN chown -R nextjs:nodejs /app/.cache

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "prisma db push --skip-generate && node prisma/seed.js && node server.js"]
