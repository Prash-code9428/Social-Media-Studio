export const PLATFORMS = {
  TELEGRAM: 'telegram',
  X: 'x',
  LINKEDIN: 'linkedin',
};

export const SUPPORTED_PLATFORMS = Object.values(PLATFORMS);

export const VARIANT_STATUS = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PUBLISHED: 'published',
};

export const VALIDATION_STATUS = {
  PENDING: 'pending',
  VALID: 'valid',
  INVALID: 'invalid',
};

export const SCHEDULE_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const PUBLISH_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
};

export const DEFAULT_PROFILES = [
  {
    id: 'cp_telegram',
    platform: PLATFORMS.TELEGRAM,
    max_length: 4096,
    allowed_tones_json: JSON.stringify(['professional', 'casual', 'urgent', 'informative', 'engaging']),
    max_hashtags: 10,
    min_hashtags: 0,
    media_allowed: 1,
  },
  {
    id: 'cp_x',
    platform: PLATFORMS.X,
    max_length: 280,
    allowed_tones_json: JSON.stringify(['casual', 'urgent', 'witty', 'punchy', 'informative']),
    max_hashtags: 4,
    min_hashtags: 1,
    media_allowed: 1,
  },
  {
    id: 'cp_linkedin',
    platform: PLATFORMS.LINKEDIN,
    max_length: 3000,
    allowed_tones_json: JSON.stringify(['professional', 'thought-leadership', 'industry-insight', 'informative']),
    max_hashtags: 5,
    min_hashtags: 2,
    media_allowed: 1,
  },
];

export const QUEUE_NAME = 'social-publish-queue';
