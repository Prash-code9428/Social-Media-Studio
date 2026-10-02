import { DEFAULT_PROFILES } from '../config/constants.js';

export const SCHEMA_SQL = `
-- 1. Ingested Blog Posts (Single Source of Truth)
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('url', 'markdown')),
    source_url TEXT,
    raw_content TEXT NOT NULL,
    summary TEXT,
    metadata_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Platform Constraint Profiles
CREATE TABLE IF NOT EXISTS constraint_profiles (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL UNIQUE,
    max_length INTEGER NOT NULL,
    allowed_tones_json TEXT NOT NULL,
    max_hashtags INTEGER NOT NULL,
    min_hashtags INTEGER DEFAULT 0,
    media_allowed INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Platform Variants
CREATE TABLE IF NOT EXISTS post_variants (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK(platform IN ('telegram', 'mock_x', 'mock_linkedin', 'x', 'linkedin')),
    content TEXT NOT NULL,
    hashtags_json TEXT DEFAULT '[]',
    tone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'rejected', 'published')),
    rejection_reason TEXT,
    validation_status TEXT NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('pending', 'valid', 'invalid')),
    validation_errors_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Scheduled Publish Slots
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
    scheduled_time DATETIME NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    job_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Publication History & Audit Log
CREATE TABLE IF NOT EXISTS publish_logs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
    variant_id TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK(status IN ('success', 'failure')),
    external_post_id TEXT,
    request_payload_json TEXT,
    response_payload_json TEXT,
    error_message TEXT,
    duration_ms INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & query isolation
CREATE INDEX IF NOT EXISTS idx_variants_post_id ON post_variants(post_id);
CREATE INDEX IF NOT EXISTS idx_variants_status ON post_variants(status);
CREATE INDEX IF NOT EXISTS idx_schedules_variant_id ON schedules(variant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_time_status ON schedules(scheduled_time, status);
CREATE INDEX IF NOT EXISTS idx_publish_logs_variant_id ON publish_logs(variant_id);
CREATE INDEX IF NOT EXISTS idx_publish_logs_idempotency ON publish_logs(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_logs_unique_success ON publish_logs(idempotency_key) WHERE status = 'success';
`;

export function runMigrations(db) {
  db.exec(SCHEMA_SQL);

  // Seed default constraint profiles if table is empty
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM constraint_profiles');
  const { count } = countStmt.get();

  if (count === 0) {
    const insertProfile = db.prepare(`
      INSERT INTO constraint_profiles (
        id, platform, max_length, allowed_tones_json, max_hashtags, min_hashtags, media_allowed
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((profiles) => {
      for (const p of profiles) {
        insertProfile.run(
          p.id,
          p.platform,
          p.max_length,
          p.allowed_tones_json,
          p.max_hashtags,
          p.min_hashtags,
          p.media_allowed
        );
      }
    });

    insertMany(DEFAULT_PROFILES);
  }
}
