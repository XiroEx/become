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
ARG _BUILD_SECRET_NPMRC
COPY package.json package-lock.json* ./
# Write .npmrc from the BuildKit secret (preferred — token never lands in layers).
# If the secret mount is empty/absent (workers without redsecrets key), fall back
# to the _BUILD_SECRET_NPMRC build-arg injected by RedRun from the workspace env.
RUN --mount=type=secret,id=npmrc,target=/tmp/npmrc-secret \
    if [ -s /tmp/npmrc-secret ]; then \
      cp /tmp/npmrc-secret .npmrc; \
    elif [ -n "$_BUILD_SECRET_NPMRC" ]; then \
      printf '%s' "$_BUILD_SECRET_NPMRC" > .npmrc; \
    fi && \
    npm install --ignore-scripts && \
    rm -f .npmrc

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
