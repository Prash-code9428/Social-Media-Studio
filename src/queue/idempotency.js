import crypto from 'crypto';

/**
 * Generate a deterministic idempotency key for a variant and scheduled time slot.
 * Rounds timestamp to the nearest second to eliminate millisecond drift.
 * @param {string} variantId
 * @param {string|Date} scheduledTime
 * @returns {string} SHA-256 hash string
 */
export function generateIdempotencyKey(variantId, scheduledTime) {
  if (!variantId) {
    throw new Error('variantId is required to generate idempotency key');
  }

  const dateObj = new Date(scheduledTime);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid scheduledTime provided: ${scheduledTime}`);
  }

  // Normalize to ISO second (e.g. 2026-10-02T12:00:00Z)
  const normalizedSlot = new Date(Math.floor(dateObj.getTime() / 1000) * 1000).toISOString();

  return crypto
    .createHash('sha256')
    .update(`${variantId}:${normalizedSlot}`)
    .digest('hex');
}
