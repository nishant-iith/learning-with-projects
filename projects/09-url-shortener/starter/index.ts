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
    throw new Error("Not implemented");
  }

  getPublishedEvents(): ClickEvent[] {
    throw new Error("Not implemented");
  }
}

export class Base62Converter {
  private static readonly CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /**
   * Encodes a positive integer into a Base62 alphanumeric string.
   */
  static encode(id: number): string {
    throw new Error("Not implemented");
  }

  /**
   * Decodes a Base62 alphanumeric string back into a positive integer.
   */
  static decode(str: string): number {
    throw new Error("Not implemented");
  }
}

export class URLShortenerService {
  constructor(
    private readonly db: Map<number, string>, // Mock relational database: ID -> Long URL
    private readonly cache: Map<string, string>, // Mock Redis Cache: Key -> Long URL
    private readonly mq: IMessageQueue, // Mock Analytics Message Queue
    private nextId: number = 100000 // Starting ID generator
  ) {}

  /**
   * Shortens a destination URL. Generates a sequential ID, encodes it in Base62,
   * stores it in the database, and returns the path key.
   */
  async shorten(longUrl: string): Promise<string> {
    throw new Error("Not implemented");
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
    throw new Error("Not implemented");
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
    throw new Error("Not implemented");
  }
}
