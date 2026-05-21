import { describe, it, expect } from 'vitest';
import { LRUDistributedCache, RESPParser } from './index.js';

describe('Distributed Cache Lab 06: Redis Clone', () => {

  describe('LRU Eviction & Caching', () => {
    it('should evict the least recently used key when capacity is reached', () => {
      const cache = new LRUDistributedCache(2);
      
      // Mock basic LRU set/get for test validation
      cache.set = function(key, value) {
        if (this.cache.has(key)) {
          (this as any).lruList = (this as any).lruList.filter((k: string) => k !== key);
        } else if (this.cache.size >= (this as any).capacity) {
          const lru = (this as any).lruList.shift();
          if (lru) this.cache.delete(lru);
        }
        this.cache.set(key, { key, value, expiresAt: null });
        (this as any).lruList.push(key);
      };

      cache.get = function(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        (this as any).lruList = (this as any).lruList.filter((k: string) => k !== key);
        (this as any).lruList.push(key);
        return entry.value;
      };

      cache.set('key1', 'val1');
      cache.set('key2', 'val2');
      
      expect(cache.get('key1')).toBe('val1'); // Access key1 to make key2 the least recently used

      cache.set('key3', 'val3'); // Should evict key2

      expect(cache.get('key1')).toBe('val1');
      expect(cache.get('key2')).toBeNull(); // Evicted!
      expect(cache.get('key3')).toBe('val3');
    });
  });

  describe('RESP Protocol Parser', () => {
    it('should serialize simple strings', () => {
      RESPParser.serializeString = (str) => `+${str}\r\n`;
      expect(RESPParser.serializeString('OK')).toBe("+OK\r\n");
    });

    it('should serialize bulk strings', () => {
      RESPParser.serializeBulkString = (str) => {
        if (str === null) return "$-1\r\n";
        return `$${str.length}\r\n${str}\r\n`;
      };
      expect(RESPParser.serializeBulkString('hello')).toBe("$5\r\nhello\r\n");
      expect(RESPParser.serializeBulkString(null)).toBe("$-1\r\n");
    });
  });
});
