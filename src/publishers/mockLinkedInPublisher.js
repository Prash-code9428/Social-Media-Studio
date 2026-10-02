import { SocialPublisher } from './socialPublisher.js';
import { v4 as uuidv4 } from 'uuid';

export class MockLinkedInPublisher extends SocialPublisher {
  /**
   * @param {object} [options]
   * @param {number} [options.failureRate]
   * @param {number} [options.latencyMs]
   */
  constructor(options = {}) {
    super('mock_linkedin');
    this.failureRate = options.failureRate !== undefined ? options.failureRate : 0;
    this.latencyMs = options.latencyMs !== undefined ? options.latencyMs : 180;
  }

  async publish(variant, context = {}) {
    const startTime = Date.now();
    const content = variant.content !== undefined ? variant.content : (variant.body || '');
    const hashtags = variant.hashtags || [];
    const message = this.formatMessage(content, hashtags);

    // Simulate network latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return {
        success: false,
        external_id: null,
        externalPostId: null,
        url: null,
        published_at: new Date().toISOString(),
        message,
        error: 'Simulated LinkedIn API 401 Unauthorized: Token expired',
        duration_ms: Date.now() - startTime,
      };
    }

    const mockUrn = `urn:li:share:${uuidv4()}`;
    const postUrl = `https://www.linkedin.com/feed/update/${mockUrn}`;
    const preview = `[LinkedIn Professional Preview] (${message.length}/3000 chars):\n${message}\nLink: ${postUrl}`;

    const rawResponse = {
      id: mockUrn,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
      },
      owner: 'urn:li:organization:12345678',
      text: {
        text: message,
      },
      created: {
        time: Date.now(),
      },
    };

    return {
      success: true,
      external_id: mockUrn,
      externalPostId: mockUrn,
      url: postUrl,
      published_at: new Date().toISOString(),
      message,
      preview,
      duration_ms: Date.now() - startTime,
      durationMs: Date.now() - startTime,
      raw_response: rawResponse,
      rawResponse: rawResponse,
    };
  }
}
