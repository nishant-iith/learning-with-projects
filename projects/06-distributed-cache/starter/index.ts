export interface CacheEntry {
  key: string;
  value: string;
  expiresAt: number | null; // Timestamp in milliseconds
}

export class LRUDistributedCache {
  protected capacity: number;
  protected cache: Map<string, CacheEntry> = new Map();
  // For LRU tracking (ordering keys by access)
  protected lruList: string[] = [];

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  public get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt !== null && now > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    // Mark key as recently used (move to the end of lruList)
    this.lruList = this.lruList.filter(k => k !== key);
    this.lruList.push(key);

    return entry.value;
  }

  public set(key: string, value: string, ttlSeconds?: number) {
    const now = Date.now();
    const expiresAt = ttlSeconds !== undefined && ttlSeconds !== null ? now + (ttlSeconds * 1000) : null;

    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.expiresAt = expiresAt;
      this.lruList = this.lruList.filter(k => k !== key);
      this.lruList.push(key);
    } else {
      if (this.cache.size >= this.capacity) {
        const lruKey = this.lruList.shift();
        if (lruKey) {
          this.cache.delete(lruKey);
        }
      }
      this.cache.set(key, { key, value, expiresAt });
      this.lruList.push(key);
    }
  }

  public delete(key: string): boolean {
    const exists = this.cache.delete(key);
    if (exists) {
      this.lruList = this.lruList.filter(k => k !== key);
    }
    return exists;
  }

  public expire(key: string, ttlSeconds: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (entry.expiresAt !== null && now > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    entry.expiresAt = now + (ttlSeconds * 1000);
    return true;
  }

  public getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  public size(): number {
    return this.cache.size;
  }
}

export class RESPParser {
  public static serializeString(str: string): string {
    return `+${str}\r\n`;
  }

  public static serializeBulkString(str: string | null): string {
    if (str === null) return "$-1\r\n";
    return `$${str.length}\r\n${str}\r\n`;
  }

  public static parseArray(resp: string): string[] {
    if (!resp.startsWith('*')) {
      throw new Error('Invalid RESP array');
    }

    const lines = resp.split('\r\n');
    if (lines.length === 0) return [];

    const countStr = lines[0].substring(1);
    const count = parseInt(countStr, 10);
    if (isNaN(count)) {
      throw new Error('Invalid RESP array size');
    }

    const result: string[] = [];
    let lineIdx = 1;

    for (let i = 0; i < count; i++) {
      if (lineIdx >= lines.length) {
        break;
      }

      const prefix = lines[lineIdx];
      if (prefix.startsWith('$')) {
        const len = parseInt(prefix.substring(1), 10);
        if (len === -1) {
          result.push('');
          lineIdx += 1;
        } else {
          const value = lines[lineIdx + 1];
          result.push(value || '');
          lineIdx += 2;
        }
      } else if (prefix.startsWith('+')) {
        result.push(prefix.substring(1));
        lineIdx += 1;
      } else {
        result.push(prefix);
        lineIdx += 1;
      }
    }

    return result;
  }
}

