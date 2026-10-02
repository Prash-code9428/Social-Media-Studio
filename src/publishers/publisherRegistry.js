import { TelegramPublisher } from './telegramPublisher.js';
import { MockXPublisher } from './mockXPublisher.js';
import { MockLinkedInPublisher } from './mockLinkedInPublisher.js';
import { normalizePlatform } from '../config/constants.js';

export class PublisherRegistry {
  constructor(options = {}) {
    this.publishers = new Map();

    const telegramPub = new TelegramPublisher(options.telegram || {});
    const mockXPub = new MockXPublisher(options.x || {});
    const mockLinkedInPub = new MockLinkedInPublisher(options.linkedin || {});

    // Register primary names and aliases
    this.register('telegram', telegramPub);
    this.register('mock_x', mockXPub);
    this.register('x', mockXPub);
    this.register('mock_linkedin', mockLinkedInPub);
    this.register('linkedin', mockLinkedInPub);
  }

  register(platform, publisherInstance) {
    this.publishers.set(platform.toLowerCase(), publisherInstance);
  }

  get(platform) {
    const direct = this.publishers.get(platform.toLowerCase());
    if (direct) return direct;

    const normalized = normalizePlatform(platform);
    const normalizedPub = this.publishers.get(normalized);
    if (normalizedPub) return normalizedPub;

    throw new Error(`No publisher adapter registered for platform: ${platform}`);
  }

  has(platform) {
    return this.publishers.has(platform.toLowerCase()) || this.publishers.has(normalizePlatform(platform));
  }

  listPlatforms() {
    return ['telegram', 'mock_x', 'mock_linkedin'];
  }
}
