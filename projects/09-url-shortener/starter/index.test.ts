import { describe, it, expect, beforeEach } from "vitest";
import {
  Base62Converter,
  URLShortenerService,
  MockMessageQueue,
  URLShortenerServer,
  MockRequest
} from "./index.js";

describe("Base62Converter", () => {
  it("should encode and decode integer values correctly", () => {
    const value = 123456789;
    const encoded = Base62Converter.encode(value);
    expect(encoded).toBeTypeOf("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = Base62Converter.decode(encoded);
    expect(decoded).toBe(value);
  });

  it("should handle edge case 0", () => {
    const encoded = Base62Converter.encode(0);
    expect(encoded).toBe("0");
    expect(Base62Converter.decode("0")).toBe(0);
  });

  it("should throw error for invalid character decoding", () => {
    expect(() => Base62Converter.decode("invalid-char!@")).toThrow("Invalid Base62 character");
  });
});

describe("URLShortenerService", () => {
  let db: Map<number, string>;
  let cache: Map<string, string>;
  let mq: MockMessageQueue;
  let service: URLShortenerService;

  beforeEach(() => {
    db = new Map();
    cache = new Map();
    mq = new MockMessageQueue();
    service = new URLShortenerService(db, cache, mq);
  });

  it("should shorten a URL and save it to the database", async () => {
    const longUrl = "https://example.com/very/long/path/name?q=test";
    const key = await service.shorten(longUrl);
    expect(key).toBeTypeOf("string");
    expect(key.length).toBeGreaterThan(0);

    // Database should have stored the mapping
    expect(db.size).toBe(1);
    const storedId = Base62Converter.decode(key);
    expect(db.get(storedId)).toBe(longUrl);
  });

  it("should deduplicate and avoid collision when shortening identical URLs", async () => {
    const longUrl = "https://example.com/duplicate";
    const key1 = await service.shorten(longUrl);
    const key2 = await service.shorten(longUrl);

    expect(key1).toBe(key2);
    expect(db.size).toBe(1); // Relational database only stores 1 record
  });

  it("should resolve via Cache-Aside strategy", async () => {
    const longUrl = "https://google.com";
    const key = await service.shorten(longUrl);

    // Cache should be empty initially
    expect(cache.has(key)).toBe(false);

    // First resolve - Cache Miss
    const resolvedUrl1 = await service.resolve(key, "127.0.0.1", "Mozilla/5.0");
    expect(resolvedUrl1).toBe(longUrl);

    // Cache should now be populated
    expect(cache.get(key)).toBe(longUrl);

    // Corrupt the database to ensure we get it from Cache (Cache Hit verification)
    const storedId = Base62Converter.decode(key);
    db.delete(storedId);

    const resolvedUrl2 = await service.resolve(key, "127.0.0.1", "Mozilla/5.0");
    expect(resolvedUrl2).toBe(longUrl);
  });

  it("should return null on resolving non-existent keys gracefully without throwing errors", async () => {
    const result = await service.resolve("nonexistent", "127.0.0.1", "unknown");
    expect(result).toBeNull();
  });

  it("should stream click events asynchronously to MQ during resolve", async () => {
    const longUrl = "https://wikipedia.org";
    const key = await service.shorten(longUrl);

    await service.resolve(key, "192.168.1.5", "Chrome");

    const events = mq.getPublishedEvents();
    expect(events.length).toBe(1);
    expect(events[0].key).toBe(key);
    expect(events[0].ip).toBe("192.168.1.5");
    expect(events[0].userAgent).toBe("Chrome");
    expect(events[0].timestamp).toBeLessThanOrEqual(Date.now());
  });
});

describe("URLShortenerServer Simulation", () => {
  let db: Map<number, string>;
  let cache: Map<string, string>;
  let mq: MockMessageQueue;
  let server: URLShortenerServer;

  beforeEach(() => {
    db = new Map();
    cache = new Map();
    mq = new MockMessageQueue();
    const service = new URLShortenerService(db, cache, mq);
    server = new URLShortenerServer(service);
  });

  it("should handle /shorten POST and /s/:key GET requests", async () => {
    // 1. Post request to shorten
    const postReq: MockRequest = {
      method: "POST",
      url: "/shorten",
      body: { url: "https://github.com" }
    };
    const postRes = await server.handleRequest(postReq);
    expect(postRes.status).toBe(201);
    expect(postRes.body).toBeTypeOf("object");
    expect(postRes.body.shortUrl).toBeTypeOf("string");

    const shortUrl = postRes.body.shortUrl;
    const key = shortUrl.replace("/s/", "");

    // 2. Get request to redirect
    const getReq: MockRequest = {
      method: "GET",
      url: `/s/${key}`,
      headers: {
        "x-forwarded-for": "10.0.0.1",
        "user-agent": "Safari"
      }
    };
    const getRes = await server.handleRequest(getReq);
    expect(getRes.status).toBe(302);
    expect(getRes.headers["Location"]).toBe("https://github.com");
  });

  it("should return 400 bad request for empty/malformed shorten payloads", async () => {
    const postReq: MockRequest = {
      method: "POST",
      url: "/shorten",
      body: {}
    };
    const res = await server.handleRequest(postReq);
    expect(res.status).toBe(400);
  });

  it("should return 404 for unknown shortened links", async () => {
    const getReq: MockRequest = {
      method: "GET",
      url: "/s/missingkey"
    };
    const getRes = await server.handleRequest(getReq);
    expect(getRes.status).toBe(404);
  });
});
