import { SocialPublisher } from './socialPublisher.js';
import { PLATFORMS } from '../config/constants.js';

export class MockXPublisher extends SocialPublisher {
  /**
   * @param {object} [options]
   * @param {number} [options.failureRate]
   * @param {number} [options.latencyMs]
   */
  constructor(options = {}) {
    super(PLATFORMS.X);
    this.failureRate = options.failureRate !== undefined ? options.failureRate : 0;
    this.latencyMs = options.latencyMs !== undefined ? options.latencyMs : 150;
  }

  async publish(payload) {
    const startTime = Date.now();

    // Simulate realistic network latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Simulate controlled failure for error testing
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return {
        success: false,
        externalPostId: null,
        error: 'Simulated X API rate limit / 429 Too Many Requests',
        durationMs: Date.now() - startTime,
      };
    }

    const message = this.formatMessage(payload.content, payload.hashtags);
    const mockTweetId = `tw_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const mockResponse = {
      data: {
        id: mockTweetId,
        text: message,
        created_at: new Date().toISOString(),
      },
    };

    return {
      success: true,
      externalPostId: mockTweetId,
      rawResponse: mockResponse,
      durationMs: Date.now() - startTime,
    };
  }
}
