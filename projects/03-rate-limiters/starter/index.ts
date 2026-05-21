export interface RateLimiter {
  allow(clientId: string): boolean;
}

export class TokenBucketLimiter implements RateLimiter {
  private capacity: number;
  private refillRate: number; // Tokens per millisecond
  private clientBuckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond / 1000;
  }

  public allow(clientId: string): boolean {
    // TODO: Retrieve client's bucket state. If not present, initialize with full capacity.
    // TODO: Calculate dynamic refill based on time elapsed since lastRefill:
    //       tokens = Math.min(capacity, tokens + elapsedMilliseconds * refillRate)
    // TODO: If tokens >= 1, decrement by 1, update state, and return true.
    // TODO: Otherwise, return false.
    throw new Error('TokenBucketLimiter.allow is not implemented');
  }
}

export class LeakyBucketLimiter implements RateLimiter {
  private capacity: number;
  private leakRate: number; // Requests per millisecond
  private clientQueues: Map<string, { queueSize: number; lastLeak: number }> = new Map();

  constructor(capacity: number, leakRatePerSecond: number) {
    this.capacity = capacity;
    this.leakRate = leakRatePerSecond / 1000;
  }

  public allow(clientId: string): boolean {
    // TODO: Retrieve client's queue state. If not present, initialize.
    // TODO: Calculate leaks based on time elapsed:
    //       leaked = Math.floor(elapsedMilliseconds * leakRate)
    //       queueSize = Math.max(0, queueSize - leaked)
    // TODO: If queueSize < capacity, increment queueSize, update state, and return true.
    // TODO: Otherwise, return false.
    throw new Error('LeakyBucketLimiter.allow is not implemented');
  }
}

export class FixedWindowLimiter implements RateLimiter {
  private limit: number;
  private windowSize: number; // In milliseconds
  private clientWindows: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(limit: number, windowSizeSeconds: number) {
    this.limit = limit;
    this.windowSize = windowSizeSeconds * 1000;
  }

  public allow(clientId: string): boolean {
    // TODO: Retrieve client's window state.
    // TODO: If time elapsed since windowStart >= windowSize, reset windowStart to now and count to 0.
    // TODO: If count < limit, increment count and return true.
    // TODO: Otherwise, return false.
    throw new Error('FixedWindowLimiter.allow is not implemented');
  }
}

export class SlidingWindowLogLimiter implements RateLimiter {
  private limit: number;
  private windowSize: number; // In milliseconds
  private clientLogs: Map<string, number[]> = new Map();

  constructor(limit: number, windowSizeSeconds: number) {
    this.limit = limit;
    this.windowSize = windowSizeSeconds * 1000;
  }

  public allow(clientId: string): boolean {
    // TODO: Retrieve client's timestamp log array. If not present, initialize empty.
    // TODO: Filter out timestamps older than (now - windowSize).
    // TODO: If log length < limit, push now's timestamp to log, update client state, and return true.
    // TODO: Otherwise, return false.
    throw new Error('SlidingWindowLogLimiter.allow is not implemented');
  }
}
