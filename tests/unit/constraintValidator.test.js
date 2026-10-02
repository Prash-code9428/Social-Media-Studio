import { describe, it, expect } from 'vitest';
import { ConstraintValidator } from '../../src/variants/constraintValidator.js';
import { VALIDATION_STATUS } from '../../src/config/constants.js';

describe('ConstraintValidator', () => {
  const profileX = {
    platform: 'x',
    max_length: 280,
    allowed_tones: ['casual', 'urgent', 'witty', 'punchy'],
    max_hashtags: 4,
    min_hashtags: 1,
  };

  it('should validate compliant variant', () => {
    const res = ConstraintValidator.validate({
      content: 'Just launched our new distributed queue architecture! 🚀',
      hashtags: ['#NodeJS', '#Tech'],
      tone: 'punchy',
      profile: profileX,
    });

    expect(res.isValid).toBe(true);
    expect(res.validationStatus).toBe(VALIDATION_STATUS.VALID);
    expect(res.errors).toHaveLength(0);
  });

  it('should reject content exceeding maximum length', () => {
    const longContent = 'A'.repeat(300);
    const res = ConstraintValidator.validate({
      content: longContent,
      hashtags: ['#Tech'],
      tone: 'punchy',
      profile: profileX,
    });

    expect(res.isValid).toBe(false);
    expect(res.validationStatus).toBe(VALIDATION_STATUS.INVALID);
    expect(res.errors.some((e) => e.rule === 'MAX_LENGTH_EXCEEDED')).toBe(true);
  });

  it('should reject unallowed tones', () => {
    const res = ConstraintValidator.validate({
      content: 'Short valid tweet.',
      hashtags: ['#Tech'],
      tone: 'unallowed_tone_name',
      profile: profileX,
    });

    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.rule === 'INVALID_TONE')).toBe(true);
  });

  it('should enforce min and max hashtag bounds', () => {
    // 0 hashtags when min is 1
    const resMin = ConstraintValidator.validate({
      content: 'Short tweet with zero tags.',
      hashtags: [],
      tone: 'casual',
      profile: profileX,
    });
    expect(resMin.isValid).toBe(false);
    expect(resMin.errors.some((e) => e.rule === 'MIN_HASHTAGS_REQUIRED')).toBe(true);

    // 5 hashtags when max is 4
    const resMax = ConstraintValidator.validate({
      content: 'Short tweet with too many tags.',
      hashtags: ['#One', '#Two', '#Three', '#Four', '#Five'],
      tone: 'casual',
      profile: profileX,
    });
    expect(resMax.isValid).toBe(false);
    expect(resMax.errors.some((e) => e.rule === 'MAX_HASHTAGS_EXCEEDED')).toBe(true);
  });
});
