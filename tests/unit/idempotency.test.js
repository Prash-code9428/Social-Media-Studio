import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../../src/queue/idempotency.js';

describe('Idempotency Key Generator', () => {
  it('should generate identical SHA-256 keys for the same variant and time slot', () => {
    const variantId = 'var_123';
    const time1 = '2026-10-02T15:30:00.123Z';
    const time2 = '2026-10-02T15:30:00.999Z'; // Same second slot

    const key1 = generateIdempotencyKey(variantId, time1);
    const key2 = generateIdempotencyKey(variantId, time2);

    expect(key1).toHaveLength(64);
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different time slots or variants', () => {
    const keyA = generateIdempotencyKey('var_1', '2026-10-02T15:30:00Z');
    const keyB = generateIdempotencyKey('var_2', '2026-10-02T15:30:00Z');
    const keyC = generateIdempotencyKey('var_1', '2026-10-02T15:31:00Z');

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});
