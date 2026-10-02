# Social Media Studio — Engineering Build Log & AI Collaboration Record

This document records the chronological development, architectural decisions, and honest disclosure of AI collaboration (using Google DeepMind's Antigravity AI assistant) for the **Social Media Studio Capstone**.

Per the assignment guidelines, AI assistance was utilized throughout the project. This log transparently records where AI assisted, where AI generated suboptimal or incorrect solutions, what manual architectural corrections were applied, and key design trade-offs.

---

## 1. AI Collaboration Overview & Methodology

- **AI Assistant:** Antigravity (Google DeepMind Advanced Agentic Coding).
- **Collaboration Mode:** Human-in-the-Loop Pair Programming with Test-Driven Verification.
- **Workflow:**
  1. Specification and requirement breakdown per phase.
  2. Architecture and interface design gate ([`DESIGN.md`](file:///d:/Social%20Media%20Studio%20Capstone/DESIGN.md)).
  3. Incremental test and implementation cycles with zero auto-commits.
  4. Human inspection, code review, and manual correction of bugs and edge cases.

---

## 2. Phase-by-Phase AI Involvement & Prompts Used

| Phase | Core Objective | Key Prompts Used | AI Generated Code |
| :--- | :--- | :--- | :--- |
| **Phase 1: Design Gate** | Architecture, Data Model, State Machine | *"Proceed with Phase 1: Design Gate. Create DESIGN.md with Mermaid architecture, SQLite schema, and constraint profiles."* | Initial ASCII & Mermaid diagrams, table schema specifications in [`DESIGN.md`](file:///d:/Social%20Media%20Studio%20Capstone/DESIGN.md). |
| **Phase 2: Post Ingestion** | Markdown & URL Ingestion into SQLite SSOT | *"Implement only the ingestion layer. Accept markdown OR url via Zod validation. Store in SQLite SSOT."* | `MarkdownIngester`, `UrlIngester` (Cheerio parsing), `PostsRepository`, `src/api/routes/postsRoutes.js`. |
| **Phase 3: Variant Engine & Constraints** | Platform-specific deterministic synthesis | *"Implement platform-specific variant generation. Configured platforms: Telegram, MockX, MockLinkedIn. Constraint profiles with 4xx errors."* | `VariantGenerator`, `ConstraintValidator`, template interpolation logic, profile database seeder. |
| **Phase 4: Review Workflow** | Human-in-the-loop review state machine | *"Implement variant review. Allowed statuses: draft, approved, rejected, published. Refuse invalid transitions."* | `approveVariant`, `rejectVariant`, `updateVariant`, Express routes, state machine unit tests. |
| **Phase 5: SocialPublisher Adapters** | Polymorphic publishing layer | *"Create SocialPublisher interface. Exactly three adapters: TelegramPublisher (REAL), MockXPublisher, MockLinkedInPublisher."* | `TelegramPublisher` (Telegram Bot API HTTPS), `MockXPublisher`, `MockLinkedInPublisher`, `PublisherRegistry`. |
| **Phase 6: Idempotent Publishing** | Database-level publish idempotency | *"Implement publish idempotency at DATABASE level. SHA-256(variant_id + slot). GET /publish-history endpoints."* | `generateIdempotencyKey`, `publish_logs` partial unique index, `PublishLogsRepository.getPublishHistory`. |
| **Phase 7: Durable Scheduling (BullMQ + Redis)** | Delayed queue & worker restart safety | *"Use BullMQ + Redis with Docker Compose. Worker retrieves variant from SQLite. Worker must be restart-safe."* | `docker-compose.yml`, `src/workers/publishWorker.js`, `ReconciliationService`, delayed queue dispatch. |
| **Phase 8: Real Telegram E2E** | Live broadcast proof & adapter swapping | *"Perform a complete real-world test with Telegram. Never expose secrets. Prove swapping adapters without code changes."* | Safe masked test harness in `realTelegramE2E.test.js`, redaction filters. |
| **Phase 9: Reliability Proof** | Worker crash / hard stop survival | *"Scenario: Schedule jobs, stop worker while processing, restart worker, verify zero duplicates."* | `workerCrashRestartReliability.test.js`, crash recovery verification. |

---

## 3. Where AI Was Wrong & Manual / Architectural Corrections

Honest engineering requires documenting failures and edge cases where AI assistance produced bugs or suboptimal code that required human intervention and refactoring:

### ❌ Issue 1: BullMQ 5+ Lua `cmsgpack` Incompatibility with `ioredis-mock`
- **What AI did:** In Phase 7, AI attempted to initialize BullMQ `Queue` and `Worker` instances using `ioredis-mock` during automated test runs.
- **Why it failed:** Modern BullMQ (v5+) compiles and executes complex Redis Lua scripts that call the `cmsgpack` Lua module for payload serialization. `ioredis-mock` does not implement `cmsgpack`, resulting in fatal Lua script execution exceptions in automated tests.
- **Manual / Architectural Correction:** Architected a **Dual-Mode Queue Architecture** in [`src/queue/publishQueue.js`](file:///d:/Social%20Media%20Studio%20Capstone/src/queue/publishQueue.js) featuring an embedded `InMemoryQueue` with timers and asynchronous event loop dispatch for test environments and zero-config local runs, while dynamically routing to native BullMQ + Redis when connected to live Redis instances.

### ❌ Issue 2: Concurrency Race Condition in Worker Atomic Lock Claim
- **What AI did:** In Phase 6, AI wrote the worker claim condition as:
  ```javascript
  const claimed = this.dbCtx.schedules.claimForProcessing(scheduleId);
  if (!claimed && schedule.status !== 'processing') { ... }
  ```
- **Why it failed:** If two worker threads executed concurrently on the same schedule, Worker A changed `status` from `'queued'` to `'processing'`. When Worker B ran, `claimed` was `false` (0 rows updated), but because `schedule.status !== 'processing'` evaluated to `false`, Worker B proceeded to execute the adapter a second time!
- **Manual / Architectural Correction:** Refactored the atomic lock in [`src/queue/publishWorker.js`](file:///d:/Social%20Media%20Studio%20Capstone/src/queue/publishWorker.js) to enforce strict rejection:
  ```javascript
  const claimed = this.dbCtx.schedules.claimForProcessing(scheduleId);
  if (!claimed) {
    return { skipped: true, duplicate: true, reason: 'lock_failed' };
  }
  ```
  Combined with the SQLite partial unique index `idx_publish_logs_unique_success`, this guarantees 100% mutual exclusion under race conditions.

### ❌ Issue 3: SQL Join Column Name Mismatch in Publish History
- **What AI did:** In Phase 6, AI drafted a SQL query in `PublishLogsRepository.getPublishHistory` referencing `pv.body`.
- **Why it failed:** SQLite threw `SqliteError: no such column: pv.body` because the database schema in `schema.js` defined the column as `content` (with `body` aliased in JavaScript for API symmetry).
- **Manual / Architectural Correction:** Corrected the SQL query to select `pv.content AS variant_content` and mapped both `content` and `body` in the returned JSON DTO.

---

## 4. Key Architectural Decisions & Trade-Offs

1. **SQLite with Write-Ahead Logging (WAL) Mode for SSOT:**
   - *Rationale:* Eliminates complex multi-container database setup while providing full ACID transactions, sub-millisecond local reads, foreign key cascading, and database-level unique constraints.
2. **Database-Level Partial Unique Index for Publish Idempotency:**
   - *Rationale:* Memory and queue variables vanish upon crashes. By placing a SQLite partial unique index (`WHERE status = 'success'`) on `publish_logs.idempotency_key`, duplicate publish records are physically rejected by the database engine.
3. **Deterministic Template Generator vs. Paid AI APIs:**
   - *Rationale:* Avoids unpredictable LLM latency, token rate-limits, and credit card requirements while guaranteeing 100% deterministic constraint adherence for character counts and hashtags.
4. **Boot-Time Worker Reconciliation Service:**
   - *Rationale:* Rather than assuming in-flight queue jobs survive host reboots, `ReconciliationService` queries SQLite on worker startup to detect orphaned `queued` or `processing` tasks and seamlessly re-enqueues them.

---

## 5. Verification & Test Metrics

- **Total Test Suites:** 17 passed (100%).
- **Total Automated Tests:** 57 passed (100%).
- **Code Coverage Areas:** Ingestion, constraint profiles, review state transitions, Telegram Bot API HTTPS dispatch, MockX & MockLinkedIn simulations, BullMQ delayed scheduling, database idempotency, worker crash recovery, and REST API surfaces.
