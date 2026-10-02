export class MarkdownIngester {
  /**
   * Parse raw markdown string and extract structured post data.
   * @param {string} markdown
   * @param {string} [fallbackTitle]
   * @returns {{ title: string, content: string, summary: string, metadata: object }}
   */
  static parse(markdown, fallbackTitle = 'Untitled Post') {
    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      throw new Error('Markdown content must not be empty');
    }

    const trimmed = markdown.trim();
    const lines = trimmed.split('\n');

    let title = fallbackTitle;
    let contentLines = [];
    let foundTitle = false;

    // Look for first # Header or use provided title
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)$/);
      if (match && !foundTitle) {
        title = match[1].trim();
        foundTitle = true;
      } else {
        contentLines.push(line);
      }
    }

    const cleanContent = contentLines.join('\n').trim() || trimmed;

    // Generate summary from first meaningful paragraph
    const paragraphs = cleanContent
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[#*`_>\[\]]/g, '').trim())
      .filter((p) => p.length > 20);

    const summary = paragraphs.length > 0
      ? (paragraphs[0].length > 280 ? paragraphs[0].slice(0, 277) + '...' : paragraphs[0])
      : cleanContent.slice(0, 200);

    // Calculate metadata
    const words = cleanContent.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      title,
      content: cleanContent,
      summary,
      metadata: {
        wordCount,
        readingTimeMinutes,
        sourceType: 'markdown',
      },
    };
  }
}
