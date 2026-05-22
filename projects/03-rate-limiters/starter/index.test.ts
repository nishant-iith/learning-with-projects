import { describe, it, expect } from 'vitest';
import { TokenBucketLimiter, LeakyBucketLimiter, FixedWindowLimiter, SlidingWindowLogLimiter } from './index.js';

describe('Rate Limiters Lab 03: Throttling & Traffic Control', () => {

  describe('Token Bucket Limiter', () => {
    it('should allow requests up to capacity and then throttle', () => {
      const limiter = new TokenBucketLimiter(3, 1); // Capacity 3, Refill 1 per second
      
      expect(limiter.allow('user_1')).toBe(true);
      expect(limiter.allow('user_1')).toBe(true);
      expect(limiter.allow('user_1')).toBe(true);
      expect(limiter.allow('user_1')).toBe(false); // Throttled
    });

    it('should refill tokens over time', async () => {
      const limiter = new TokenBucketLimiter(2, 10); // Capacity 2, Refill 10 per second (1 token per 100ms)
      
      expect(limiter.allow('user_2')).toBe(true);
      expect(limiter.allow('user_2')).toBe(true);
      expect(limiter.allow('user_2')).toBe(false);

      // Wait 120ms to allow 1 token to refill
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(limiter.allow('user_2')).toBe(true); // Refilled!
    });
  });

  describe('Fixed Window Limiter', () => {
    it('should reset limits when entering a new window', async () => {
      const limiter = new FixedWindowLimiter(2, 0.2); // Limit 2, Window size 200ms
      
      expect(limiter.allow('user_3')).toBe(true);
      expect(limiter.allow('user_3')).toBe(true);
      expect(limiter.allow('user_3')).toBe(false);

      // Wait 220ms for the window to reset
      await new Promise((resolve) => setTimeout(resolve, 220));
      expect(limiter.allow('user_3')).toBe(true); // New window!
    });
  });

  describe('Sliding Window Log Limiter', () => {
    it('should slide smoothly and not experience boundary bursts', async () => {
      const limiter = new SlidingWindowLogLimiter(2, 0.2); // Limit 2, Window size 200ms
      
      expect(limiter.allow('user_4')).toBe(true);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(limiter.allow('user_4')).toBe(true);
      expect(limiter.allow('user_4')).toBe(false); // Throttle since 2 requests are within 200ms

      await new Promise((resolve) => setTimeout(resolve, 110)); // Total 210ms elapsed since 1st req
      expect(limiter.allow('user_4')).toBe(true); // Allowed because 1st request dropped out of the sliding window
    });
  });

  describe('Leaky Bucket Limiter', () => {
    it('should queue requests up to capacity and leak over time', async () => {
      const limiter = new LeakyBucketLimiter(3, 10); // Capacity 3, Leak rate 10 per second (1 leak per 100ms)
      
      expect(limiter.allow('user_leaky')).toBe(true); // queue size 1
      expect(limiter.allow('user_leaky')).toBe(true); // queue size 2
      expect(limiter.allow('user_leaky')).toBe(true); // queue size 3 (at capacity)
      expect(limiter.allow('user_leaky')).toBe(false); // Throttled!
      
      // Wait 120ms to allow 1 request to leak
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(limiter.allow('user_leaky')).toBe(true); // Can add to queue again
    });
  });
});


