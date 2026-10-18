# Backend services with Docker Compose

The Compose stack builds and runs a gateway, the auth, notification, and job listing services, and a local RabbitMQ broker. PostgreSQL remains an external dependency configured through each service's `.env` file.

## Configure

Create local environment files from the examples if they do not already exist:

```powershell
Copy-Item auth-service/.env.example auth-service/.env
Copy-Item notification-service/.env.example notification-service/.env
Copy-Item jobListing-service/.env.example jobListing-service/.env
```

Set credentials, URLs, and keys in each service's `.env` file. When PostgreSQL runs on the Windows host, use `host.docker.internal` rather than `localhost` in each `DATABASE_URL`. Auth-service always verifies TLS using the CA certificate at `backend/ca.pem`; notification-service and jobListing-service also load that certificate when `DATABASE_SSL=true`. The CA certificate must be present in the backend directory at image build time.

Compose overrides `RABBITMQ_URL` to use the RabbitMQ container on the Compose network. RabbitMQ's AMQP port is published on `5672`; the management UI is available at `http://localhost:15672`.

The gateway is available at `http://localhost:3000` and forwards requests to the appropriate backend service while preserving their existing API paths. Job listing paths go to jobListing-service, notification API and documentation paths go to notification-service, and remaining paths go to auth-service.
Set the frontend's `VITE_BETTER_AUTH_URL` to `http://localhost:3000` to send auth requests through the gateway. Set auth-service's `BETTER_AUTH_URL` to the same public gateway origin and include the frontend origin in `CORS_ORIGINS`.

## Build and run

From this directory, build the images, apply Better Auth's schema migration, then start the stack:

```powershell
docker compose build
docker compose run --rm auth-service npm run auth:migrate
docker compose up -d
docker compose ps
```

The service health checks are available at:

- Gateway: `http://localhost:3000/health`
- Auth: `http://localhost:3001/api/v1/health`
- Notification: `http://localhost:3002/api/v1/health`
- Job listings: `http://localhost:3003/api/v1/health`
- Notification through gateway: `http://localhost:3000/api/v1/notifications`
- Job listings through gateway: `http://localhost:3000/api/v1/opportunities`
- Apply for a job through gateway: `POST http://localhost:3000/api/v1/opportunities/{id}/applications`
- Notification Swagger UI: `http://localhost:3002/api/v1/docs`
- Notification Swagger UI through gateway: `http://localhost:3000/api/v1/docs`

View logs with `docker compose logs -f gateway-service auth-service notification-service joblisting-service`. Stop the stack with `docker compose down`. To also remove RabbitMQ's persisted data, run `docker compose down -v`.

Notification-service automatically applies its migration during startup. Run the auth migration again after Better Auth schema changes.
JobListing-service automatically applies its idempotent opportunities migration during startup.
