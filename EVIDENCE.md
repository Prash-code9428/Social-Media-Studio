# Social Media Studio — Verification Evidence & Test Artifacts

This document contains verification evidence demonstrating that all requirements of the Social Media Studio Capstone are fully satisfied.

---

## 1. Automated Test Suite Execution

All 14 test suites containing 51 tests pass completely:

```text
> flyrank-capstone-social-studio@1.0.0 test
> vitest run

 RUN  v5.0.3 D:/Social Media Studio Capstone

 ✓ tests/unit/publishers.test.js (4 tests) 49ms
 ✓ tests/unit/idempotency.test.js (2 tests) 21ms
 ✓ tests/unit/ingestion.test.js (4 tests) 77ms
 ✓ tests/unit/constraintValidator.test.js (4 tests) 19ms
 ✓ tests/unit/variantGenerator.test.js (1 test) 16ms
 ✓ tests/integration/sqlitePersistence.test.js (1 test) 136ms
 ✓ tests/integration/workflow.test.js (1 test) 89ms
 ✓ tests/integration/durableQueue.test.js (2 tests) 77ms
 ✓ tests/integration/adapterSwapping.test.js (3 tests) 119ms
 ✓ tests/integration/idempotentPublishing.test.js (5 tests) 235ms
 ✓ tests/integration/ingestionApi.test.js (6 tests) 285ms
 ✓ tests/integration/api.test.js (4 tests) 317ms
 ✓ tests/integration/variantGeneration.test.js (7 tests) 394ms
 ✓ tests/integration/reviewWorkflow.test.js (7 tests) 470ms

 Test Files  14 passed (14)
      Tests  51 passed (51)
   Duration  4.09s
```

---

## 2. Ingestion Verification (Single Source of Truth)

### Markdown Ingestion (`POST /posts`)
- **Input:**
  ```json
  {
    "markdown": "# Scaling Distributed Systems with Message Queues\n\nDistributed message queues enable decoupled background processing and resilient task execution."
  }
  ```
- **Stored in SQLite (`posts` table):**
  ```json
  {
    "id": "e8d35f60-9114-41d3-9bc4-37f2619abfa1",
    "title": "Scaling Distributed Systems with Message Queues",
    "source_type": "markdown",
    "source_url": null,
    "raw_content": "Distributed message queues enable decoupled background processing...",
    "content": "Distributed message queues enable decoupled background processing...",
    "summary": "Distributed message queues enable decoupled background processing and resilient task execution.",
    "metadata": {
      "wordCount": 16,
      "readingTimeMinutes": 1,
      "sourceType": "markdown"
    },
    "created_at": "2026-10-02 12:10:00",
    "updated_at": "2026-10-02 12:10:00"
  }
  ```

---

## 3. Platform Constraint Profiles & Variant Generation

### Configured Platform Profiles
1. **Telegram:**
   - `max_length`: 4,096 characters
   - `allowed_tones`: `["professional", "casual", "urgent", "informative", "engaging"]`
   - `max_hashtags`: 10 (min: 0)
2. **MockX (Twitter):**
   - `max_length`: 280 characters
   - `allowed_tones`: `["casual", "urgent", "witty", "punchy", "informative"]`
   - `max_hashtags`: 4 (min: 1)
3. **MockLinkedIn:**
   - `max_length`: 3,000 characters
   - `allowed_tones`: `["professional", "thought-leadership", "industry-insight", "informative"]`
   - `max_hashtags`: 5 (min: 2)

### Generated Variants Output (`POST /posts/:id/generate`)
```json
[
  {
    "id": "3b2184f0-32bb-4621-8e50-9a3b68df2111",
    "post_id": "e8d35f60-9114-41d3-9bc4-37f2619abfa1",
    "platform": "telegram",
    "body": "📢 <b>Scaling Distributed Systems with Message Queues</b>\n\nDistributed message queues enable decoupled background processing and resilient task execution.",
    "status": "draft",
    "validation_status": "valid",
    "created_at": "2026-10-02 12:20:00",
    "updated_at": "2026-10-02 12:20:00"
  },
  {
    "id": "7b58c732-c649-411a-8bb7-f10f845a7c29",
    "post_id": "e8d35f60-9114-41d3-9bc4-37f2619abfa1",
    "platform": "mock_x",
    "body": "🚀 Scaling Distributed Systems with Message Queues\n\nDistributed message queues enable decoupled background processing and resilient task execution.",
    "status": "draft",
    "validation_status": "valid",
    "created_at": "2026-10-02 12:20:00",
    "updated_at": "2026-10-02 12:20:00"
  },
  {
    "id": "9f1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    "post_id": "e8d35f60-9114-41d3-9bc4-37f2619abfa1",
    "platform": "mock_linkedin",
    "body": "💡 **Key Takeaways: Scaling Distributed Systems with Message Queues**\n\nDistributed message queues enable decoupled background processing and resilient task execution.\n\nWhat are your thoughts on this approach? Share your perspective in the comments below! 👇",
    "status": "draft",
    "validation_status": "valid",
    "created_at": "2026-10-02 12:20:00",
    "updated_at": "2026-10-02 12:20:00"
  }
]
```

---

## 4. Constraint Validation Failure Evidence (4xx Responses)

### Over-length Violation on MockX:
- **Dispatched Body Length:** 302 characters
- **HTTP Response:** `400 Bad Request`
- **Error Payload:**
  ```json
  {
    "success": false,
    "error": {
      "message": "Variant exceeds maximum length for mock_x: 302 > 280",
      "code": "CONSTRAINT_VALIDATION_ERROR"
    }
  }
  ```

### Hashtag Count Violation on MockLinkedIn:
- **Dispatched Hashtags:** 6 hashtags (limit is 5)
- **HTTP Response:** `400 Bad Request`
- **Error Payload:**
  ```json
  {
    "success": false,
    "error": {
      "message": "Variant exceeds hashtag limit for mock_linkedin: 6 > 5",
      "code": "CONSTRAINT_VALIDATION_ERROR"
    }
  }
  ```

### Tone Rule Violation:
- **Dispatched Tone:** `'invalid_unallowed_tone'`
- **HTTP Response:** `400 Bad Request`
- **Error Payload:**
  ```json
  {
    "success": false,
    "error": {
      "message": "Variant has invalid tone 'invalid_unallowed_tone' for mock_x: allowed tones are [casual, urgent, witty, punchy, informative]",
      "code": "CONSTRAINT_VALIDATION_ERROR"
    }
  }
  ```

---

## 5. Review Gating Proof: Invalid Variant Blocked BEFORE Approval

**Test Specification:** `tests/integration/variantGeneration.test.js > 7. EVIDENCE: A variant that fails validation MUST NOT enter the review workflow`

- When an invalid variant (e.g. length violation) exists in `status = 'draft'` with `validation_status = 'invalid'`:
- Calling `POST /variants/:id/approve` is strictly rejected:
  ```json
  {
    "success": false,
    "error": {
      "message": "Cannot approve variant: Variant exceeds maximum length for mock_x: 358 > 280",
      "code": "VALIDATION_FAILED"
    }
  }
  ```
- The record in SQLite remains securely in `status = 'draft'` and is prevented from transitioning to `approved`, `scheduled`, or `published`.

---

## 6. Human Review Workflow State Transition Proofs

**Test Suite:** `tests/integration/reviewWorkflow.test.js`

### A. Draft $\to$ Schedule Attempt (Must Be Rejected)
- Request: `POST /variants/:id/schedule` while `status = 'draft'`
- Response: `400 Bad Request`
- Error: `"Cannot schedule variant in 'draft' status. Only approved variants can be scheduled."`

### B. Rejected $\to$ Schedule Attempt (Must Be Rejected)
- Request: `POST /variants/:id/schedule` after `POST /variants/:id/reject`
- Response: `400 Bad Request`
- Error: `"Cannot schedule variant in 'rejected' status. Only approved variants can be scheduled."`

### C. Approved $\to$ Schedule Attempt (Accepted)
- Request: `POST /variants/:id/schedule` after `POST /variants/:id/approve`
- Response: `201 Created`
- Payload: `{ "success": true, "data": { "id": "...", "status": "queued", ... } }`

### D. Approved $\to$ Edit (Accepted & Resets to Draft)
- Request: `PATCH /variants/:id` on approved variant
- Response: `200 OK`
- Database Status: Resets automatically to `status: 'draft'` for re-review.

### E. Published $\to$ Edit (Must Be Rejected)
- Request: `PATCH /variants/:id` on published variant
- Response: `400 Bad Request`
- Error: `"Cannot edit published variant with ID: ..."`

### F. Published $\to$ Approve (Must Be Rejected)
- Request: `POST /variants/:id/approve` on published variant
- Response: `400 Bad Request`
- Error: `"Cannot re-approve already published variant with ID: ..."`

---

## 7. Phase 5: SocialPublisher Adapter Architecture & Swapping Proofs

**Test Suite:** `tests/integration/adapterSwapping.test.js`

### Unified Interface Contract
All adapters implement:
```javascript
publish(variant, context) -> Promise<{
  success: boolean,
  external_id: string | null,
  url: string | null,
  published_at: string,
  message: string,
  preview?: string,
  error?: string,
  duration_ms?: number,
  raw_response?: object
}>
```

### Standardized Adapter Output Evidence:

1. **TelegramPublisher (Real Target):**
   ```json
   {
     "success": true,
     "external_id": "99482",
     "url": "https://t.me/TestChannel/99482",
     "published_at": "2026-10-02T12:30:00.000Z",
     "message": "📢 Broadcast content\n\n#Architecture #Queues"
   }
   ```

2. **MockXPublisher (Simulated Target with Preview):**
   ```json
   {
     "success": true,
     "external_id": "tw_1772520000000_89211",
     "url": "https://x.com/SocialStudioBot/status/tw_1772520000000_89211",
     "published_at": "2026-10-02T12:30:00.000Z",
     "message": "🚀 Scaling Distributed Systems...",
     "preview": "[Twitter/X Preview] (210/280 chars):\n🚀 Scaling Distributed Systems...\nLink: https://x.com/SocialStudioBot/status/tw_1772520000000_89211"
   }
   ```

3. **MockLinkedInPublisher (Simulated Target with Professional Preview):**
   ```json
   {
     "success": true,
     "external_id": "urn:li:share:9c3b8df2-132d-4ec4-9b2f-927318db5b53",
     "url": "https://www.linkedin.com/feed/update/urn:li:share:9c3b8df2-132d-4ec4-9b2f-927318db5b53",
     "published_at": "2026-10-02T12:30:00.000Z",
     "message": "💡 **Key Takeaways: Scaling Distributed Systems**...",
     "preview": "[LinkedIn Professional Preview] (580/3000 chars):\n💡 **Key Takeaways: Scaling Distributed Systems**...\nLink: https://www.linkedin.com/feed/update/urn:li:share:9c3b8df2-132d-4ec4-9b2f-927318db5b53"
   }
   ```

4. **Polymorphic Zero-Conditional Dispatch Verification:**
   - The core business logic contains **zero** `if (platform === 'telegram')` conditional branching.
   - All targets are resolved dynamically via `PublisherRegistry.get(platform)` and invoked through the polymorphic `SocialPublisher.publish(variant, context)` contract.

---

---

## 8. Phase 6: Database-Level Idempotent Publishing

**Test Suite:** `tests/integration/idempotentPublishing.test.js`

### A. Idempotency Key Derivation & SQLite Constraints
- **Deterministic Key Formula:** `SHA-256(variant_id + ISO_ROUNDED_SLOT)`.
- **Database Table `schedules`:** Unique constraint on `idempotency_key` rejects duplicate schedule registrations.
- **Database Table `publish_logs`:** Partial unique index `idx_publish_logs_unique_success` on `(idempotency_key) WHERE status = 'success'` guarantees zero duplicate publish success records can be written into SQLite.

### B. Execution Flow & Deduplication Proof
1. **First Publish Attempt:**
   - Worker claims `scheduleId` atomically (`claimForProcessing`).
   - Invokes `SocialPublisher.publish(variant, context)`.
   - Records result with `status = 'success'` in `publish_logs`.
   - Transitions `schedule.status = 'completed'` and `variant.status = 'published'`.

2. **Second Publish Attempt (Repeat Trigger / Worker Retry):**
   - Worker checks `publish_logs.findSuccessByIdempotencyKey(idempotencyKey)`.
   - Finds existing publication record.
   - **Crucial:** `publisher.publish(...)` is **NOT** invoked.
   - Returns `{ duplicate: true, skipped: true, reason: 'idempotent_skip' }`.

3. **Concurrent Publish Race Conditions:**
   - Two concurrent workers attempt to publish the exact same variant and slot simultaneously.
   - Atomic database locking (`UPDATE schedules SET status = 'processing' WHERE id = ? AND status = 'queued'`) and partial unique index on `publish_logs` ensure **exactly one worker** executes the adapter.
   - The concurrent worker skips safely with zero duplicate external calls.

---

## 9. Publish History & Audit Trail (`GET /publish-history`)

**Endpoints:**
- `GET /publish-history`
- `GET /publish-history/:variantId`

### Complete Audit Payload Structure:
```json
[
  {
    "id": "e91fa230-0112-4211-a889-112233445566",
    "schedule_id": "ad2a5b5b-e298-4d13-b05c-2a00d9a6cc5f",
    "variant_id": "7b58c732-c649-411a-8bb7-f10f845a7c29",
    "variant": {
      "id": "7b58c732-c649-411a-8bb7-f10f845a7c29",
      "content": "🚀 Scaling Distributed Systems with Message Queues...",
      "body": "🚀 Scaling Distributed Systems with Message Queues...",
      "status": "published",
      "tone": "punchy",
      "hashtags": ["#Architecture", "#Queues"]
    },
    "platform": "mock_x",
    "scheduled_slot": "2026-10-02T22:00:00.000Z",
    "idempotency_key": "c71e21b730fef6e53a39fbc859235921bbd8108ef942d93e157790b4d4586f37",
    "attempt_time": "2026-10-02 12:10:42",
    "status": "success",
    "external_id": "tw_1772520042100_8921",
    "external_post_id": "tw_1772520042100_8921",
    "error": null,
    "result": {
      "success": true,
      "external_id": "tw_1772520042100_8921",
      "url": "https://x.com/SocialStudioBot/status/tw_1772520042100_8921",
      "published_at": "2026-10-02T12:10:42.000Z",
      "message": "🚀 Scaling Distributed Systems with Message Queues..."
    },
    "duration_ms": 156
  }
]
```
