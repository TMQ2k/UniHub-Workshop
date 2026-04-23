import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/index.js';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Maximum number of tokens (requests) per window */
  maxTokens: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Rate Limiting Guard using Token Bucket algorithm backed by Redis.
 *
 * Key format: rate_limit:{ip}:{endpoint}
 * Value stored as JSON: { tokens: number, lastRefill: timestamp_ms }
 *
 * Uses a Lua script for atomic token bucket operations to prevent
 * race conditions under concurrent requests.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  /**
   * Lua script for atomic Token Bucket implementation.
   * KEYS[1] = rate limit key
   * ARGV[1] = maxTokens
   * ARGV[2] = windowSeconds (refill interval in seconds)
   * ARGV[3] = current time in milliseconds
   *
   * Returns: [allowed (0|1), remainingTokens]
   */
  private readonly TOKEN_BUCKET_SCRIPT = `
    local key = KEYS[1]
    local maxTokens = tonumber(ARGV[1])
    local windowSeconds = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local bucket = redis.call('GET', key)
    local tokens
    local lastRefill

    if bucket then
      local data = cjson.decode(bucket)
      tokens = tonumber(data.tokens)
      lastRefill = tonumber(data.lastRefill)
    else
      tokens = maxTokens
      lastRefill = now
    end

    -- Calculate tokens to add based on elapsed time
    local elapsed = (now - lastRefill) / 1000
    local refillRate = maxTokens / windowSeconds
    local newTokens = math.min(maxTokens, tokens + (elapsed * refillRate))
    lastRefill = now

    if newTokens >= 1 then
      newTokens = newTokens - 1
      local data = cjson.encode({ tokens = newTokens, lastRefill = lastRefill })
      redis.call('SET', key, data, 'EX', windowSeconds)
      return { 1, math.floor(newTokens) }
    else
      local data = cjson.encode({ tokens = newTokens, lastRefill = lastRefill })
      redis.call('SET', key, data, 'EX', windowSeconds)
      return { 0, 0 }
    end
  `;

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no @RateLimit() decorator is applied, allow access
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const endpoint = `${request.method}:${request.route?.path || request.url}`;

    const redisKey = `rate_limit:${ip}:${endpoint}`;
    const now = Date.now();

    try {
      const result = await this.redis.eval(
        this.TOKEN_BUCKET_SCRIPT,
        1,
        redisKey,
        options.maxTokens,
        options.windowSeconds,
        now,
      ) as [number, number];

      const [allowed, remaining] = result;

      // Set rate limit headers for observability
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', options.maxTokens);
      response.setHeader('X-RateLimit-Remaining', remaining);

      if (!allowed) {
        this.logger.warn(`Rate limit exceeded for IP ${ip} on ${endpoint}`);
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      // If it's our own rate limit error, re-throw
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis failure → fail open (allow request) to avoid blocking the system
      this.logger.error(
        `Rate limit check failed for ${redisKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }
}
