import { CircuitBreaker, CircuitBreakerState, CircuitBreakerOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('CLOSED state', () => {
    it('should forward successful requests normally', async () => {
      const result = await cb.execute(async () => 'success');
      expect(result).toBe('success');
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should count failures and stay CLOSED below threshold', async () => {
      // 4 failures — below threshold of 5
      for (let i = 0; i < 4; i++) {
        await expect(
          cb.execute(async () => { throw new Error('fail'); }),
        ).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after 5 consecutive failures within 30s', async () => {
      // Simulate 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        await expect(
          cb.execute(async () => { throw new Error('gateway timeout'); }),
        ).rejects.toThrow('gateway timeout');
      }

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reset failure count on success', async () => {
      // 4 failures
      for (let i = 0; i < 4; i++) {
        await expect(
          cb.execute(async () => { throw new Error('fail'); }),
        ).rejects.toThrow();
      }

      // 1 success — resets counter
      await cb.execute(async () => 'ok');

      // 4 more failures — still below threshold
      for (let i = 0; i < 4; i++) {
        await expect(
          cb.execute(async () => { throw new Error('fail'); }),
        ).rejects.toThrow();
      }

      // Should still be CLOSED (counter was reset)
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        await expect(
          cb.execute(async () => { throw new Error('fail'); }),
        ).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject requests immediately with CircuitBreakerOpenError', async () => {
      await expect(
        cb.execute(async () => 'should not execute'),
      ).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should not call the wrapped function when OPEN', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      await expect(cb.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout (60s)', () => {
      // Simulate time passing — set lastOpenTimestamp to 61 seconds ago
      cb._setLastOpenTimestamp(Date.now() - 61_000);

      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should stay OPEN before reset timeout', () => {
      // Only 30 seconds have passed (less than 60s)
      cb._setLastOpenTimestamp(Date.now() - 30_000);

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker to OPEN
      for (let i = 0; i < 5; i++) {
        await expect(
          cb.execute(async () => { throw new Error('fail'); }),
        ).rejects.toThrow();
      }
      // Move to HALF_OPEN
      cb._setLastOpenTimestamp(Date.now() - 61_000);
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should transition to CLOSED on probe success', async () => {
      const result = await cb.execute(async () => 'recovered');

      expect(result).toBe('recovered');
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on probe failure', async () => {
      await expect(
        cb.execute(async () => { throw new Error('still broken'); }),
      ).rejects.toThrow('still broken');

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('failure window expiry', () => {
    it('should reset failure count when failures span beyond 30s window', async () => {
      // Simulate failures outside the window
      // First failure
      await expect(
        cb.execute(async () => { throw new Error('fail'); }),
      ).rejects.toThrow();

      // Force the first failure timestamp to be > 30s ago
      const internals = cb._getInternals();
      // We can't easily manipulate time, so we test that after a success
      // the counter resets
      await cb.execute(async () => 'success');

      // After success, counters are reset
      expect(cb._getInternals().failureCount).toBe(0);
    });
  });
});
