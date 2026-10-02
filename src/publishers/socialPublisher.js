/**
 * @typedef {Object} PublishPayload
 * @property {string} content
 * @property {string[]} [hashtags]
 * @property {string} idempotencyKey
 * @property {object} [metadata]
 */

/**
 * @typedef {Object} PublishResult
 * @property {boolean} success
 * @property {string} externalPostId
 * @property {object} [rawResponse]
 * @property {string} [error]
 * @property {number} durationMs
 */

export class SocialPublisher {
  /**
   * @param {string} platformName
   */
  constructor(platformName) {
    if (new.target === SocialPublisher) {
      throw new TypeError('Cannot construct SocialPublisher instances directly');
    }
    this.platform = platformName;
  }

  /**
   * Publish payload to target platform. Must be implemented by subclasses.
   * @param {PublishPayload} payload
   * @returns {Promise<PublishResult>}
   */
  async publish(payload) {
    throw new Error(`Method 'publish()' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Format message content combined with hashtags.
   * @param {string} content
   * @param {string[]} [hashtags]
   * @returns {string}
   */
  formatMessage(content, hashtags = []) {
    if (!hashtags || hashtags.length === 0) return content;
    const formatted = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    return `${content}\n\n${formatted}`;
  }
}
