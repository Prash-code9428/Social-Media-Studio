import { PLATFORMS } from '../config/constants.js';
import { TelegramPublisher } from './telegramPublisher.js';
import { MockXPublisher } from './mockXPublisher.js';
import { MockLinkedInPublisher } from './mockLinkedInPublisher.js';

export class PublisherRegistry {
  constructor(options = {}) {
    this.publishers = new Map();

    // Register default publisher adapters
    this.register(PLATFORMS.TELEGRAM, new TelegramPublisher(options.telegram || {}));
    this.register(PLATFORMS.X, new MockXPublisher(options.x || {}));
    this.register(PLATFORMS.LINKEDIN, new MockLinkedInPublisher(options.linkedin || {}));
  }

  register(platform, publisherInstance) {
    this.publishers.set(platform.toLowerCase(), publisherInstance);
  }

  get(platform) {
    const pub = this.publishers.get(platform.toLowerCase());
    if (!pub) {
      throw new Error(`No publisher adapter registered for platform: ${platform}`);
    }
    return pub;
  }

  has(platform) {
    return this.publishers.has(platform.toLowerCase());
  }

  listPlatforms() {
    return Array.from(this.publishers.keys());
  }
}
