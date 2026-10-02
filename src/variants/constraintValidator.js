import { VALIDATION_STATUS } from '../config/constants.js';

export class ConstraintValidator {
  /**
   * Validate variant content against a platform constraint profile.
   * @param {object} params
   * @param {string} params.content
   * @param {string[]} [params.hashtags]
   * @param {string} params.tone
   * @param {object} params.profile
   * @returns {{ isValid: boolean, validationStatus: 'valid' | 'invalid', errors: Array<{ rule: string, message: string }> }}
   */
  static validate({ content, hashtags = [], tone, profile }) {
    if (!profile) {
      throw new Error('Constraint profile is required for validation');
    }

    const errors = [];
    const platformName = profile.platform;

    // Format hashtags for length calculation
    const formattedHashtags = (hashtags || []).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
    const hashtagText = formattedHashtags.length > 0 ? `\n\n${formattedHashtags.join(' ')}` : '';
    const totalContent = `${content || ''}${hashtagText}`;
    const totalLength = totalContent.length;

    // 1. Content Empty Check
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      errors.push({
        rule: 'EMPTY_CONTENT',
        message: `Variant body cannot be empty for ${platformName}`,
      });
    }

    // 2. Max Length Check
    if (totalLength > profile.max_length) {
      errors.push({
        rule: 'MAX_LENGTH_EXCEEDED',
        message: `Variant exceeds maximum length for ${platformName}: ${totalLength} > ${profile.max_length}`,
      });
    }

    // 3. Allowed Tones Check
    const allowedTones = Array.isArray(profile.allowed_tones)
      ? profile.allowed_tones
      : JSON.parse(profile.allowed_tones_json || '[]');

    if (tone && allowedTones.length > 0 && !allowedTones.includes(tone.toLowerCase())) {
      errors.push({
        rule: 'INVALID_TONE',
        message: `Variant has invalid tone '${tone}' for ${platformName}: allowed tones are [${allowedTones.join(', ')}]`,
      });
    }

    // 4. Hashtag Count Limits Check
    const tagCount = formattedHashtags.length;
    if (profile.max_hashtags !== undefined && tagCount > profile.max_hashtags) {
      errors.push({
        rule: 'MAX_HASHTAGS_EXCEEDED',
        message: `Variant exceeds hashtag limit for ${platformName}: ${tagCount} > ${profile.max_hashtags}`,
      });
    }

    if (profile.min_hashtags !== undefined && tagCount < profile.min_hashtags) {
      errors.push({
        rule: 'MIN_HASHTAGS_REQUIRED',
        message: `Variant requires at least ${profile.min_hashtags} hashtags for ${platformName}: received ${tagCount}`,
      });
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      validationStatus: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
      errors,
    };
  }
}
