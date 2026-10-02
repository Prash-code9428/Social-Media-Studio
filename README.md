# Social Media Studio — FlyRank Backend Capstone

[![Test Suite](https://img.shields.io/badge/Tests-29%20passed-brightgreen.svg)](#running-tests)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-blue.svg)](https://nodejs.org)
[![Database](https://img.shields.io/badge/SQLite-better--sqlite3-blue.svg)](https://github.com/WiseLibs/better-sqlite3)
[![Queue](https://img.shields.io/badge/Queue-BullMQ%20%2B%20Redis-red.svg)](https://bullmq.io)

**Social Media Studio** is an enterprise-grade backend service that automates blog post ingestion, platform-specific variant adaptation, constraint validation, human-in-the-loop review workflow, and durable scheduled publishing across social channels.

---

## 🏛️ System Architecture

The service follows a modular Hexagonal / Layered Architecture:

```
                  ┌──────────────────────────────────────────────┐
                  │              REST API (Express)              │
                  │   - Zod Request Validation & Error Handling │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │               Core Services                  │
                  │  - IngestionService (URL & Markdown)         │
                  │  - VariantEngine (Deterministic Templates)   │
                  │  - ConstraintValidator (Platform Rules)      │
                  │  - SocialStudioService (Review Workflow)     │
                  │  - ReconciliationService (Durable Recovery)  │
                  └──────────────┬────────────────────────┬──────┘
                                 │                        │
         ┌───────────────────────▼────────┐     ┌─────────▼────────────────────────┐
         │       Data Access Layer        │     │         Durable Worker           │
         │  (SQLite via better-sqlite3)   │     │    (BullMQ + Redis Task Runner)  │
         │  - Posts, Variants, Profiles,  │     └─────────────────┬────────────────┘
         │    Schedules, Publish Logs     │                       │
         └────────────────────────────────┘             ┌─────────▼────────────────┐
                                                        │ SocialPublisher Adapters │
                                                        │  ├─ TelegramPublisher   │
                                                        │  ├─ MockXPublisher       │
                                                        │  └─ MockLinkedInPublisher│
                                                        └──────────────────────────┘
```

---

## ✨ Core Features

1. **Multi-Source Ingestion & SSOT**:
   - `POST /posts` accepting **either** Markdown or URL (strictly mutually exclusive).
   - Ingest from pasted **Markdown** (extracts headers, structured paragraphs, word count, reading time).
   - Ingest from live **URL** (extracts semantic HTML using Cheerio, canonical tags, and OpenGraph metadata).
   - Stored in SQLite with Write-Ahead Logging (`WAL`) mode as the **ONLY** source of truth.
   - Variant generation reads strictly from stored SQLite records and never directly fetches external URLs.
2. **Platform-Specific Variants**:
   - Deterministic rule engine tailored for **Telegram**, **X (Twitter)**, and **LinkedIn**.
3. **Constraint Profile Engine**:
   - Enforces character length limits, allowed tones, and hashtag boundaries per platform.
4. **Review Workflow & Moderation Gating**:
   - State machine: `draft` $\to$ `approved` / `rejected` $\to$ `published`.
   - Strict gating: only valid variants can be approved; only approved variants can be scheduled or published.
5. **Polymorphic SocialPublisher Interface**:
   - `TelegramPublisher`: **Real** publishing target using Telegram Bot API.
   - `MockXPublisher`: Simulates tweet publishing with realistic latency and mock tweet IDs.
   - `MockLinkedInPublisher`: Simulates LinkedIn Share URNs and network responses.
6. **Idempotent Publishing**:
   - Deterministic slot key: `SHA-256(variant_id + ISO_ROUNDED_SLOT)`.
   - Multi-layer protection: database unique constraint + worker atomic locks + pre-dispatch log check.
7. **Durable Scheduling & Crash Recovery**:
   - BullMQ delayed queue backed by Redis with dual-mode support (in-memory mock or real Redis).
   - Boot-time `ReconciliationService` automatically recovers orphaned queued jobs on worker restart.
8. **Full Audit History**:
   - Detailed `publish_logs` storing external post IDs, payloads, response times, and failure diagnostics.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js v20+ or v24+
- (Optional) Redis server (if running with external Redis; default uses zero-config in-memory Redis mode)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment variables:
```env
PORT=3000
NODE_ENV=development
DATABASE_PATH=./data/social_studio.sqlite
USE_IN_MEMORY_REDIS=true

# Real Telegram Publisher (Optional - provide to dispatch to real channel)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-1001234567890
```

### 4. Run Server & Worker
```bash
# Start API Server (includes embedded worker & reconciliation)
npm start

# Or start in development mode with auto-reload
npm run dev

# Or start standalone worker
npm run worker
```

---

## 🧪 Running Tests

The test suite includes 10 test suites covering unit and integration testing across all layers:

```bash
npm test
```

Test coverage includes:
- Markdown and HTML/URL ingestion parsers
- Unified `POST /posts` validation (Markdown, URL, mutual exclusion, malformed URL, missing body)
- Single Source of Truth persistence in SQLite
- Platform constraint profiles and boundary checks
- Deterministic variant generator
- Social publisher adapters (Telegram, X, LinkedIn)
- SHA-256 slot idempotency hashing
- Review workflow gating and state transitions
- Durable queue crash recovery and reconciliation
- REST API Supertest integration

---

## 📖 REST API Reference

### Health Check
- `GET /api/health` or `GET /health` — Check database status and registered publisher adapters.

### 1. Content Ingestion & Storage (`/posts`)

#### Ingest Post (`POST /posts` or `POST /api/posts`)
Accepts **either** `markdown` or `url` (exactly one is required).

- **Markdown Ingestion Request:**
  ```json
  {
    "markdown": "# Scaling Distributed Systems\n\nA guide on message queues and horizontal scale."
  }
  ```
- **URL Ingestion Request:**
  ```json
  {
    "url": "https://example.com/blog/microservices"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "7b8f9e01-2345-6789-abcd-ef0123456789",
      "title": "Scaling Distributed Systems",
      "source_type": "markdown",
      "source_url": null,
      "content": "A guide on message queues and horizontal scale.",
      "summary": "A guide on message queues and horizontal scale.",
      "metadata": {
        "wordCount": 9,
        "readingTimeMinutes": 1,
        "sourceType": "markdown"
      },
      "created_at": "2026-10-02 12:15:00",
      "updated_at": "2026-10-02 12:15:00"
    }
  }
  ```

- **Validation Errors (400 Bad Request):**
  - If neither `markdown` nor `url` is provided $\to$ returns `Validation failed: Exactly one input source is required`.
  - If both `markdown` and `url` are provided $\to$ returns `Validation failed: Cannot provide both "markdown" and "url"`.
  - If `url` is malformed $\to$ returns `Validation failed: Invalid URL format`.

#### List Ingested Posts (`GET /posts` or `GET /api/posts`)
- **Query Parameters:** `?limit=20&offset=0`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "7b8f9e01-2345-6789-abcd-ef0123456789",
        "title": "Scaling Distributed Systems",
        "source_type": "markdown",
        "source_url": null,
        "content": "A guide on message queues...",
        "created_at": "2026-10-02 12:15:00",
        "updated_at": "2026-10-02 12:15:00"
      }
    ]
  }
  ```

#### Get Single Post by ID (`GET /posts/:id` or `GET /api/posts/:id`)
- **Response (200 OK):** Returns full post record including child variants.
- **Response (404 Not Found):** Returns `{ "success": false, "error": { "message": "Post not found with ID: ...", "code": "NOT_FOUND" } }`.

---

### 2. Variants & Generation (`/posts` & `/variants`)
- `POST /posts/:id/generate-variants`
  ```json
  {
    "platforms": ["telegram", "x", "linkedin"],
    "tone": "informative"
  }
  ```
- `POST /posts/:id/variants` — Create custom variant.
- `PATCH /variants/:id` — Edit variant content (resets status to `draft` and re-validates).

### 3. Review Workflow (`/variants/:id`)
- `POST /variants/:id/approve` — Approve variant (requires `valid` validation status).
- `POST /variants/:id/reject`
  ```json
  { "reason": "Exceeds desired length for promotional campaign" }
  ```

### 4. Scheduling & Publishing
- `POST /variants/:id/schedule`
  ```json
  { "scheduled_time": "2026-10-02T15:00:00Z" }
  ```
- `POST /variants/:id/publish-now` — Immediately publish approved variant.
- `GET /schedules` — List scheduled slots (`?status=queued|processing|completed|failed`).
- `DELETE /schedules/:id` — Cancel pending scheduled job.
- `GET /publish-logs` — Query complete publication audit log.

### 5. Constraint Profiles (`/profiles`)
- `GET /profiles` — List constraint profiles.
- `PUT /profiles/:platform` — Update constraint profile limits.

---

## 📂 Project Structure

```
flyrank-capstone-social-studio/
├── .env.example
├── .gitignore
├── package.json
├── DESIGN.md
├── README.md
├── EVIDENCE.md
├── BUILDLOG.md
├── src/
│   ├── config/
│   │   ├── constants.js          # Default profiles, statuses, platform names
│   │   └── env.js                # Zod environment variable schema
│   ├── db/
│   │   ├── connection.js         # SQLite WAL mode connection
│   │   ├── schema.js             # DDL and auto-migrations
│   │   ├── index.js              # Database context & repositories factory
│   │   ├── postsRepository.js
│   │   ├── profilesRepository.js
│   │   ├── variantsRepository.js
│   │   ├── schedulesRepository.js
│   │   └── publishLogsRepository.js
│   ├── ingestion/
│   │   ├── markdownIngester.js   # Markdown title & paragraph extractor
│   │   ├── urlIngester.js        # Cheerio HTML scraper
│   │   └── ingestionService.js
│   ├── variants/
│   │   ├── constraintValidator.js # Constraint rules engine
│   │   └── variantGenerator.js    # Deterministic variant generator
│   ├── publishers/
│   │   ├── socialPublisher.js     # Abstract base adapter class
│   │   ├── telegramPublisher.js   # Real Telegram Bot API target
│   │   ├── mockXPublisher.js      # Mock Twitter/X publisher
│   │   ├── mockLinkedInPublisher.js # Mock LinkedIn publisher
│   │   └── publisherRegistry.js   # Adapter factory registry
│   ├── queue/
│   │   ├── idempotency.js         # SHA-256 slot key generator
│   │   ├── redisClient.js         # Redis & Mock connection factory
│   │   ├── publishQueue.js        # BullMQ / In-Memory delayed queue
│   │   ├── publishWorker.js       # Atomic claim & job executor
│   │   └── reconciliationService.js # Crash recovery coordinator
│   ├── services/
│   │   └── socialStudioService.js # High-level domain orchestrator
│   ├── api/
│   │   ├── middleware/
│   │   │   ├── validator.js       # Zod route validator
│   │   │   └── errorHandler.js    # Central error handler
│   │   ├── routes/
│   │   │   ├── postsRoutes.js
│   │   │   ├── variantsRoutes.js
│   │   │   ├── profilesRoutes.js
│   │   │   ├── schedulesRoutes.js
│   │   │   ├── publishRoutes.js
│   │   │   └── healthRoutes.js
│   │   └── app.js                 # Express app setup
│   ├── server.js                  # Main server entrypoint
│   └── worker.js                  # Standalone worker entrypoint
└── tests/
    ├── unit/
    │   ├── ingestion.test.js
    │   ├── constraintValidator.test.js
    │   ├── variantGenerator.test.js
    │   ├── publishers.test.js
    │   └── idempotency.test.js
    └── integration/
        ├── ingestionApi.test.js   # Phase 2 Ingestion endpoint tests
        ├── sqlitePersistence.test.js # SQLite disk SSOT tests
        ├── api.test.js
        ├── workflow.test.js
        └── durableQueue.test.js
```
