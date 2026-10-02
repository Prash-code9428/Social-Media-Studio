import { MarkdownIngester } from './markdownIngester.js';
import { UrlIngester } from './urlIngester.js';

export class IngestionService {
  constructor({ postsRepository }) {
    this.postsRepository = postsRepository;
  }

  /**
   * Ingest post from Markdown content.
   * @param {object} params
   * @param {string} params.markdown
   * @param {string} [params.title]
   * @param {object} [params.metadata]
   */
  async ingestMarkdown({ markdown, title, metadata = {} }) {
    const parsed = MarkdownIngester.parse(markdown, title);

    const mergedMetadata = {
      ...parsed.metadata,
      ...metadata,
    };

    const savedPost = this.postsRepository.create({
      title: title || parsed.title,
      sourceType: 'markdown',
      sourceUrl: null,
      rawContent: parsed.content,
      summary: parsed.summary,
      metadata: mergedMetadata,
    });

    return savedPost;
  }

  /**
   * Ingest post from URL.
   * @param {object} params
   * @param {string} params.url
   * @param {object} [params.options]
   */
  async ingestUrl({ url, options = {} }) {
    const parsed = await UrlIngester.fetchAndParse(url, options);

    const savedPost = this.postsRepository.create({
      title: parsed.title,
      sourceType: 'url',
      sourceUrl: parsed.sourceUrl,
      rawContent: parsed.content,
      summary: parsed.summary,
      metadata: parsed.metadata,
    });

    return savedPost;
  }
}
