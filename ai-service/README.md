# Internflare AI Service (`ai-service`)

This service powers AI assessment features for talents after onboarding.

## What it does

- Infers a likely role and level from the talent profile (`skills`, `experience`, and `preferred_roles`).
- Builds each assessment from the question bank (unseen questions that fit the talent's role, level and skills, picked at random) and writes two questions live with OpenAI. If the bank has nothing suitable, every question is generated.
- Saves every generated question to MongoDB so the bank keeps growing and can be re-served to similar users. There is no hardcoded question data.
- Grades responses (including code-focused questions for developer roles).
- Places users into `learning`, `internship`, or `job` pools using score + post-test metrics.
- Publishes an `assessment.completed` event so notification-service can email the result.

## API (service-local)

- `GET /health`
- `GET /docs`
- `GET /openapi.json`
- `GET /ai/assessments/suggestion`
- `POST /ai/assessments`
- `POST /ai/assessments/:id/submit`
- `GET /ai/assessments/:id`
- `GET /ai/assessments`

Gateway routes these as `/api/v1/ai/...`.

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Required environment variables:

- `MONGODB_URI` (MongoDB Atlas connection string; obtain credentials from your deployment owner)
- `OPENAI_API_KEY`
- `RABBITMQ_URL`
- `AUTH_SERVICE_URL`
- `PROFILE_SERVICE_URL`
- `FRONTEND_URL`

Optional:

- `MONGODB_DB_NAME` (database name; otherwise use the name in `MONGODB_URI`)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `MAX_ATTEMPTS_PER_DAY` (default `5`)

## Run

```powershell
npm run dev
```

For production:

```powershell
npm run build
npm start
```
