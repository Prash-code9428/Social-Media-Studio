import { v4 as uuidv4 } from 'uuid';

export class PublishLogsRepository {
  constructor(db) {
    this.db = db;
  }

  create({
    scheduleId = null,
    variantId,
    platform,
    idempotencyKey,
    attemptNumber = 1,
    status,
    externalPostId = null,
    requestPayload = null,
    responsePayload = null,
    errorMessage = null,
    durationMs,
  }) {
    const id = uuidv4();
    const reqJson = requestPayload ? JSON.stringify(requestPayload) : null;
    const resJson = responsePayload ? JSON.stringify(responsePayload) : null;

    const stmt = this.db.prepare(`
      INSERT INTO publish_logs (
        id, schedule_id, variant_id, platform, idempotency_key,
        attempt_number, status, external_post_id, request_payload_json,
        response_payload_json, error_message, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      scheduleId,
      variantId,
      platform,
      idempotencyKey,
      attemptNumber,
      status,
      externalPostId,
      reqJson,
      resJson,
      errorMessage,
      durationMs
    );

    return this.findById(id);
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM publish_logs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;

    return {
      ...row,
      request_payload: row.request_payload_json ? JSON.parse(row.request_payload_json) : null,
      response_payload: row.response_payload_json ? JSON.parse(row.response_payload_json) : null,
    };
  }

  findSuccessByIdempotencyKey(idempotencyKey) {
    const stmt = this.db.prepare(`
      SELECT * FROM publish_logs 
      WHERE idempotency_key = ? AND status = 'success'
      ORDER BY created_at DESC LIMIT 1
    `);
    const row = stmt.get(idempotencyKey);
    if (!row) return null;

    return {
      ...row,
      request_payload: row.request_payload_json ? JSON.parse(row.request_payload_json) : null,
      response_payload: row.response_payload_json ? JSON.parse(row.response_payload_json) : null,
    };
  }

  findAll({ variantId, platform, status, limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM publish_logs';
    const conditions = [];
    const params = [];

    if (variantId) {
      conditions.push('variant_id = ?');
      params.push(variantId);
    }
    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => ({
      ...row,
      request_payload: row.request_payload_json ? JSON.parse(row.request_payload_json) : null,
      response_payload: row.response_payload_json ? JSON.parse(row.response_payload_json) : null,
    }));
  }

  getPublishHistory({ variantId, platform, status, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT
        pl.id,
        pl.schedule_id,
        pl.variant_id,
        pl.platform,
        pl.idempotency_key,
        pl.attempt_number,
        pl.status,
        pl.external_post_id AS external_id,
        pl.error_message AS error,
        pl.duration_ms,
        pl.created_at AS attempt_time,
        pl.request_payload_json,
        pl.response_payload_json,
        s.scheduled_time AS scheduled_slot,
        pv.content AS variant_content,
        pv.status AS variant_status,
        pv.tone AS variant_tone,
        pv.hashtags_json AS variant_hashtags_json
      FROM publish_logs pl
      LEFT JOIN schedules s ON pl.schedule_id = s.id
      LEFT JOIN post_variants pv ON pl.variant_id = pv.id
    `;

    const conditions = [];
    const params = [];

    if (variantId) {
      conditions.push('pl.variant_id = ?');
      params.push(variantId);
    }
    if (platform) {
      conditions.push('pl.platform = ?');
      params.push(platform);
    }
    if (status) {
      conditions.push('pl.status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY pl.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => ({
      id: row.id,
      schedule_id: row.schedule_id,
      variant_id: row.variant_id,
      variant: row.variant_id
        ? {
            id: row.variant_id,
            content: row.variant_content || row.variant_body,
            body: row.variant_body || row.variant_content,
            status: row.variant_status,
            tone: row.variant_tone,
            hashtags: row.variant_hashtags_json ? JSON.parse(row.variant_hashtags_json) : [],
          }
        : null,
      platform: row.platform,
      scheduled_slot: row.scheduled_slot || row.attempt_time,
      idempotency_key: row.idempotency_key,
      attempt_time: row.attempt_time,
      status: row.status,
      external_id: row.external_id,
      external_post_id: row.external_id,
      error: row.error,
      result: row.response_payload_json ? JSON.parse(row.response_payload_json) : null,
      duration_ms: row.duration_ms,
    }));
  }
}
