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
}
