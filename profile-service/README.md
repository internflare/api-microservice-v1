# Internflare Profile Service (`profile-service`)

Microservice managing company and talent profiles, company membership and verification, talent profile completeness, and candidate discovery.

## Features

- Company and member management with audit trails and soft removal.
- Company verification submissions, admin decisions, and verification gating.
- Protected internal RPC endpoints for downstream services.
- Remote authentication through `auth-service`.
- Talent profile creation, updates, completeness scoring, and candidate search.

The service listens on unversioned internal routes. Public requests use the gateway's versioned routes, such as `POST http://localhost:3000/api/v1/auth/employer-onboarding` and `GET http://localhost:3000/api/v1/talent/profile/me`; the gateway strips `/api/v1` before forwarding. Talent endpoints retain `/api/talent/*` as a compatibility alias.

## Tech Stack

- Node.js (v22+, ES Modules), TypeScript, Express 4.21
- MongoDB via Mongoose (Atlas supported)
- Zod validation; native `node:test` + `tsx`

## Getting Started

Copy `.env.example` to `.env` and set `MONGODB_URI` to the MongoDB Atlas connection string supplied for the deployment. `MONGODB_DB_NAME` is optional and overrides the database name in the URI. Company and talent collections and indexes are managed by Mongoose; there is no SQL migration step. Multi-document company operations use MongoDB transactions, so use an Atlas replica set or another transaction-capable MongoDB deployment.

The gateway's unified Swagger UI is available at `http://localhost:3000/docs`. Profile-service also serves its talent OpenAPI document at `/openapi.json` and Swagger UI at `/docs` when accessed directly.

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3004
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=internflare
AUTH_SERVICE_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
INTERNAL_SERVICE_SECRET=your-internal-shared-secret-at-least-32-chars
```

### 2. Install Dependencies

```sh
npm install
```

### 3. Run Development Server

```sh
npm run dev
```

The service connects to MongoDB before listening on `http://localhost:3004`. `/health` reports unavailable until MongoDB is connected and responds to a ping.

## Testing & Build

```sh
npm test
npm run type-check
npm run build
```

## Docker

Build the container image:

```sh
docker build -t internflare-profile-service .
```

Run the container:

```sh
docker run -p 3004:3004 --env-file .env internflare-profile-service
```
