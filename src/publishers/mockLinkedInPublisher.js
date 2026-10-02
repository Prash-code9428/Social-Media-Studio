import { SocialPublisher } from './socialPublisher.js';
import { PLATFORMS } from '../config/constants.js';
import { v4 as uuidv4 } from 'uuid';

export class MockLinkedInPublisher extends SocialPublisher {
  /**
   * @param {object} [options]
   * @param {number} [options.failureRate]
   * @param {number} [options.latencyMs]
   */
  constructor(options = {}) {
    super(PLATFORMS.LINKEDIN);
    this.failureRate = options.failureRate !== undefined ? options.failureRate : 0;
    this.latencyMs = options.latencyMs !== undefined ? options.latencyMs : 180;
  }

  async publish(payload) {
    const startTime = Date.now();

    // Simulate network latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Simulate controlled failure for error testing
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return {
        success: false,
        externalPostId: null,
        error: 'Simulated LinkedIn API OAuth token expired / 401 Unauthorized',
        durationMs: Date.now() - startTime,
      };
    }

    const message = this.formatMessage(payload.content, payload.hashtags);
    const mockUrn = `urn:li:share:${uuidv4()}`;

    const mockResponse = {
      id: mockUrn,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      owner: 'urn:li:organization:99887766',
      subject: message.slice(0, 50),
      text: {
        text: message,
      },
      created: {
        time: Date.now(),
      },
    };

    return {
      success: true,
      externalPostId: mockUrn,
      rawResponse: mockResponse,
      durationMs: Date.now() - startTime,
    };
  }
}
