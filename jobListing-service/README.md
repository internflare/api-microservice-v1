# Internflare Job Listing Service

This service stores and searches job, internship, and other opportunity records in PostgreSQL. It publishes durable RabbitMQ events consumed by notification-service.

## Configure

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` to the PostgreSQL database for opportunities. If the database requires TLS, set `DATABASE_SSL=true`; the service validates the connection using `backend/ca.pem`. Set `RABBITMQ_URL` to the shared RabbitMQ broker. `FRONTEND_URL` is used to construct links in notification emails.

## Routes

- `GET /api/v1/health` checks PostgreSQL and RabbitMQ connectivity.
- `GET /api/v1/opportunities` lists opportunities with pagination, sorting, search, and filters.
- `GET /api/v1/opportunities/:id` returns one opportunity.
- `POST /api/v1/opportunities` creates an opportunity and queues a job-posted notification when follower recipients are provided.
- `POST /api/v1/opportunities/:id/applications` queues an email notification to the hiring contact.

List query parameters include `page`, `page_size` (maximum 100), `sort_by` (`created_at`, `updated_at`, `application_deadline`, `start_date`, or `title`), `sort_order` (`asc` or `desc`), `opportunity_type`, `employment_type`, `experience_level`, `work_arrangement`, `country`, `status`, `is_paid`, `search`, `skills` (comma-separated), and `company_id`.

URL query parsing, validation, pagination offsets, sorting metadata, and filter normalization are handled by the `OpportunityQuery` class. Page numbers are limited to 1,000,000 and page sizes to 100.

Example: `GET /api/v1/opportunities?page=2&page_size=10&opportunity_type=internship&sort_by=created_at&sort_order=desc`.

The opportunity request uses the snake_case fields in the `opportunities` table schema. In addition, `follower_recipients` may be supplied as an array of `{ "email": "...", "name": "..." }` values. This is an integration placeholder: the service does not yet have access to company-follow relationships, so the trusted caller must supply the current followers. Connect this field to the company/follower data source before relying on it for production delivery.

The application-notification route accepts `applicant_name`, `applicant_email`, `company_email`, and optional `company_contact_name`. `company_email` is a placeholder until the company record integration can resolve the hiring contact. This route queues only the notification; it does not persist an application. Application storage and idempotency should be handled by the application service.

Events are sent to the shared durable `internflare.notifications` queue using publisher confirms. Notification-service dispatches them by `eventType` alongside account signup events and sends the requested emails. RabbitMQ delivery is at-least-once, so a transient delivery failure can result in a duplicate email on retry.

## Run locally

```powershell
npm install
npm run dev
```

The service applies its idempotent opportunity-table migration at startup. Run `npm run db:migrate` to apply it separately. `npm run type-check` validates the TypeScript project without emitting files.
