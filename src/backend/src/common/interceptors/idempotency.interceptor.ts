import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/index.js';

/** TTL for idempotency keys in Redis — 24 hours */
const IDEMPOTENCY_TTL_SECONDS = 86400;

/** Redis key prefix for idempotency */
const IDEMPOTENCY_PREFIX = 'idempotency';

/**
 * IdempotencyInterceptor — prevents double-charge by caching responses.
 *
 * Flow:
 * 1. Check for `Idempotency-Key` header → 400 if missing.
 * 2. Lookup key in Redis: `idempotency:{key}`.
 * 3. If found → return cached response immediately (skip handler).
 * 4. If not found → proceed with handler, then save response with TTL 24h.
 *
 * This is an Interceptor (not Guard) because Guards can only allow/deny.
 * Interceptors can short-circuit the handler AND modify the response.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    // Step 1: Validate header presence
    if (!idempotencyKey) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Header Idempotency-Key là bắt buộc.',
        },
      });
    }

    const redisKey = `${IDEMPOTENCY_PREFIX}:${idempotencyKey}`;

    // Step 2: Check if key already exists in Redis
    const cachedResponse = await this.redis.get(redisKey);

    if (cachedResponse) {
      this.logger.log(`Idempotency hit: key=${idempotencyKey} — returning cached response`);
      return of(JSON.parse(cachedResponse));
    }

    // Step 3: Proceed with handler, then cache the response
    // Store the key in the request so PaymentService can access it
    request.idempotencyKey = idempotencyKey;

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.redis.set(
            redisKey,
            JSON.stringify(response),
            'EX',
            IDEMPOTENCY_TTL_SECONDS,
          );
          this.logger.log(`Idempotency stored: key=${idempotencyKey}, TTL=${IDEMPOTENCY_TTL_SECONDS}s`);
        } catch (error) {
          // Redis failure on write → log but don't fail the request
          this.logger.error(
            `Failed to store idempotency key: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }
}
