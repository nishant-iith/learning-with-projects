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
    // TODO: Retrieve key. If not present, return null.
    // TODO: Check if key has expired (now > expiresAt). If expired, delete key and return null.
    // TODO: Mark key as recently used (move to the end of lruList).
    // TODO: Return value.
    throw new Error('get is not implemented');
  }

  public set(key: string, value: string, ttlSeconds?: number) {
    // TODO: If key exists, update value and mark recently used.
    // TODO: If key is new:
    //       - If size >= capacity, evict the least recently used key (first element in lruList).
    //       - Create and insert the new CacheEntry.
    // TODO: Configure expiresAt if ttlSeconds is specified.
    throw new Error('set is not implemented');
  }

  public delete(key: string): boolean {
    // TODO: Delete key from cache and remove from lruList.
    throw new Error('delete is not implemented');
  }

  public expire(key: string, ttlSeconds: number): boolean {
    // TODO: Set expiresAt timestamp for an existing key. If key not found, return false.
    throw new Error('expire is not implemented');
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
    // TODO: Format string as RESP simple string (e.g. "+OK\r\n")
    throw new Error('serializeString is not implemented');
  }

  public static serializeBulkString(str: string | null): string {
    // TODO: Format string as RESP bulk string (e.g. "$5\r\nhello\r\n")
    // TODO: Null strings should be serialized as "$-1\r\n"
    throw new Error('serializeBulkString is not implemented');
  }

  public static parseArray(resp: string): string[] {
    // TODO: Parse RESP array protocol (e.g. "*2\r\n$3\r\nGET\r\n$4\r\nname\r\n" -> ["GET", "name"])
    throw new Error('parseArray is not implemented');
  }
}
