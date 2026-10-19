# Internflare Talent Service (`talent-service`)

Autonomous microservice managing Talent Profile CRUD, Completeness Scoring Engine, and Candidate Discovery for the Internflare platform (US-01, PRD §4.1).

---

## Features

- **Talent Profile CRUD:** Complete lifecycle management for talent candidate profiles, capturing basic info, contact details, country/location, career goals, availability, work arrangement preferences, and CV uploads.
- **Pure Completeness Scoring Engine (PRD §4.1 / US-01):**
  - Real-time deterministic 100% weighted completeness calculation.
  - Generates detailed scoring breakdown and actionable `missing_fields` list (with friendly labels and individual weight percentages).
  - Dynamic `next_prompt` banner advice tailored to help talents increase profile completeness and discoverability.
- **Nested Rich Curriculum (JSONB):**
  - Flexible `education` and `experience` records stored in PostgreSQL `JSONB` format with strict schema validation.
- **Fast Candidate Filtering (GIN Indexing):**
  - PostgreSQL Generalized Inverted Indexes (`GIN`) on `skills` and `preferred_roles` for high-throughput candidate searches using PostgreSQL array containment.
- **Decoupled Auth Handshake:**
  - Remote session validation against `auth-service` (`/api/auth/get-session`) with mock user support (`x-test-user-id`) for automated testing.
- **API Gateway Routing:**
  - Transparently proxied by `gateway-service` on port `3000` via `/api/v1/talent/*`.

---

## Tech Stack

- **Runtime:** Node.js (v22+, ES Modules)
- **Language:** TypeScript 5.7+
- **Framework:** Express 4.21
- **Database:** PostgreSQL (`pg` pool with SSL support)
- **Validation:** Zod 3.24
- **Testing:** Native `node:test` + `tsx` (33 passing unit and integration tests)

---

## Completeness Scoring Formula (100% Total)

| Section | Weight | Criteria | Missing Field Prompt |
| :--- | :---: | :--- | :--- |
| **Basic Info** | **15%** | `full_name` (10%) & `headline` (5%) | Full Name, Professional Headline |
| **Contact & Location** | **15%** | `phone` (5%), `country` (5%), `location` (5%) | Phone Number, Country, City/Location |
| **Skills** | **15%** | $\ge 3$ skills (5% per skill up to 15%) | Skills (add at least 3) |
| **Preferred Roles** | **10%** | $\ge 1$ preferred role | Preferred Roles |
| **Education History** | **15%** | $\ge 1$ valid entry (institution & degree) | Education History |
| **Work Experience** | **15%** | $\ge 1$ valid entry (company & title) | Work Experience |
| **Preferences & Goals** | **10%** | `availability` (3%), `work_arrangement_pref` (3%), `career_goals` (4%) | Availability, Work Arrangement, Career Goals |
| **CV Upload** | **5%** | Valid URL present in `cv_url` | CV / Resume Upload |

---

## Directory Structure

```
talent-service/
├── src/
│   ├── config.ts                          # Validated environment configuration (Port 3005)
│   ├── app.ts                             # Express application & router mounting
│   ├── server.ts                          # Server bootstrap & graceful shutdown
│   ├── db/
│   │   ├── pool.ts                        # PostgreSQL connection pool with SSL
│   │   ├── migrate.ts                     # Transactional migration runner
│   │   └── migrations/
│   │       └── 001_create_talent_profiles.sql # DDL with GIN & B-tree indexes
│   ├── types/
│   │   ├── express.d.ts                   # Express Request augmentation
│   │   └── talent.types.ts                # Domain types & interfaces
│   ├── validators/
│   │   └── talent.validator.ts            # Zod validation schemas
│   ├── services/
│   │   └── completeness.service.ts        # Pure completeness score engine
│   ├── middleware/
│   │   └── auth.ts                        # Remote session introspection
│   ├── models/
│   │   └── talent.model.ts                # Upsert, queries, and search logic
│   ├── controllers/
│   │   └── talent.controller.ts           # REST endpoint handlers
│   └── routes/
│       └── talent.routes.ts               # Endpoint routing declarations
├── tests/
│   ├── setup.ts                           # Test environment initializers
│   └── talent.test.ts                     # Consolidated test suite across all 5 suites
├── Dockerfile                             # Multi-stage production container build
├── tsconfig.json                          # Base TypeScript configuration
├── tsconfig.build.json                    # Production build configuration
├── .gitignore                             # Git exclusion (.env protected)
└── package.json
```

---

## API Reference

All requests through the API Gateway use prefix `/api/v1/talent`.

### 1. Create or Initialize Talent Profile
* **Endpoint:** `POST /api/v1/talent/profile`
* **Auth:** Required (Talent Session)
* **Payload Example:**
```json
{
  "full_name": "Jane Developer",
  "headline": "Senior Full-Stack Engineer",
  "phone": "+1234567890",
  "country": "US",
  "location": "San Francisco, CA",
  "skills": ["TypeScript", "Node.js", "PostgreSQL"],
  "preferred_roles": ["Full-Stack Engineer", "Backend Developer"],
  "education": [
    {
      "institution": "Stanford University",
      "degree": "B.S. Computer Science",
      "field_of_study": "Software Systems",
      "start_year": 2018,
      "end_year": 2022
    }
  ],
  "experience": [
    {
      "company": "Tech Corp",
      "title": "Software Engineer",
      "start_date": "2022-06",
      "current": true,
      "description": "Building microservices"
    }
  ],
  "availability": "immediate",
  "work_arrangement_pref": "remote",
  "career_goals": "Looking to grow into architectural leadership roles.",
  "cv_url": "https://storage.internflare.com/cvs/jane_cv.pdf"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "profile": { ... },
    "completeness": {
      "score": 100,
      "missing_fields": [],
      "next_prompt": null,
      "breakdown": {
        "basic_info": 15,
        "contact_location": 15,
        "skills": 15,
        "preferred_roles": 10,
        "education": 15,
        "experience": 15,
        "preferences_goals": 10,
        "cv_url": 5
      }
    }
  }
}
```

### 2. Get My Profile & Completeness Breakdown
* **Endpoint:** `GET /api/v1/talent/profile/me`
* **Auth:** Required (Talent Session)
* **Response:** Returns logged-in user's profile with detailed completeness calculation and missing fields.

### 3. Update Profile
* **Endpoint:** `PATCH /api/v1/talent/profile/me`
* **Auth:** Required (Talent Session)
* **Payload:** Any partial subset of fields. Completeness score automatically recalculates.

### 4. Public Profile by ID
* **Endpoint:** `GET /api/v1/talent/profile/:id`
* **Auth:** Public / Recruiter

### 5. Talent Directory Discovery
* **Endpoint:** `GET /api/v1/talent/profiles?skills=TypeScript,Node.js&country=US&availability=immediate`
* **Auth:** Public / Recruiter
* **Query Parameters:**
  - `skills`: Comma-separated list or array
  - `country`: String
  - `availability`: String (`immediate`, `2_weeks`, etc.)
  - `work_arrangement_pref`: String (`remote`, `hybrid`, `onsite`, `any`)
  - `min_completeness`: Number (0–100)
  - `limit`: Number (default: 20)
  - `offset`: Number (default: 0)

---

## Getting Started

### 1. Environment Setup
```sh
cp .env.example .env
```
Ensure configuration matches:
```env
PORT=3005
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/internflare
DATABASE_SSL=false
AUTH_SERVICE_URL=http://localhost:3001
INTERNAL_SERVICE_SECRET=your-shared-secret
```

### 2. Run Database Migrations
```sh
npm run db:migrate
```

### 3. Run Automated Tests
```sh
npm test
```

### 4. Run Development Server
```sh
npm run dev
```
Service runs on port `3005`.
