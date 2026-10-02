export class ProfilesRepository {
  constructor(db) {
    this.db = db;
  }

  findByPlatform(platform) {
    const stmt = this.db.prepare('SELECT * FROM constraint_profiles WHERE platform = ?');
    const row = stmt.get(platform);
    if (!row) return null;
    return {
      ...row,
      allowed_tones: JSON.parse(row.allowed_tones_json || '[]'),
    };
  }

  findAll() {
    const stmt = this.db.prepare('SELECT * FROM constraint_profiles ORDER BY platform ASC');
    const rows = stmt.all();
    return rows.map((row) => ({
      ...row,
      allowed_tones: JSON.parse(row.allowed_tones_json || '[]'),
    }));
  }

  update(platform, { maxLength, allowedTones, maxHashtags, minHashtags, mediaAllowed }) {
    const updates = [];
    const params = [];

    if (maxLength !== undefined) {
      updates.push('max_length = ?');
      params.push(maxLength);
    }
    if (allowedTones !== undefined) {
      updates.push('allowed_tones_json = ?');
      params.push(JSON.stringify(allowedTones));
    }
    if (maxHashtags !== undefined) {
      updates.push('max_hashtags = ?');
      params.push(maxHashtags);
    }
    if (minHashtags !== undefined) {
      updates.push('min_hashtags = ?');
      params.push(minHashtags);
    }
    if (mediaAllowed !== undefined) {
      updates.push('media_allowed = ?');
      params.push(mediaAllowed ? 1 : 0);
    }

    if (updates.length === 0) return this.findByPlatform(platform);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(platform);

    const sql = `UPDATE constraint_profiles SET ${updates.join(', ')} WHERE platform = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...params);

    return this.findByPlatform(platform);
  }
}
