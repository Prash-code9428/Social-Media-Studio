# Social Media Studio — FlyRank Backend Capstone

[![Test Suite](https://img.shields.io/badge/Tests-22%20passed-brightgreen.svg)](#running-tests)
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

1. **Multi-Source Ingestion**:
   - Ingest from pasted **Markdown** (extracts headers, structured paragraphs, word count, reading time).
   - Ingest from live **URL** (extracts semantic HTML using Cheerio, canonical tags, and OpenGraph metadata).
2. **Single Source of Truth (SSOT)**:
   - Stored in SQLite with Write-Ahead Logging (`WAL`) mode enabled.
3. **Platform-Specific Variants**:
   - Deterministic rule engine tailored for **Telegram**, **X (Twitter)**, and **LinkedIn**.
4. **Constraint Profile Engine**:
   - Enforces character length limits, allowed tones, and hashtag boundaries per platform.
5. **Review Workflow & Moderation Gating**:
   - State machine: `draft` $\to$ `approved` / `rejected` $\to$ `published`.
   - Strict gating: only valid variants can be approved; only approved variants can be scheduled or published.
6. **Polymorphic SocialPublisher Interface**:
   - `TelegramPublisher`: **Real** publishing target using Telegram Bot API.
   - `MockXPublisher`: Simulates tweet publishing with realistic latency and mock tweet IDs.
   - `MockLinkedInPublisher`: Simulates LinkedIn Share URNs and network responses.
7. **Idempotent Publishing**:
   - Deterministic slot key: `SHA-256(variant_id + ISO_ROUNDED_SLOT)`.
   - Multi-layer protection: database unique constraint + worker atomic locks + pre-dispatch log check.
8. **Durable Scheduling & Crash Recovery**:
   - BullMQ delayed queue backed by Redis with dual-mode support (in-memory mock or real Redis).
   - Boot-time `ReconciliationService` automatically recovers orphaned queued jobs on worker restart.
9. **Full Audit History**:
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

The test suite includes 8 test suites covering unit and integration testing across all layers:

```bash
npm test
```

Test coverage includes:
- Markdown and HTML/URL ingestion parsers
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
- `GET /api/health` — Check database status and registered publisher adapters.

### 1. Content Ingestion (`/api/posts`)
- `POST /api/posts/ingest/markdown`
  ```json
  {
    "title": "Scaling Distributed Systems",
    "markdown": "# Scaling Distributed Systems\n\nA guide on message queues and horizontal scale.",
    "metadata": { "author": "Alice" }
  }
  ```
- `POST /api/posts/ingest/url`
  ```json
  {
    "url": "https://example.com/blog/microservices"
  }
  ```
- `GET /api/posts` — List ingested posts (`?limit=20&offset=0`).
- `GET /api/posts/:id` — Get full post details and child variants.

### 2. Variants & Generation (`/api/posts` & `/api/variants`)
- `POST /api/posts/:id/generate-variants`
  ```json
  {
    "platforms": ["telegram", "x", "linkedin"],
    "tone": "informative"
  }
  ```
- `POST /api/posts/:id/variants` — Create custom variant.
- `PATCH /api/variants/:id` — Edit variant content (resets status to `draft` and re-validates).

### 3. Review Workflow (`/api/variants/:id`)
- `POST /api/variants/:id/approve` — Approve variant (requires `valid` validation status).
- `POST /api/variants/:id/reject`
  ```json
  { "reason": "Exceeds desired length for promotional campaign" }
  ```

### 4. Scheduling & Publishing
- `POST /api/variants/:id/schedule`
  ```json
  { "scheduled_time": "2026-10-02T15:00:00Z" }
  ```
- `POST /api/variants/:id/publish-now` — Immediately publish approved variant.
- `GET /api/schedules` — List scheduled slots (`?status=queued|processing|completed|failed`).
- `DELETE /api/schedules/:id` — Cancel pending scheduled job.
- `GET /api/publish-logs` — Query complete publication audit log.

### 5. Constraint Profiles (`/api/profiles`)
- `GET /api/profiles` — List constraint profiles.
- `PUT /api/profiles/:platform` — Update constraint profile limits.

---

## 📂 Project Structure

```
flyrank-capstone-social-studio/
├── .env.example
├── .gitignore
├── package.json
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
        ├── api.test.js
        ├── workflow.test.js
        └── durableQueue.test.js
```
