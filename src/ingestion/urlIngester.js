import * as cheerio from 'cheerio';

export class UrlIngester {
  /**
   * Fetch and parse content from a blog post URL.
   * @param {string} url
   * @param {object} [options]
   * @returns {Promise<{ title: string, content: string, summary: string, sourceUrl: string, metadata: object }>}
   */
  static async fetchAndParse(url, options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL must be provided');
    }

    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: ${url}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

    let html;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SocialStudioBot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
      }

      html = await response.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out while fetching URL: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    return this.parseHtml(html, url);
  }

  /**
   * Parse HTML string using Cheerio.
   * @param {string} html
   * @param {string} [sourceUrl]
   */
  static parseHtml(html, sourceUrl = '') {
    const $ = cheerio.load(html);

    // Remove noise elements
    $('script, style, nav, footer, iframe, noscript, svg, form, aside, header .nav').remove();

    // Extract Title: check og:title -> h1 -> <title>
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const h1 = $('h1').first().text().trim();
    const docTitle = $('title').text().trim();
    const title = ogTitle || h1 || docTitle || 'Untitled Blog Post';

    // Extract Author & Description
    const author = $('meta[name="author"]').attr('content') || $('meta[property="article:author"]').attr('content') || null;
    const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null;

    // Extract Content: prioritize <article>, main, or body
    let articleEl = $('article');
    if (articleEl.length === 0) {
      articleEl = $('main');
    }
    if (articleEl.length === 0) {
      articleEl = $('.post-content, .article-content, .entry-content, #content');
    }
    if (articleEl.length === 0) {
      articleEl = $('body');
    }

    // Extract clean text paragraphs
    const paragraphs = [];
    articleEl.find('p, h2, h3, h4, li').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 25 && !text.toLowerCase().includes('cookie') && !text.toLowerCase().includes('privacy policy')) {
        paragraphs.push(text);
      }
    });

    const content = paragraphs.join('\n\n') || articleEl.text().replace(/\s+/g, ' ').trim();

    if (!content || content.length < 30) {
      throw new Error('Extracted content is too short or page structure could not be parsed');
    }

    const summary = metaDescription || (paragraphs[0] ? (paragraphs[0].length > 280 ? paragraphs[0].slice(0, 277) + '...' : paragraphs[0]) : content.slice(0, 200));

    const words = content.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      title,
      content,
      summary,
      sourceUrl,
      metadata: {
        author,
        wordCount,
        readingTimeMinutes,
        sourceType: 'url',
        scrapedAt: new Date().toISOString(),
      },
    };
  }
}
