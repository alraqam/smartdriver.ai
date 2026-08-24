FROM node:22-alpine AS build
WORKDIR /app
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
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The seed content ships with the image so a fresh deploy can be populated
# with `npm run content:import` without checking out the repo on the host.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3003
# Migrations run at start rather than at build: the database only exists at
# runtime, and a redeploy must never serve traffic against an old schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
