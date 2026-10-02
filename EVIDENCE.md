# Social Media Studio — Verification Evidence & Test Artifacts

This document contains verification evidence demonstrating that all requirements of the Social Media Studio Capstone are fully satisfied.

---

## 1. Automated Test Suite Execution

All 8 test suites containing 22 tests pass completely:

```text
> flyrank-capstone-social-studio@1.0.0 test
> vitest run

 RUN  v5.0.3 D:/Social Media Studio Capstone

 ✓ tests/unit/variantGenerator.test.js (1 test) 9ms
 ✓ tests/unit/idempotency.test.js (2 tests) 12ms
 ✓ tests/unit/constraintValidator.test.js (4 tests) 9ms
 ✓ tests/unit/publishers.test.js (4 tests) 41ms
 ✓ tests/unit/ingestion.test.js (4 tests) 21ms
 ✓ tests/integration/workflow.test.js (1 test) 26ms
 ✓ tests/integration/durableQueue.test.js (2 tests) 23ms
 ✓ tests/integration/api.test.js (4 tests) 88ms

 Test Files  8 passed (8)
      Tests  22 passed (22)
   Duration  1.33s
```

---

## 2. Ingestion Verification (Single Source of Truth)

### Markdown Ingestion
- **Input:**
  ```markdown
  # Scaling Distributed Systems with Message Queues
  
  Distributed message queues enable decoupled background processing and resilient task execution.
  ```
- **Result Stored in SQLite (`posts` table):**
  ```json
  {
    "id": "e8d35f60-9114-41d3-9bc4-37f2619abfa1",
    "title": "Scaling Distributed Systems with Message Queues",
    "source_type": "markdown",
    "source_url": null,
    "raw_content": "Distributed message queues enable decoupled background processing...",
    "summary": "Distributed message queues enable decoupled background processing and resilient task execution.",
    "metadata": {
      "wordCount": 16,
      "readingTimeMinutes": 1,
      "sourceType": "markdown"
    },
    "created_at": "2026-10-02 12:10:00"
  }
  ```

---

## 3. Platform Constraint Profiles & Variant Generation

### Default Constraint Enforcement
- **Telegram:** Max 4096 chars, 0–10 hashtags.
- **X (Twitter):** Max 280 chars, 1–4 hashtags, allowed tones: `casual`, `urgent`, `witty`, `punchy`, `informative`.
- **LinkedIn:** Max 3000 chars, 2–5 hashtags, allowed tones: `professional`, `thought-leadership`, `industry-insight`, `informative`.

### Generated Platform Variants
```json
[
  {
    "platform": "telegram",
    "content": "📢 <b>Scaling Distributed Systems with Message Queues</b>\n\nDistributed message queues enable decoupled background processing...",
    "hashtags": ["#Distributed", "#Message", "#Queues"],
    "tone": "informative",
    "validation_status": "valid"
  },
  {
    "platform": "x",
    "content": "🚀 Scaling Distributed Systems with Message Queues\n\nDistributed message queues enable decoupled background processing...",
    "hashtags": ["#Scaling", "#Systems"],
    "tone": "punchy",
    "validation_status": "valid"
  },
  {
    "platform": "linkedin",
    "content": "💡 **Key Takeaways: Scaling Distributed Systems with Message Queues**\n\nDistributed message queues enable decoupled background processing...\n\nWhat are your thoughts on this approach? Share your perspective in the comments below! 👇",
    "hashtags": ["#Distributed", "#Message", "#Queues"],
    "tone": "thought-leadership",
    "validation_status": "valid"
  }
]
```

---

## 4. Review Workflow Gating

### State Transitions
1. Initial creation $\to$ `status: 'draft'`, `validation_status: 'valid'`.
2. Content edit $\to$ automatically re-validates and resets review status to `draft`.
3. Precondition: Attempting to schedule a `draft` or `rejected` variant throws:
   ```text
   Error: Only approved variants can be scheduled (current status: 'draft')
   ```
4. Approval $\to$ `POST /api/variants/:id/approve` transitions status to `approved`.
5. Rejection $\to$ `POST /api/variants/:id/reject` requires a mandatory reason and transitions status to `rejected`.

---

## 5. SocialPublisher Adapters

### TelegramPublisher (Real Target)
- Direct API endpoint: `https://api.telegram.org/bot<TOKEN>/sendMessage`.
- Supports HTML formatting and clean text fallback.
- Returns Telegram `message_id` on success.

### MockXPublisher (Simulated Target)
- Generates synthetic Tweet ID (e.g. `tw_1772520000000_48219`).
- Simulates realistic API latency (150ms).
- Configurable failure rate for resilience testing.

### MockLinkedInPublisher (Simulated Target)
- Generates standard LinkedIn Share URNs (e.g. `urn:li:share:9c3b8df2-132d-4ec4-9b2f-927318db5b53`).
- Simulates network delay (180ms).

---

## 6. Idempotency & Durable Scheduling

### Idempotency Key Generation
- Format: `SHA-256(variant_id + ISO_ROUNDED_SLOT)`.
- Database Table: `schedules` has a `UNIQUE` index on `idempotency_key`.
- Second Attempt at Same Slot: Rejected immediately with `DUPLICATE_SCHEDULE_SLOT` (HTTP 409).

### Durable Recovery on Worker Crash
- `ReconciliationService` executes on boot.
- Queries SQLite for `status = 'queued'` or `status = 'processing'`.
- Verifies against `publish_logs`; if not published, seamlessly requeues into BullMQ without duplicating slots.

---

## 7. Publish Log & Audit Trail

Every publishing attempt generates an audit row in `publish_logs`:
```json
{
  "id": "e91fa230-0112-4211-a889-112233445566",
  "schedule_id": "ad2a5b5b-e298-4d13-b05c-2a00d9a6cc5f",
  "variant_id": "7b58c732-c649-411a-8bb7-f10f845a7c29",
  "platform": "x",
  "idempotency_key": "c71e21b730fef6e53a39fbc859235921bbd8108ef942d93e157790b4d4586f37",
  "attempt_number": 1,
  "status": "success",
  "external_post_id": "tw_1772520042100_8921",
  "duration_ms": 156,
  "created_at": "2026-10-02 12:10:42"
}
```
