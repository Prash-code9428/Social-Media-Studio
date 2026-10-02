/**
 * @typedef {Object} PublishContext
 * @property {string} [scheduleId]
 * @property {string} [variantId]
 * @property {string} [idempotencyKey]
 * @property {boolean} [immediate]
 * @property {object} [metadata]
 */

/**
 * @typedef {Object} VariantInput
 * @property {string} [id]
 * @property {string} [body]
 * @property {string} [content]
 * @property {string[]} [hashtags]
 * @property {string} [platform]
 * @property {string} [tone]
 */

/**
 * @typedef {Object} PublishResult
 * @property {boolean} success
 * @property {string|null} external_id
 * @property {string|null} url
 * @property {string} published_at
 * @property {string} message
 * @property {string} [preview]
 * @property {string} [error]
 * @property {number} [duration_ms]
 * @property {object} [raw_response]
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
   * Publish variant content to the social target.
   * @param {VariantInput|object} variant - The variant object or content payload
   * @param {PublishContext} [context] - Context containing scheduleId, idempotencyKey, etc.
   * @returns {Promise<PublishResult>}
   */
  async publish(variant, context = {}) {
    throw new Error(`Method 'publish()' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Format message content combined with hashtags.
   * @param {string} content
   * @param {string[]} [hashtags]
   * @returns {string}
   */
  formatMessage(content, hashtags = []) {
    if (!hashtags || hashtags.length === 0) return content || '';
    const formatted = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    return `${content || ''}\n\n${formatted}`.trim();
  }
}
