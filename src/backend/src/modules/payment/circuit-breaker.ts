import { Logger } from '@nestjs/common';

/**
 * Circuit Breaker states.
 *
 * CLOSED  → forward requests normally, count consecutive failures.
 * OPEN    → reject immediately with error (fail fast).
 * HALF_OPEN → allow ONE probe request to test if the service recovered.
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/** Threshold: consecutive failures to trigger OPEN */
const FAILURE_THRESHOLD = 5;

/** Time window for failures (ms) — 30 seconds */
const FAILURE_WINDOW_MS = 30_000;

/** Time to wait before transitioning from OPEN to HALF_OPEN (ms) — 60 seconds */
const RESET_TIMEOUT_MS = 60_000;

/**
 * Circuit Breaker — isolates payment gateway failures.
 *
 * Three states: CLOSED → OPEN → HALF_OPEN.
 * - CLOSED: normal operation, counts consecutive failures.
 * - OPEN: rejects all requests immediately (503 PAYMENT_UNAVAILABLE).
 * - HALF_OPEN: allows 1 probe request. Success → CLOSED. Failure → OPEN.
 *
 * Only affects payment flow. Other features (workshops, free registrations,
 * check-in) are NEVER impacted by circuit breaker state.
 */
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private firstFailureTimestamp: number | null = null;
  private lastOpenTimestamp: number | null = null;

  getState(): CircuitBreakerState {
    // Check if OPEN should transition to HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN && this.lastOpenTimestamp) {
      const elapsed = Date.now() - this.lastOpenTimestamp;
      if (elapsed >= RESET_TIMEOUT_MS) {
        this.logger.log('Circuit Breaker: OPEN → HALF_OPEN (reset timeout elapsed)');
        this.state = CircuitBreakerState.HALF_OPEN;
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @throws Error if circuit is OPEN
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      this.logger.warn('Circuit Breaker: OPEN — rejecting request');
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation — reset failure counter.
   */
  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.logger.log('Circuit Breaker: HALF_OPEN → CLOSED (probe succeeded)');
    }
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.firstFailureTimestamp = null;
    this.lastOpenTimestamp = null;
  }

  /**
   * Record a failed operation — may trigger state transition.
   */
  private onFailure(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Probe failed → back to OPEN
      this.logger.warn('Circuit Breaker: HALF_OPEN → OPEN (probe failed)');
      this.tripOpen();
      return;
    }

    // CLOSED state — count failures
    const now = Date.now();

    if (this.firstFailureTimestamp === null) {
      this.firstFailureTimestamp = now;
    }

    // Check if failures are within the time window
    const elapsed = now - this.firstFailureTimestamp;
    if (elapsed > FAILURE_WINDOW_MS) {
      // Window expired — reset counter, start fresh
      this.failureCount = 1;
      this.firstFailureTimestamp = now;
      return;
    }

    this.failureCount++;

    if (this.failureCount >= FAILURE_THRESHOLD) {
      this.logger.warn(
        `Circuit Breaker: CLOSED → OPEN (${this.failureCount} failures in ${elapsed}ms)`,
      );
      this.tripOpen();
    }
  }

  private tripOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastOpenTimestamp = Date.now();
    this.failureCount = 0;
    this.firstFailureTimestamp = null;
  }

  /** Expose internals for testing only */
  _getInternals() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      firstFailureTimestamp: this.firstFailureTimestamp,
      lastOpenTimestamp: this.lastOpenTimestamp,
    };
  }

  /** Force state for testing only */
  _setState(state: CircuitBreakerState): void {
    this.state = state;
  }

  /** Force lastOpenTimestamp for testing only */
  _setLastOpenTimestamp(ts: number): void {
    this.lastOpenTimestamp = ts;
  }
}

/**
 * Custom error thrown when Circuit Breaker is OPEN.
 */
export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is OPEN — payment service unavailable');
    this.name = 'CircuitBreakerOpenError';
  }
}
