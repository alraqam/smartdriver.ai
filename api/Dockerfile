FROM node:22-alpine AS build
WORKDIR /app
# Prisma needs openssl present to pick its query engine. Without it, Alpine
# makes it fall back to the openssl-1.1.x engine while schema.prisma asks for
# linux-musl-openssl-3.0.x, and the mismatch only shows up at runtime as a
# failure to connect.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
# `npm ci` runs prisma's postinstall, which needs the schema — hence copying
# prisma/ before installing.
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma needs openssl present to pick its query engine. Without it, Alpine
# makes it fall back to the openssl-1.1.x engine while schema.prisma asks for
# linux-musl-openssl-3.0.x, and the mismatch only shows up at runtime as a
# failure to connect.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The generated Prisma client. Built in the build stage against this image's
# platform, so it must be carried over rather than regenerated.
#
# Seed content is deliberately NOT in the image: content/ lives outside this
# build context, and the runtime stage has no ts-node anyway. A deployed
# instance loads content through POST /api/admin/import instead.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3003
# Migrations run at start rather than at build: the database only exists at
# runtime, and a redeploy must never serve traffic against an old schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
