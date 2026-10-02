import { v4 as uuidv4 } from 'uuid';

export class PostsRepository {
  constructor(db) {
    this.db = db;
  }

  create({ title, sourceType, sourceUrl = null, rawContent, summary = null, metadata = {} }) {
    const id = uuidv4();
    const metadataJson = JSON.stringify(metadata);

    const stmt = this.db.prepare(`
      INSERT INTO posts (id, title, source_type, source_url, raw_content, summary, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, title, sourceType, sourceUrl, rawContent, summary, metadataJson);
    return this.findById(id);
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM posts WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;

    return {
      ...row,
      metadata: JSON.parse(row.metadata_json || '{}'),
    };
  }

  findAll({ limit = 20, offset = 0 } = {}) {
    const stmt = this.db.prepare(`
      SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset);
    return rows.map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata_json || '{}'),
    }));
  }

  count() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM posts');
    return stmt.get().count;
  }

  delete(id) {
    const stmt = this.db.prepare('DELETE FROM posts WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  }
}
