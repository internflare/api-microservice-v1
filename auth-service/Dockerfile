# Install all dependencies needed by the TypeScript build.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY auth-service/package.json auth-service/package-lock.json ./
RUN npm ci

# Compile TypeScript into dist/ inside the image.
FROM dependencies AS build
COPY auth-service/tsconfig.json ./
COPY auth-service/tsconfig.build.json ./
COPY auth-service/src ./src
RUN npm run build

# Keep development-only packages out of the runtime image.
FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY auth-service/package.json auth-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Run the compiled service with development configuration and the shared database CA.
FROM node:22-alpine AS runtime
ENV NODE_ENV=development
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node ca.pem /ca.pem
# Avoid running the service as root inside the container.
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
