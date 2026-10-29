# Install dependencies required to compile the service.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY jobListing-service/package.json jobListing-service/package-lock.json ./
RUN npm ci

# Compile TypeScript into dist/ for the runtime image.
FROM dependencies AS build
COPY jobListing-service/tsconfig.json ./
COPY jobListing-service/src ./src
RUN npm run build

# Install only production dependencies for the final image.
FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY jobListing-service/package.json jobListing-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=development
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3003
CMD ["node", "dist/server.js"]
