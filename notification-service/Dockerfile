# Install all dependencies needed by the TypeScript build.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY notification-service/package.json notification-service/package-lock.json ./
RUN npm ci

# Compile TypeScript into dist/ inside the image.
FROM dependencies AS build
COPY notification-service/tsconfig.json ./
COPY notification-service/src ./src
RUN npm run build

# Keep development-only packages out of the runtime image.
FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY notification-service/package.json notification-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Run the compiled service with runtime configuration.
FROM node:22-alpine AS runtime
ENV NODE_ENV=development
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3002
CMD ["node", "dist/server.js"]
