# Social Media Studio — Engineering Build Log

This document records the chronological development, architectural decisions, and trade-off rationales for the **Social Media Studio Capstone**.

---

## 📅 Chronological Milestones

### Milestone 1: Project Scaffolding & Configuration
- Initialized standalone Node.js ES Modules package (`flyrank-capstone-social-studio`).
- Set up strict environment validation using Zod in `src/config/env.js`.
- Configured `.gitignore` and `.env.example`.

### Milestone 2: SQLite Schema & Single Source of Truth
- Configured SQLite with WAL (`Write-Ahead Logging`) mode for fast concurrent operations.
- Enforced foreign keys (`PRAGMA foreign_keys = ON`).
- Designed tables: `posts`, `constraint_profiles`, `post_variants`, `schedules`, and `publish_logs`.
- Seeded default constraint profiles for Telegram, X, and LinkedIn.
- Built clean Repository pattern (`PostsRepository`, `VariantsRepository`, `ProfilesRepository`, `SchedulesRepository`, `PublishLogsRepository`).

### Milestone 3: Ingestion Layer (Markdown & HTML)
- Built `MarkdownIngester`: extracts titles from `#` headers or frontmatter, computes reading times and summaries.
- Built `UrlIngester`: uses Cheerio to extract semantic article body and OpenGraph metadata from live web pages.
- Built `IngestionService` coordinating both sources into the `posts` SSOT.

### Milestone 4: Constraint Profiles & Deterministic Variant Engine
- Implemented `ConstraintValidator` with boundary checks for character length, tone whitelist, and hashtag ranges.
- Implemented `VariantGenerator` with platform-specific template rules (Telegram rich HTML, Twitter/X punchy hook $\le 280$ chars, LinkedIn insight post).
- Ensured deterministic output with zero external paid AI dependencies.

### Milestone 5: Review Workflow & Gating State Machine
- Created review transitions: `draft` $\to$ `approved` / `rejected` $\to$ `published`.
- Enforced gating: only valid variants can be approved; only approved variants can be scheduled or immediately published.
- Edits automatically reset status back to `draft` for re-review.

### Milestone 6: SocialPublisher Adapters & Telegram Integration
- Defined abstract `SocialPublisher` base class.
- Implemented `TelegramPublisher` communicating directly with the real Telegram Bot API via HTTPS.
- Implemented `MockXPublisher` and `MockLinkedInPublisher` with synthetic latency and realistic ID formats.
- Implemented `PublisherRegistry` factory.

### Milestone 7: Durable Queue, Scheduling & Idempotency
- Formulated SHA-256 slot idempotency hashing: `SHA256(variant_id + ISO_ROUNDED_SLOT)`.
- Enforced database `UNIQUE` constraint on `schedules.idempotency_key`.
- Configured BullMQ + Redis delayed queue with a dual-mode fallback (`InMemoryQueue`) for test environments and standalone execution without Redis daemons.
- Implemented `PublishWorker` with atomic claim lock, idempotency check, and audit logging.
- Implemented `ReconciliationService` for recovering pending jobs on worker restarts.

### Milestone 8: REST API Surface & Test Suite
- Assembled Express application with Zod request validation, CORS, and unified error handling.
- Built 8 comprehensive test suites (22 passing tests) using Vitest and Supertest.
- Documented entire architecture, setup, evidence, and build logs.

---

## 💡 Key Architectural Decisions & Trade-offs

1. **SQLite with WAL Mode for SSOT**:
   - *Rationale:* Eliminates database setup complexity while providing strong ACID guarantees, fast reading/writing performance, and native relational constraints.
2. **Dual-Mode Queue Architecture (BullMQ + In-Memory Fallback)**:
   - *Rationale:* Allows seamless zero-dependency local runs and fast automated tests via embedded in-memory scheduling, while maintaining full BullMQ + Redis capability when Redis is connected in production.
3. **Deterministic Template Generator vs. Paid AI APIs**:
   - *Rationale:* Eliminates paid API requirements and token limits while guaranteeing predictable, schema-compliant variant outputs.
4. **SHA-256 Slot Idempotency with Database Lock**:
   - *Rationale:* Multi-layered protection ensures that even in edge cases with concurrent worker triggers or client retries, a variant is published at most once per slot.
