import { v4 as uuidv4 } from 'uuid';
import { SCHEDULE_STATUS } from '../config/constants.js';

export class SchedulesRepository {
  constructor(db) {
    this.db = db;
  }

  create({ variantId, scheduledTime, idempotencyKey, jobId = null }) {
    const id = uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO schedules (id, variant_id, scheduled_time, idempotency_key, status, job_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, variantId, scheduledTime, idempotencyKey, SCHEDULE_STATUS.QUEUED, jobId);
    return this.findById(id);
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE id = ?');
    return stmt.get(id) || null;
  }

  findByIdempotencyKey(idempotencyKey) {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE idempotency_key = ?');
    return stmt.get(idempotencyKey) || null;
  }

  findByVariantId(variantId) {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE variant_id = ? ORDER BY scheduled_time ASC');
    return stmt.all(variantId);
  }

  findAll({ status, limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM schedules';
    const params = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY scheduled_time ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  findPendingForReconciliation() {
    const stmt = this.db.prepare(`
      SELECT * FROM schedules 
      WHERE status IN ('queued', 'processing')
      ORDER BY scheduled_time ASC
    `);
    return stmt.all();
  }

  // Atomic state transition to prevent race conditions during worker dispatch
  claimForProcessing(id) {
    const stmt = this.db.prepare(`
      UPDATE schedules
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `);
    const result = stmt.run(SCHEDULE_STATUS.PROCESSING, id, SCHEDULE_STATUS.QUEUED);
    return result.changes > 0;
  }

  updateStatus(id, status, jobId = null) {
    const updates = ['status = ?'];
    const params = [status];

    if (jobId !== null) {
      updates.push('job_id = ?');
      params.push(jobId);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const stmt = this.db.prepare(`UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);
    return this.findById(id);
  }

  cancel(id) {
    const stmt = this.db.prepare(`
      UPDATE schedules
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('queued', 'processing')
    `);
    const res = stmt.run(SCHEDULE_STATUS.CANCELLED, id);
    return res.changes > 0;
  }
}
