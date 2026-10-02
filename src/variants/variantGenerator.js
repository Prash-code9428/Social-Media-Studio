import { normalizePlatform, CONFIG_PLATFORMS } from '../config/constants.js';
import { ConstraintValidator } from './constraintValidator.js';

export class VariantGenerator {
  /**
   * Extract meaningful topic keywords for deterministic hashtags.
   * @param {string} text
   * @param {number} maxTags
   * @returns {string[]}
   */
  static extractHashtags(text, maxTags = 3) {
    const stopWords = new Set([
      'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'have',
      'about', 'more', 'will', 'what', 'when', 'which', 'their', 'there',
      'how', 'why', 'can', 'all', 'into', 'some', 'out', 'other', 'new'
    ]);

    const words = (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    const freqMap = {};
    for (const w of words) {
      freqMap[w] = (freqMap[w] || 0) + 1;
    }

    const sorted = Object.keys(freqMap).sort((a, b) => freqMap[b] - freqMap[a]);
    return sorted.slice(0, maxTags).map((w) => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
  }

  /**
   * Generate platform-specific deterministic variants for a post.
   * @param {object} post - The stored post from SQLite (SSOT)
   * @param {string[]} [platforms]
   * @param {object} profilesMap
   * @param {string} [requestedTone]
   */
  static generateForPlatforms(post, platforms = CONFIG_PLATFORMS, profilesMap = {}, requestedTone) {
    const variants = [];
    const targetPlatforms = platforms && platforms.length > 0 ? platforms : CONFIG_PLATFORMS;

    for (const rawPlatform of targetPlatforms) {
      const normalized = normalizePlatform(rawPlatform);
      const profile = profilesMap[rawPlatform] || profilesMap[normalized];
      if (!profile) continue;

      let generated;
      switch (normalized) {
        case 'telegram':
          generated = this.generateTelegramVariant(post, profile, requestedTone);
          break;
        case 'mock_x':
        case 'x':
          generated = this.generateMockXVariant(post, profile, requestedTone);
          break;
        case 'mock_linkedin':
        case 'linkedin':
          generated = this.generateMockLinkedInVariant(post, profile, requestedTone);
          break;
        default:
          continue;
      }

      // Validate against platform profile
      const validation = ConstraintValidator.validate({
        content: generated.content,
        hashtags: generated.hashtags,
        tone: generated.tone,
        profile,
      });

      variants.push({
        platform: rawPlatform, // Preserve exact platform name provided
        content: generated.content,
        body: generated.content,
        hashtags: generated.hashtags,
        tone: generated.tone,
        validation,
      });
    }

    return variants;
  }

  static generateTelegramVariant(post, profile, requestedTone) {
    const tone = requestedTone || 'informative';
    const hashtags = this.extractHashtags(`${post.title} ${post.summary}`, Math.min(3, profile.max_hashtags || 3));

    const sourceRef = post.source_url ? `\n\n🔗 Read the full story: ${post.source_url}` : '';
    const content = `📢 <b>${post.title}</b>\n\n${post.summary || post.raw_content.slice(0, 400)}${sourceRef}`;

    return {
      content,
      hashtags,
      tone,
    };
  }

  static generateMockXVariant(post, profile, requestedTone) {
    const tone = requestedTone || 'punchy';
    const hashtags = this.extractHashtags(post.title, Math.min(2, profile.max_hashtags || 2));
    if (hashtags.length === 0) hashtags.push('#Tech', '#Updates');

    const hashtagString = hashtags.join(' ');
    // Max length is 280. Leave room for hashtags + spacing
    const maxCharsForBody = profile.max_length - hashtagString.length - 10;

    let body = `🚀 ${post.title}\n\n${post.summary || post.raw_content}`;
    if (body.length > maxCharsForBody) {
      body = body.slice(0, maxCharsForBody - 3).trim() + '...';
    }

    return {
      content: body,
      hashtags,
      tone,
    };
  }

  static generateMockLinkedInVariant(post, profile, requestedTone) {
    const tone = requestedTone || 'thought-leadership';
    const hashtags = this.extractHashtags(`${post.title} ${post.summary}`, Math.min(3, profile.max_hashtags || 3));
    if (hashtags.length < (profile.min_hashtags || 2)) {
      hashtags.push('#Leadership', '#Innovation');
    }

    const sourceRef = post.source_url ? `\n\n📌 Full article & sources: ${post.source_url}` : '';
    const content = `💡 **Key Takeaways: ${post.title}**\n\n${post.summary || post.raw_content.slice(0, 600)}\n\nWhat are your thoughts on this approach? Share your perspective in the comments below! 👇${sourceRef}`;

    return {
      content,
      hashtags,
      tone,
    };
  }
}
