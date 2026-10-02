import { v4 as uuidv4 } from 'uuid';
import { VARIANT_STATUS, VALIDATION_STATUS } from '../config/constants.js';

export class VariantsRepository {
  constructor(db) {
    this.db = db;
  }

  create({
    postId,
    platform,
    content,
    body,
    hashtags = [],
    tone = 'informative',
    status = VARIANT_STATUS.DRAFT,
    validationStatus = VALIDATION_STATUS.PENDING,
    validationErrors = [],
  }) {
    const id = uuidv4();
    const finalContent = content !== undefined ? content : (body || '');
    const hashtagsJson = JSON.stringify(hashtags);
    const errorsJson = JSON.stringify(validationErrors);
    const plat = (platform || 'telegram').toLowerCase().trim();

    const stmt = this.db.prepare(`
      INSERT INTO post_variants (
        id, post_id, platform, content, hashtags_json, tone, status, validation_status, validation_errors_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, postId, plat, finalContent, hashtagsJson, tone, status, validationStatus, errorsJson);
    return this.findById(id);
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM post_variants WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;

    return {
      id: row.id,
      post_id: row.post_id,
      platform: row.platform,
      body: row.content,
      content: row.content,
      tone: row.tone,
      hashtags: JSON.parse(row.hashtags_json || '[]'),
      status: row.status,
      rejection_reason: row.rejection_reason,
      validation_status: row.validation_status,
      validation_errors: JSON.parse(row.validation_errors_json || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  findByPostId(postId) {
    const stmt = this.db.prepare('SELECT * FROM post_variants WHERE post_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(postId);
    return rows.map((row) => ({
      id: row.id,
      post_id: row.post_id,
      platform: row.platform,
      body: row.content,
      content: row.content,
      tone: row.tone,
      hashtags: JSON.parse(row.hashtags_json || '[]'),
      status: row.status,
      rejection_reason: row.rejection_reason,
      validation_status: row.validation_status,
      validation_errors: JSON.parse(row.validation_errors_json || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  deleteByPostId(postId) {
    const stmt = this.db.prepare('DELETE FROM post_variants WHERE post_id = ?');
    return stmt.run(postId).changes;
  }

  updateContent(id, { content, body, hashtags, tone, validationStatus, validationErrors }) {
    const updates = ['status = ?'];
    const params = [VARIANT_STATUS.DRAFT]; // Content edit resets review status to draft

    const finalContent = content !== undefined ? content : body;
    if (finalContent !== undefined) {
      updates.push('content = ?');
      params.push(finalContent);
    }
    if (hashtags !== undefined) {
      updates.push('hashtags_json = ?');
      params.push(JSON.stringify(hashtags));
    }
    if (tone !== undefined) {
      updates.push('tone = ?');
      params.push(tone);
    }
    if (validationStatus !== undefined) {
      updates.push('validation_status = ?');
      params.push(validationStatus);
    }
    if (validationErrors !== undefined) {
      updates.push('validation_errors_json = ?');
      params.push(JSON.stringify(validationErrors));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE post_variants SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...params);

    return this.findById(id);
  }

  updateValidation(id, { validationStatus, validationErrors }) {
    const stmt = this.db.prepare(`
      UPDATE post_variants
      SET validation_status = ?, validation_errors_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(validationStatus, JSON.stringify(validationErrors), id);
    return this.findById(id);
  }

  updateStatus(id, status, rejectionReason = null) {
    const stmt = this.db.prepare(`
      UPDATE post_variants
      SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, rejectionReason, id);
    return this.findById(id);
  }

  delete(id) {
    const stmt = this.db.prepare('DELETE FROM post_variants WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}
