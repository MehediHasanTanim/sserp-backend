FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget openssl \
  && addgroup -S sserp && adduser -S sserp -G sserp
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docker ./docker
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN chmod +x /app/docker/api-entrypoint.sh \
  && chown -R sserp:sserp /app
USER sserp
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/docker/api-entrypoint.sh"]
