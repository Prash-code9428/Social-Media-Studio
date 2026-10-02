import { SocialPublisher } from './socialPublisher.js';
import { PLATFORMS } from '../config/constants.js';

export class TelegramPublisher extends SocialPublisher {
  /**
   * @param {object} [config]
   * @param {string} [config.botToken]
   * @param {string} [config.chatId]
   */
  constructor(config = {}) {
    super(PLATFORMS.TELEGRAM);
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;
  }

  /**
   * Publish message to Telegram Bot API.
   * @param {object} payload
   */
  async publish(payload) {
    const startTime = Date.now();
    const token = this.botToken;
    const chatId = this.chatId;

    if (!token || !chatId) {
      const errorMsg = 'Telegram credentials missing: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set';
      return {
        success: false,
        externalPostId: null,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }

    const text = this.formatMessage(payload.content, payload.hashtags);
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      const data = await response.json();
      const durationMs = Date.now() - startTime;

      if (!response.ok || !data.ok) {
        // Retry with plain text if HTML parsing failed
        if (data.description && data.description.includes('can\'t parse entities')) {
          const fallbackRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: text.replace(/<[^>]*>/g, ''), // Strip HTML
            }),
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackRes.ok && fallbackData.ok) {
            return {
              success: true,
              externalPostId: String(fallbackData.result.message_id),
              rawResponse: fallbackData,
              durationMs: Date.now() - startTime,
            };
          }
        }

        return {
          success: false,
          externalPostId: null,
          rawResponse: data,
          error: data.description || `HTTP ${response.status}: ${response.statusText}`,
          durationMs,
        };
      }

      return {
        success: true,
        externalPostId: String(data.result.message_id),
        rawResponse: data,
        durationMs,
      };
    } catch (err) {
      return {
        success: false,
        externalPostId: null,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
