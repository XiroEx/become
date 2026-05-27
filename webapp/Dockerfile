# syntax=docker/dockerfile:1

# Multi-stage build for the Become webapp (Next.js).
# Mirrors what redrun's generateDockerfile() emits for Next.js, but adds a
# BuildKit secret mount for .npmrc so the @redbtn private-registry auth
# token never lands in image layers, ENV, or docker history. The secret is
# backed by the workspace env var `_BUILD_SECRET_NPMRC`.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN --mount=type=secret,id=npmrc,target=/app/.npmrc \
    npm install --ignore-scripts

# --- builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Inject Next.js `output: 'standalone'` if not already configured.
RUN node -e "const fs=require('fs'); \
  for(const f of ['next.config.ts','next.config.mts','next.config.js','next.config.mjs']){ \
    if(!fs.existsSync(f)) continue; \
    let c=fs.readFileSync(f,'utf8'); \
    if(c.includes('standalone')){console.log(f+' already has standalone');break;} \
    c=c.replace(/(=\s*{)/,'\$1\\noutput:\"standalone\",'); \
    fs.writeFileSync(f,c); console.log('Injected standalone into '+f); break; \
  }"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
