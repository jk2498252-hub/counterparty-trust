# Production image: builds the app and runs it with Node.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts
COPY drizzle ./drizzle
COPY scripts ./scripts
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
USER app
ENV UPLOAD_DIR=/data/uploads
EXPOSE 3000
# Apply database migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p ${PORT}"]
