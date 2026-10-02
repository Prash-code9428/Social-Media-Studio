export const PLATFORMS = {
  TELEGRAM: 'telegram',
  MOCK_X: 'mock_x',
  MOCK_LINKEDIN: 'mock_linkedin',
  X: 'x',
  LINKEDIN: 'linkedin',
};

export const SUPPORTED_PLATFORMS = ['telegram', 'mock_x', 'mock_linkedin', 'x', 'linkedin'];

export const CONFIG_PLATFORMS = ['telegram', 'mock_x', 'mock_linkedin'];

export function normalizePlatform(platform) {
  if (!platform) return 'telegram';
  const p = platform.toLowerCase().trim();
  if (p === 'x' || p === 'mock_x' || p === 'twitter') return 'mock_x';
  if (p === 'linkedin' || p === 'mock_linkedin') return 'mock_linkedin';
  if (p === 'telegram') return 'telegram';
  return p;
}

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
    platform: 'telegram',
    max_length: 4096,
    allowed_tones_json: JSON.stringify(['professional', 'casual', 'urgent', 'informative', 'engaging']),
    max_hashtags: 10,
    min_hashtags: 0,
    media_allowed: 1,
  },
  {
    id: 'cp_mock_x',
    platform: 'mock_x',
    max_length: 280,
    allowed_tones_json: JSON.stringify(['casual', 'urgent', 'witty', 'punchy', 'informative']),
    max_hashtags: 4,
    min_hashtags: 1,
    media_allowed: 1,
  },
  {
    id: 'cp_x',
    platform: 'x',
    max_length: 280,
    allowed_tones_json: JSON.stringify(['casual', 'urgent', 'witty', 'punchy', 'informative']),
    max_hashtags: 4,
    min_hashtags: 1,
    media_allowed: 1,
  },
  {
    id: 'cp_mock_linkedin',
    platform: 'mock_linkedin',
    max_length: 3000,
    allowed_tones_json: JSON.stringify(['professional', 'thought-leadership', 'industry-insight', 'informative']),
    max_hashtags: 5,
    min_hashtags: 2,
    media_allowed: 1,
  },
  {
    id: 'cp_linkedin',
    platform: 'linkedin',
    max_length: 3000,
    allowed_tones_json: JSON.stringify(['professional', 'thought-leadership', 'industry-insight', 'informative']),
    max_hashtags: 5,
    min_hashtags: 2,
    media_allowed: 1,
  },
];

export const QUEUE_NAME = 'social-publish-queue';
