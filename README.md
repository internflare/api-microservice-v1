# Backend services with Docker Compose

The Compose stack builds and runs a gateway, the auth and notification services, and a local RabbitMQ broker. PostgreSQL remains an external dependency configured through each service's `.env` file.

## Configure

Create local environment files from the examples if they do not already exist:

```powershell
Copy-Item auth-service/.env.example auth-service/.env
Copy-Item notification-service/.env.example notification-service/.env
```

Set credentials, URLs, and keys in both files. When PostgreSQL runs on the Windows host, use `host.docker.internal` rather than `localhost` in each `DATABASE_URL`. Auth-service always verifies TLS using the CA certificate at `backend/ca.pem`. Notification-service also loads that certificate when `DATABASE_SSL=true`. The CA certificate must be present in the backend directory at image build time.

Compose overrides `RABBITMQ_URL` to use the RabbitMQ container on the Compose network. RabbitMQ's AMQP port is published on `5672`; the management UI is available at `http://localhost:15672`.

The gateway is available at `http://localhost:3000` and forwards requests to auth-service or notification-service while preserving their existing API paths. Notification API and documentation paths are routed to notification-service; other paths are routed to auth-service.
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
- Notification through gateway: `http://localhost:3000/api/v1/notifications`
- Notification Swagger UI: `http://localhost:3002/api/v1/docs`
- Notification Swagger UI through gateway: `http://localhost:3000/api/v1/docs`

View logs with `docker compose logs -f gateway-service auth-service notification-service`. Stop the stack with `docker compose down`. To also remove RabbitMQ's persisted data, run `docker compose down -v`.

Notification-service automatically applies its migration during startup. Run the auth migration again after Better Auth schema changes.
