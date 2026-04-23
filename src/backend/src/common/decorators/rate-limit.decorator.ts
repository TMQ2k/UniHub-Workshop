import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../guards/rate-limit.guard.js';

/**
 * Decorator to apply rate limiting to an endpoint.
 *
 * Usage:
 *   @RateLimit({ maxTokens: 100, windowSeconds: 60 })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
