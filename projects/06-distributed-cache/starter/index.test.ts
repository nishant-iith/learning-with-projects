import { describe, it, expect } from 'vitest';
import { LRUDistributedCache, RESPParser } from './index.js';

describe('Distributed Cache Lab 06: Redis Clone', () => {

  describe('LRU Eviction & Caching', () => {
    it('should evict the least recently used key when capacity is reached', () => {
      const cache = new LRUDistributedCache(2);

      cache.set('key1', 'val1');
      cache.set('key2', 'val2');
      
      expect(cache.get('key1')).toBe('val1'); // Access key1 to make key2 the least recently used

      cache.set('key3', 'val3'); // Should evict key2 due to capacity limit 2

      expect(cache.get('key1')).toBe('val1');
      expect(cache.get('key2')).toBeNull(); // Evicted!
      expect(cache.get('key3')).toBe('val3');
    });

    it('should support TTL expiration and dynamic expire updates', async () => {
      const cache = new LRUDistributedCache(5);

      cache.set('key1', 'val1', 0.1); // 100ms TTL
      expect(cache.get('key1')).toBe('val1');

      // Wait 120ms for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(cache.get('key1')).toBeNull(); // Expired!

      cache.set('key2', 'val2');
      expect(cache.expire('key2', 0.1)).toBe(true); // Expire after 100ms

      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(cache.get('key2')).toBeNull(); // Expired!
    });
  });

  describe('RESP Protocol Parser', () => {
    it('should serialize simple strings', () => {
      expect(RESPParser.serializeString('OK')).toBe("+OK\r\n");
    });

    it('should serialize bulk strings', () => {
      expect(RESPParser.serializeBulkString('hello')).toBe("$5\r\nhello\r\n");
      expect(RESPParser.serializeBulkString(null)).toBe("$-1\r\n");
    });

    it('should parse RESP arrays correctly', () => {
      const parsed = RESPParser.parseArray("*2\r\n$3\r\nGET\r\n$4\r\nname\r\n");
      expect(parsed).toEqual(['GET', 'name']);
    });
  });
});

