import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { env } from '../config/env.js';

let sharedConnection = null;

export function getRedisConnection(options = {}) {
  const useMock = options.useMock !== undefined ? options.useMock : (env.USE_IN_MEMORY_REDIS || env.NODE_ENV === 'test');

  if (useMock) {
    if (!sharedConnection || !(sharedConnection instanceof RedisMock)) {
      sharedConnection = new RedisMock();
    }
    return sharedConnection;
  }

  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createRedisClient(options = {}) {
  const useMock = options.useMock !== undefined ? options.useMock : (env.USE_IN_MEMORY_REDIS || env.NODE_ENV === 'test');

  if (useMock) {
    return new RedisMock();
  }

  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
