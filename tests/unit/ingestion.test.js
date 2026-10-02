import { describe, it, expect } from 'vitest';
import { MarkdownIngester } from '../../src/ingestion/markdownIngester.js';
import { UrlIngester } from '../../src/ingestion/urlIngester.js';

describe('MarkdownIngester', () => {
  it('should extract title from first # header and clean content', () => {
    const md = `# Scaling Node.js Microservices

This is an insightful guide on horizontal scaling and message queues in Node.js.

We will explore Redis and BullMQ.`;

    const result = MarkdownIngester.parse(md);

    expect(result.title).toBe('Scaling Node.js Microservices');
    expect(result.content).toContain('This is an insightful guide');
    expect(result.metadata.wordCount).toBeGreaterThan(10);
    expect(result.metadata.readingTimeMinutes).toBe(1);
    expect(result.summary).toContain('This is an insightful guide');
  });

  it('should use fallback title if no header exists', () => {
    const md = 'Just a paragraph without a header.';
    const result = MarkdownIngester.parse(md, 'My Custom Title');

    expect(result.title).toBe('My Custom Title');
    expect(result.content).toBe('Just a paragraph without a header.');
  });

  it('should throw if markdown is empty', () => {
    expect(() => MarkdownIngester.parse('')).toThrow('Markdown content must not be empty');
  });
});

describe('UrlIngester HTML Parsing', () => {
  it('should extract title, clean text paragraphs, and metadata from HTML', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Blog - Building Resilient Queues</title>
          <meta name="author" content="Jane Doe" />
          <meta name="description" content="A comprehensive breakdown of BullMQ in production." />
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <article>
            <h1>Building Resilient Queues</h1>
            <p>Distributed queues are the backbone of modern distributed systems.</p>
            <p>By leveraging Redis Streams and atomic scripts, we achieve high reliability.</p>
          </article>
          <footer>Footer text that should be ignored</footer>
        </body>
      </html>
    `;

    const result = UrlIngester.parseHtml(sampleHtml, 'https://example.com/blog/queues');

    expect(result.title).toBe('Building Resilient Queues');
    expect(result.content).toContain('Distributed queues are the backbone');
    expect(result.content).toContain('leveraging Redis Streams');
    expect(result.content).not.toContain('Footer text');
    expect(result.metadata.author).toBe('Jane Doe');
    expect(result.summary).toBe('A comprehensive breakdown of BullMQ in production.');
  });
});
