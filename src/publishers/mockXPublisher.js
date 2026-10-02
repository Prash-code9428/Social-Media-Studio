import { SocialPublisher } from './socialPublisher.js';

export class MockXPublisher extends SocialPublisher {
  /**
   * @param {object} [options]
   * @param {number} [options.failureRate]
   * @param {number} [options.latencyMs]
   */
  constructor(options = {}) {
    super('mock_x');
    this.failureRate = options.failureRate !== undefined ? options.failureRate : 0;
    this.latencyMs = options.latencyMs !== undefined ? options.latencyMs : 150;
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
        error: 'Simulated X API 429 Too Many Requests: Rate limit exceeded',
        duration_ms: Date.now() - startTime,
      };
    }

    const mockTweetId = `tw_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const tweetUrl = `https://x.com/SocialStudioBot/status/${mockTweetId}`;
    const preview = `[Twitter/X Preview] (${message.length}/280 chars):\n${message}\nLink: ${tweetUrl}`;

    const rawResponse = {
      data: {
        id: mockTweetId,
        text: message,
        created_at: new Date().toISOString(),
      },
    };

    return {
      success: true,
      external_id: mockTweetId,
      externalPostId: mockTweetId,
      url: tweetUrl,
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
