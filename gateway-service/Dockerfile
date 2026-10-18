# Install the dependencies needed to compile the TypeScript gateway.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY gateway-service/package.json gateway-service/package-lock.json ./
RUN npm ci

# Compile the gateway into dist/ for the runtime image.
FROM dependencies AS build
COPY gateway-service/tsconfig.json ./
COPY gateway-service/src ./src
RUN npm run build

# Keep development-only packages out of the runtime image.
FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY gateway-service/package.json gateway-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=development
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
