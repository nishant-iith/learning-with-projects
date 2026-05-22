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
    const now = Date.now();
    let state = this.clientBuckets.get(clientId);
    if (!state) {
      state = { tokens: this.capacity, lastRefill: now };
    } else {
      const elapsed = now - state.lastRefill;
      const refilled = elapsed * this.refillRate;
      state.tokens = Math.min(this.capacity, state.tokens + refilled);
      state.lastRefill = now;
    }

    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.clientBuckets.set(clientId, state);
      return true;
    } else {
      this.clientBuckets.set(clientId, state);
      return false;
    }
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
    const now = Date.now();
    let state = this.clientQueues.get(clientId);
    if (!state) {
      state = { queueSize: 0, lastLeak: now };
    } else {
      const elapsed = now - state.lastLeak;
      const leaked = Math.floor(elapsed * this.leakRate);
      if (leaked > 0) {
        state.queueSize = Math.max(0, state.queueSize - leaked);
        state.lastLeak = state.lastLeak + leaked / this.leakRate;
      }
    }

    if (state.queueSize < this.capacity) {
      state.queueSize += 1;
      this.clientQueues.set(clientId, state);
      return true;
    } else {
      this.clientQueues.set(clientId, state);
      return false;
    }
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
    const now = Date.now();
    let state = this.clientWindows.get(clientId);
    if (!state) {
      state = { count: 0, windowStart: now };
    }

    if (now - state.windowStart >= this.windowSize) {
      state.windowStart = now;
      state.count = 0;
    }

    if (state.count < this.limit) {
      state.count += 1;
      this.clientWindows.set(clientId, state);
      return true;
    } else {
      this.clientWindows.set(clientId, state);
      return false;
    }
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
    const now = Date.now();
    let log = this.clientLogs.get(clientId) || [];

    const threshold = now - this.windowSize;
    log = log.filter((ts) => ts > threshold);

    if (log.length < this.limit) {
      log.push(now);
      this.clientLogs.set(clientId, log);
      return true;
    } else {
      this.clientLogs.set(clientId, log);
      return false;
    }
  }
}
