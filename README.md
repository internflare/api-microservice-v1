# Backend services with Docker Compose

The Compose stack builds and runs a gateway, auth, notification, job listing, and profile services, plus a local RabbitMQ broker. PostgreSQL remains an external dependency configured through each service's `.env` file.

## Configure

Create local environment files from the examples if they do not already exist:

```powershell
Copy-Item auth-service/.env.example auth-service/.env
Copy-Item notification-service/.env.example notification-service/.env
Copy-Item jobListing-service/.env.example jobListing-service/.env
Copy-Item profile-service/.env.example profile-service/.env
```

Set credentials, URLs, and keys in each service's `.env` file. When PostgreSQL runs on the Windows host, use `host.docker.internal` rather than `localhost` in each `DATABASE_URL`. Auth-service always verifies TLS using the CA certificate at `backend/ca.pem`; profile, notification, and job-listing services verify TLS against the same CA when `DATABASE_SSL=true` or a TLS-enabled `sslmode` is present in `DATABASE_URL`. The CA certificate must be present in the backend directory at image build time.

Compose overrides `RABBITMQ_URL` to use the RabbitMQ container on the Compose network. Auth, notification, and job listing services wait until RabbitMQ passes its health check before starting. RabbitMQ's AMQP port is published on `5672`; the management UI is available at `http://localhost:15672`.

The gateway is available at `http://localhost:3000` and owns the public `/api/v1` prefix. It removes that prefix before forwarding to backend services, which expose unversioned internal routes. Job listing paths go to jobListing-service, notification paths go to notification-service, company and talent profile paths go to profile-service, and authentication paths go to auth-service. Better Auth endpoints under `/api/auth` pass through unchanged.
Set the frontend's `VITE_API_URL` to `http://localhost:3000` so all API requests go through the gateway. Set auth-service's `BETTER_AUTH_URL` to the same public gateway origin and include the frontend origin in `CORS_ORIGINS`.

## Build and run

From this directory, build the images, apply Better Auth's schema migration, then start the stack:

```powershell
docker compose build
docker compose run --rm auth-service npm run auth:migrate
docker compose up -d
docker compose ps
```

The public, versioned API is available through the gateway. Direct service routes are internal and unversioned:

- Gateway: `http://localhost:3000/health`
- Auth internal health: `http://localhost:3001/health`
- Notification internal health: `http://localhost:3002/health`
- Job listings internal health: `http://localhost:3003/health`
- Profile/company internal health: `http://localhost:3004/health`
- Gateway Swagger UI: `http://localhost:3000/docs`
- Gateway OpenAPI JSON: `http://localhost:3000/openapi.json`
- Auth Swagger UI (internal): `http://localhost:3001/docs`
- Auth OpenAPI JSON (internal): `http://localhost:3001/openapi.json`
- Notification Swagger UI (internal): `http://localhost:3002/docs`
- Notification OpenAPI JSON (internal): `http://localhost:3002/openapi.json`
- Job listing Swagger UI (internal): `http://localhost:3003/docs`
- Job listing OpenAPI JSON (internal): `http://localhost:3003/openapi.json`
- Notification through gateway: `http://localhost:3000/api/v1/notifications`
- Job listings through gateway: `http://localhost:3000/api/v1/opportunities`
- Apply for a job through gateway: `POST http://localhost:3000/api/v1/opportunities/{id}/applications`

View logs with `docker compose logs -f gateway-service auth-service notification-service joblisting-service profile-service`. Stop the stack with `docker compose down`. To also remove RabbitMQ's persisted data, run `docker compose down -v`.

Notification-service automatically applies its migration during startup. Run the auth migration again after Better Auth schema changes.
JobListing-service automatically applies its idempotent opportunities migration during startup.
Profile-service automatically applies its company and talent schema migrations before starting to accept requests.
