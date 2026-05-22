/**
 * 🔬 Lab 09: System Design URL Shortener (Syllabus Capstone)
 * Namespace: org.learning.urlshortener
 * 
 * In this final capstone laboratory, you will implement a high-performance URL shortener service
 * with a Base62 encoder/decoder, a Cache-aside architecture, and an asynchronous analytics pipeline.
 */

export interface ClickEvent {
  key: string;
  timestamp: number;
  ip: string;
  userAgent: string;
}

export interface IMessageQueue {
  publish(event: ClickEvent): Promise<void>;
  getPublishedEvents(): ClickEvent[];
}

export class MockMessageQueue implements IMessageQueue {
  private events: ClickEvent[] = [];

  async publish(event: ClickEvent): Promise<void> {
    this.events.push(event);
  }

  getPublishedEvents(): ClickEvent[] {
    return this.events;
  }
}

export class Base62Converter {
  private static readonly CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /**
   * Encodes a positive integer into a Base62 alphanumeric string.
   */
  static encode(id: number): string {
    if (id === 0) return "0";
    let encoded = "";
    let temp = id;
    while (temp > 0) {
      const remainder = temp % 62;
      encoded = this.CHARSET[remainder] + encoded;
      temp = Math.floor(temp / 62);
    }
    return encoded;
  }

  /**
   * Decodes a Base62 alphanumeric string back into a positive integer.
   */
  static decode(str: string): number {
    let decoded = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const value = this.CHARSET.indexOf(char);
      if (value === -1) {
        throw new Error(`Invalid Base62 character: ${char}`);
      }
      decoded = decoded * 62 + value;
    }
    return decoded;
  }
}

export class URLShortenerService {
  private readonly reverseDb: Map<string, number> = new Map(); // Dynamic reverse mapping to handle and deduplicate URL entries

  constructor(
    private readonly db: Map<number, string>, // Mock relational database: ID -> Long URL
    private readonly cache: Map<string, string>, // Mock Redis Cache: Key -> Long URL
    private readonly mq: IMessageQueue, // Mock Analytics Message Queue
    private nextId: number = 100000 // Starting ID generator
  ) {
    // Populate reverseDb for any pre-existing elements in db
    for (const [id, url] of db.entries()) {
      this.reverseDb.set(url, id);
    }
  }

  /**
   * Shortens a destination URL. Generates a sequential ID, encodes it in Base62,
   * stores it in the database, and returns the path key.
   * If the URL is already shortened, returns the existing key (deduplication & collision avoidance).
   */
  async shorten(longUrl: string): Promise<string> {
    if (this.reverseDb.has(longUrl)) {
      const existingId = this.reverseDb.get(longUrl)!;
      return Base62Converter.encode(existingId);
    }

    const id = this.nextId++;
    const key = Base62Converter.encode(id);
    
    this.db.set(id, longUrl);
    this.reverseDb.set(longUrl, id);
    return key;
  }

  /**
   * Resolves a Base62 path key to its destination URL.
   * Utilizes a Cache-Aside strategy:
   * 1. Check in-memory cache. If found (Cache Hit), return and stream analytics.
   * 2. If not found (Cache Miss), query DB.
   * 3. If found in DB, update cache and stream analytics.
   * 4. If not found in DB, return null.
   * 
   * Analytics stream: Publishes a ClickEvent to the Message Queue asynchronously.
   */
  async resolve(key: string, ip: string, userAgent: string): Promise<string | null> {
    // 1. Check in-memory cache
    const cachedUrl = this.cache.get(key);
    if (cachedUrl) {
      // Stream analytics asynchronously
      this.mq.publish({
        key,
        timestamp: Date.now(),
        ip,
        userAgent
      });
      return cachedUrl;
    }

    // 2. Cache miss: check database
    try {
      const id = Base62Converter.decode(key);
      const longUrl = this.db.get(id);
      if (longUrl) {
        // Cache populate
        this.cache.set(key, longUrl);
        // Stream analytics asynchronously
        this.mq.publish({
          key,
          timestamp: Date.now(),
          ip,
          userAgent
        });
        return longUrl;
      }
    } catch {
      // Decode failed: invalid key structure
      return null;
    }

    return null;
  }
}

export interface MockRequest {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body?: any;
}

export class URLShortenerServer {
  constructor(private readonly service: URLShortenerService) {}

  /**
   * Simulates/Handles HTTP requests.
   * - POST /shorten: expectation body contains { url: "https://..." }. Returns { shortUrl: "/s/abc" }.
   * - GET /s/:key: resolves the key and returns a 302 Found with the Location header pointing to the destination URL.
   * - Returns 404/400 for invalid routes.
   */
  async handleRequest(req: MockRequest): Promise<MockResponse> {
    const method = req.method.toUpperCase();
    const url = req.url;

    if (method === "POST" && url === "/shorten") {
      if (!req.body || typeof req.body.url !== "string") {
        return {
          status: 400,
          headers: {},
          body: { error: "Invalid request payload" }
        };
      }
      const key = await this.service.shorten(req.body.url);
      return {
        status: 201,
        headers: {},
        body: { shortUrl: `/s/${key}` }
      };
    }

    if (method === "GET" && url.startsWith("/s/")) {
      const key = url.substring(3);
      if (!key) {
        return {
          status: 400,
          headers: {},
          body: { error: "Missing redirect key" }
        };
      }

      const ip = req.headers?.["x-forwarded-for"] || req.headers?.["x-real-ip"] || "127.0.0.1";
      const userAgent = req.headers?.["user-agent"] || "unknown";

      const longUrl = await this.service.resolve(key, ip, userAgent);
      if (longUrl) {
        return {
          status: 302,
          headers: {
            "Location": longUrl
          }
        };
      } else {
        return {
          status: 404,
          headers: {}
        };
      }
    }

    return {
      status: 404,
      headers: {}
    };
  }
}
