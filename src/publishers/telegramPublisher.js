import { SocialPublisher } from './socialPublisher.js';

export class TelegramPublisher extends SocialPublisher {
  /**
   * @param {object} [config]
   * @param {string} [config.botToken]
   * @param {string} [config.chatId]
   */
  constructor(config = {}) {
    super('telegram');
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID || '';
  }

  /**
   * Publish variant to Telegram Bot API.
   * @param {object} variant
   * @param {object} [context]
   */
  async publish(variant, context = {}) {
    const startTime = Date.now();
    const token = this.botToken;
    const chatId = this.chatId;
    const content = variant.content !== undefined ? variant.content : (variant.body || '');
    const hashtags = variant.hashtags || [];
    const text = this.formatMessage(content, hashtags);

    if (!token || !chatId) {
      const errorMsg = 'Telegram credentials missing: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set';
      return {
        success: false,
        external_id: null,
        externalPostId: null,
        url: null,
        published_at: new Date().toISOString(),
        message: text,
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      };
    }

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
        // Fallback to plain text if HTML entity parsing fails
        if (data.description && data.description.includes("can't parse entities")) {
          const fallbackRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: text.replace(/<[^>]*>/g, ''),
            }),
          });
          const fallbackData = await fallbackRes.json();
          if (fallbackRes.ok && fallbackData.ok) {
            const messageId = String(fallbackData.result.message_id);
            const postUrl = chatId.startsWith('@') ? `https://t.me/${chatId.replace('@', '')}/${messageId}` : null;
            return {
              success: true,
              external_id: messageId,
              externalPostId: messageId,
              url: postUrl,
              published_at: new Date().toISOString(),
              message: text,
              duration_ms: Date.now() - startTime,
              raw_response: fallbackData,
              rawResponse: fallbackData,
            };
          }
        }

        return {
          success: false,
          external_id: null,
          externalPostId: null,
          url: null,
          published_at: new Date().toISOString(),
          message: text,
          error: data.description || `HTTP ${response.status}: ${response.statusText}`,
          duration_ms: durationMs,
          raw_response: data,
          rawResponse: data,
        };
      }

      const messageId = String(data.result.message_id);
      const postUrl = chatId.startsWith('@') ? `https://t.me/${chatId.replace('@', '')}/${messageId}` : null;

      return {
        success: true,
        external_id: messageId,
        externalPostId: messageId,
        url: postUrl,
        published_at: new Date().toISOString(),
        message: text,
        duration_ms: durationMs,
        raw_response: data,
        rawResponse: data,
      };
    } catch (err) {
      return {
        success: false,
        external_id: null,
        externalPostId: null,
        url: null,
        published_at: new Date().toISOString(),
        message: text,
        error: err.message,
        duration_ms: Date.now() - startTime,
      };
    }
  }
}
