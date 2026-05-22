/**
 * index.test.ts — Vitest TDD Suite for the Social Feed Generation Engine
 *
 * TEST PHILOSOPHY (Red-Green-Refactor):
 *   All tests are written BEFORE the implementation (Red state). Your task is
 *   to implement the class methods in index.ts until every test turns Green.
 *   Do NOT modify these test files — implement the code to satisfy them.
 *
 * SUITE STRUCTURE:
 *   Suite 1 — FanOutWorker:   Fan-out routing decisions (push vs. skip)
 *   Suite 2 — FeedService:    Hybrid timeline assembly (push+pull merge, hydration)
 *   Suite 3 — APIGateway:     JWT validation, path routing, header injection
 *
 * MOCK STRATEGY:
 *   Tests use Vitest's `vi.fn()` mocks for IDatabase, ICache, and IServiceRegistry.
 *   This isolates the unit under test from network and disk I/O. The in-memory
 *   mock implementations (mockDb, mockCache) faithfully simulate the real
 *   adapter behavior without requiring running containers.
 *
 * TOKEN FORMAT USED IN GATEWAY TESTS:
 *   The APIGateway tests use a simulated JWT token:
 *   `<base64({"sub":"<userId>","role":"user"})>.<stub-signature>`
 *   Encode: btoa(JSON.stringify({ sub: "user-123", role: "user" }))
 *   Result: "eyJzdWIiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIn0="
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FanOutWorker,
  FeedService,
  APIGateway,
  IDatabase,
  ICache,
  IMessageBroker,
  IServiceRegistry,
  Post,
  User,
  FeedEntry,
  CELEBRITY_FOLLOWER_THRESHOLD,
} from "./index.js";

// ─── Token Helper ─────────────────────────────────────────────────────────────

/**
 * Creates a simulated JWT bearer token string for gateway tests.
 * Format: "Bearer <base64({"sub":"<userId>","role":"user"})>.<stub-sig>"
 *
 * The APIGateway implementation should decode the base64 payload, parse JSON,
 * and extract the `sub` field as the userId to inject as X-User-Id.
 *
 * @param userId - The user ID to embed in the token's `sub` claim.
 */
function makeAuthToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, role: "user" })).toString("base64");
  return `Bearer ${payload}.stub-signature`;
}

// ─── In-Memory Mocks ──────────────────────────────────────────────────────────

/**
 * Factory: Creates a Post fixture with sensible defaults.
 * Override any field via the `overrides` partial object.
 *
 * @param authorId  - The ID of the post's author.
 * @param overrides - Optional partial Post to merge over the defaults.
 */
function makePost(authorId: string, overrides: Partial<Post> = {}): Post {
  return {
    id: `post-${Math.random().toString(36).slice(2)}`,
    authorId,
    content: "Hello world!",
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory: Creates an in-memory IDatabase mock backed by vi.fn() spies.
 *
 * The mock faithfully simulates the IDatabase contract:
 *   - getFollowers always returns opts.followers (or [])
 *   - getUser looks up by ID in opts.users (or returns null)
 *   - getRecentPostsByAuthors always returns opts.recentPosts (or [])
 *   - savePost returns the input with id="new-post-id" prepended
 *
 * All methods are wrapped with vi.fn() so tests can assert call count and args.
 *
 * @param opts.followers   - Array returned by getFollowers (follower/followed IDs).
 * @param opts.users       - Array of User objects searchable by getUser.
 * @param opts.recentPosts - Array returned by getRecentPostsByAuthors.
 */
function mockDb(opts: {
  followers?: string[];
  users?: User[];
  recentPosts?: Post[];
}): IDatabase {
  return {
    savePost: vi.fn(async (p) => ({ id: "new-post-id", ...p })),
    getFollowers: vi.fn(async () => opts.followers ?? []),
    getRecentPostsByAuthors: vi.fn(async () => opts.recentPosts ?? []),
    getUser: vi.fn(async (id) => opts.users?.find((u) => u.id === id) ?? null),
  };
}

/**
 * Factory: Creates an in-memory ICache mock backed by a Map<userId, FeedEntry[]>.
 *
 * The mock simulates Redis Sorted Set behavior:
 *   - pushToFeed: prepends the entry (newest-first order)
 *   - getFeed: returns the first `limit` entries from the store
 *   - hasFeed: returns true if the store has a non-empty array for userId
 *   - hydrateFeed: replaces the store entry with the given entries array
 *
 * The `_store` property is exposed for test setup (seeding active user caches).
 *
 * All methods are wrapped with vi.fn() so tests can assert call count and args.
 */
function mockCache(): ICache & {
  _store: Map<string, FeedEntry[]>;
} {
  const store = new Map<string, FeedEntry[]>();
  return {
    _store: store,
    pushToFeed: vi.fn(async (userId, entry) => {
      const list = store.get(userId) ?? [];
      list.unshift(entry);
      store.set(userId, list);
    }),
    getFeed: vi.fn(async (userId, limit) => (store.get(userId) ?? []).slice(0, limit)),
    hasFeed: vi.fn(async (userId) => (store.get(userId)?.length ?? 0) > 0),
    hydrateFeed: vi.fn(async (userId, entries) => {
      store.set(userId, entries);
    }),
  };
}

// ─── Test Suite 1: Fan-Out Worker ────────────────────────────────────────────

describe("FanOutWorker", () => {
  /**
   * SCENARIO: Normal user (followerCount ≤ 10,000) creates a post.
   *           Some followers are active (have existing Redis cache keys);
   *           others are inactive (no cache key).
   *
   * EXPECTED BEHAVIOR:
   *   - FanOutWorker must call pushToFeed exactly for ACTIVE followers only.
   *   - Inactive followers (no cache) must be skipped entirely.
   *   - Return value { pushedTo: N } must equal the number of active followers pushed.
   *   - Each pushToFeed call must include the correct postId and source: "push".
   */
  it(
    "should push a normal user post ONLY to active follower caches (fan-out on write), " +
    "skipping inactive followers who have no existing Redis key",
    async () => {
      const followerIds = ["user-A", "user-B", "user-C"];
      const normalAuthor: User = { id: "author-1", username: "alice", followerCount: 500 };

      const db = mockDb({ followers: followerIds, users: [normalAuthor] });
      const cache = mockCache();

      // Seed active caches for follower-A and follower-B; follower-C has no cache (inactive)
      cache._store.set("user-A", [
        { postId: "old", authorId: "x", content: "...", createdAt: new Date(), source: "push" },
      ]);
      cache._store.set("user-B", [
        { postId: "old2", authorId: "y", content: "...", createdAt: new Date(), source: "push" },
      ]);

      const worker = new FanOutWorker(db, cache);
      const post = makePost("author-1");
      const result = await worker.processPostCreated(post);

      // Should only push to active followers (A and B), not inactive (C)
      expect(result.pushedTo).toBe(2);
      expect(cache.pushToFeed).toHaveBeenCalledTimes(2);
      expect(cache.pushToFeed).toHaveBeenCalledWith(
        "user-A",
        expect.objectContaining({ postId: post.id, source: "push" }),
      );
      expect(cache.pushToFeed).toHaveBeenCalledWith(
        "user-B",
        expect.objectContaining({ postId: post.id, source: "push" }),
      );
      expect(cache.pushToFeed).not.toHaveBeenCalledWith("user-C", expect.anything());
    },
  );

  /**
   * SCENARIO: Celebrity user (followerCount > 10,000) creates a post.
   *           All followers have active cache keys (worst case for push fan-out).
   *
   * EXPECTED BEHAVIOR:
   *   - pushToFeed must NOT be called for any follower (zero calls).
   *   - The fan-out on WRITE is completely skipped for celebrities.
   *   - Return value must be { pushedTo: 0 }.
   *   - Celebrity posts will be merged at READ time (pull path in FeedService).
   */
  it(
    "should skip push fan-out entirely for a celebrity author (followerCount > threshold), " +
    "returning pushedTo: 0 even when all followers have active caches",
    async () => {
      const followerIds = ["user-A", "user-B", "user-C", "user-D"];
      const celebrity: User = {
        id: "celeb-1",
        username: "mega_star",
        followerCount: CELEBRITY_FOLLOWER_THRESHOLD + 1,
      };

      const db = mockDb({ followers: followerIds, users: [celebrity] });
      const cache = mockCache();
      // seed caches for all followers to make them "active"
      followerIds.forEach((id) =>
        cache._store.set(id, [
          { postId: "x", authorId: "y", content: "...", createdAt: new Date(), source: "push" },
        ]),
      );

      const worker = new FanOutWorker(db, cache);
      const post = makePost("celeb-1");
      const result = await worker.processPostCreated(post);

      // Celebrity posts must NOT be pushed to any follower cache
      expect(result.pushedTo).toBe(0);
      expect(cache.pushToFeed).not.toHaveBeenCalled();
    },
  );

  /**
   * SCENARIO: A new user (zero followers) publishes their first post.
   *
   * EXPECTED BEHAVIOR:
   *   - getFollowers returns [] (no followers).
   *   - pushToFeed must not be called.
   *   - Return value must be { pushedTo: 0 }.
   *   - System must not throw or crash when the follower list is empty.
   */
  it(
    "should return { pushedTo: 0 } gracefully when the author has zero followers, " +
    "without calling pushToFeed at all",
    async () => {
      const newUser: User = { id: "brand-new", username: "newbie", followerCount: 0 };
      const db = mockDb({ followers: [], users: [newUser] });
      const cache = mockCache();

      const worker = new FanOutWorker(db, cache);
      const post = makePost("brand-new");
      const result = await worker.processPostCreated(post);

      expect(result.pushedTo).toBe(0);
      expect(cache.pushToFeed).not.toHaveBeenCalled();
    },
  );

  /**
   * SCENARIO: Concurrent rapid publishing — three posts are published in quick
   *           succession by the same normal author. All fan-out workers process
   *           all three posts in parallel.
   *
   * EXPECTED BEHAVIOR:
   *   - Each post must independently trigger fan-out to the correct active followers.
   *   - No cross-contamination: post-1's entry must not appear in post-2's fan-out calls.
   *   - Total pushToFeed calls = (posts count) × (active followers count).
   *   - The correct postId must be present in each pushToFeed call's FeedEntry.
   *
   * This test validates that FanOutWorker has no shared mutable state between
   * concurrent invocations (no race conditions in the push loop).
   */
  it(
    "should correctly fan-out multiple posts published concurrently in rapid succession, " +
    "with each post pushed to the right followers without cross-contamination",
    async () => {
      const followerIds = ["fan-1", "fan-2"];
      const author: User = { id: "busy-author", username: "prolific", followerCount: 50 };

      const db = mockDb({ followers: followerIds, users: [author] });
      const cache = mockCache();

      // Both followers are active
      followerIds.forEach((id) =>
        cache._store.set(id, [
          { postId: "seed", authorId: "z", content: "...", createdAt: new Date(), source: "push" },
        ]),
      );

      const worker = new FanOutWorker(db, cache);

      const post1 = makePost("busy-author", { id: "post-concurrent-1", createdAt: new Date(2024, 0, 1) });
      const post2 = makePost("busy-author", { id: "post-concurrent-2", createdAt: new Date(2024, 0, 2) });
      const post3 = makePost("busy-author", { id: "post-concurrent-3", createdAt: new Date(2024, 0, 3) });

      // Process all three posts concurrently (simulates broker burst)
      const results = await Promise.all([
        worker.processPostCreated(post1),
        worker.processPostCreated(post2),
        worker.processPostCreated(post3),
      ]);

      // Each post should have been pushed to 2 active followers
      for (const result of results) {
        expect(result.pushedTo).toBe(2);
      }

      // Total pushToFeed invocations = 3 posts × 2 followers = 6
      expect(cache.pushToFeed).toHaveBeenCalledTimes(6);

      // Verify each specific post was pushed with correct ID
      expect(cache.pushToFeed).toHaveBeenCalledWith(
        "fan-1",
        expect.objectContaining({ postId: "post-concurrent-1", source: "push" }),
      );
      expect(cache.pushToFeed).toHaveBeenCalledWith(
        "fan-2",
        expect.objectContaining({ postId: "post-concurrent-3", source: "push" }),
      );
    },
  );
});

// ─── Test Suite 2: Feed Service ──────────────────────────────────────────────

describe("FeedService", () => {
  /**
   * SCENARIO: Active user (has a pre-populated Redis cache) follows both a
   *           normal user AND a celebrity. The cache contains the normal user's
   *           post (push-delivered). The celebrity's post must be fetched from
   *           DB (pull path) and merged chronologically.
   *
   * EXPECTED BEHAVIOR:
   *   - Timeline contains both posts (push + pull).
   *   - The celebrity post (newer createdAt) appears first.
   *   - source === "pull" for the celebrity post.
   *   - source === "push" for the normal post.
   *   - Merge order is strictly descending by createdAt.
   */
  it(
    "should return a chronologically merged timeline (push + pull) for an active user " +
    "following both a normal account and a celebrity, with celebrity posts on pull path",
    async () => {
      const userId = "reader-1";
      const normalAuthorId = "normal-author";
      const celebId = "celeb-author";

      const normalPost = makePost(normalAuthorId, { id: "normal-post-1", createdAt: new Date("2024-01-10") });
      const celebPost = makePost(celebId, { id: "celeb-post-1", createdAt: new Date("2024-01-15") });
      const celebrity: User = {
        id: celebId,
        username: "mega_star",
        followerCount: CELEBRITY_FOLLOWER_THRESHOLD + 1,
      };

      const cachedPushFeed: FeedEntry[] = [
        {
          postId: normalPost.id,
          authorId: normalAuthorId,
          content: normalPost.content,
          createdAt: normalPost.createdAt,
          source: "push",
        },
      ];

      const db = mockDb({
        followers: [normalAuthorId, celebId],
        users: [celebrity],
        recentPosts: [celebPost],
      });
      const cache = mockCache();
      cache._store.set(userId, cachedPushFeed); // active user has a cached feed

      const service = new FeedService(db, cache);
      const timeline = await service.getTimeline(userId, 10);

      // Both posts should be present
      expect(timeline).toHaveLength(2);
      // Celeb post is newer and should be first
      expect(timeline[0].postId).toBe(celebPost.id);
      expect(timeline[0].source).toBe("pull");
      expect(timeline[1].postId).toBe(normalPost.id);
      expect(timeline[1].source).toBe("push");
    },
  );

  /**
   * SCENARIO: Inactive user (no Redis cache key) requests their feed for the
   *           first time (or after a long absence). The system must fall back
   *           to PostgreSQL to reconstruct the full feed and then seed Redis.
   *
   * EXPECTED BEHAVIOR:
   *   - hasFeed returns false → full DB pull is triggered.
   *   - DB posts are returned in the timeline response.
   *   - hydrateFeed is called exactly once with the userId, the reconstructed
   *     entries, and a TTL >= 3600 seconds (at least 1 hour).
   *   - After hydration, the in-memory store contains the user's feed.
   */
  it(
    "should query PostgreSQL to reconstruct the full feed on cache miss (inactive/new user), " +
    "then hydrate the Redis cache with the DB results and a positive TTL",
    async () => {
      const userId = "inactive-reader";
      const authorId = "some-author";
      const post = makePost(authorId, { id: "db-post-1", createdAt: new Date("2024-01-05") });

      const db = mockDb({
        followers: [authorId],
        users: [],
        recentPosts: [post],
      });
      const cache = mockCache();
      // No seed — inactive user, hasFeed returns false

      const service = new FeedService(db, cache);
      const timeline = await service.getTimeline(userId, 10);

      // Feed must come from DB
      expect(timeline).toHaveLength(1);
      expect(timeline[0].postId).toBe(post.id);

      // Cache must have been hydrated
      expect(cache.hydrateFeed).toHaveBeenCalledWith(userId, expect.any(Array), expect.any(Number));
      const hydrateArgs = (cache.hydrateFeed as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(hydrateArgs[2]).toBeGreaterThanOrEqual(60 * 60); // at least 1-hour TTL
    },
  );

  /**
   * SCENARIO: Inactive user's cache miss triggers a DB pull that returns posts
   *           from celebrities they follow (pull-path only — no push entries exist).
   *           After hydration, the cache must contain exactly the 72*3600 second TTL.
   *
   * RATIONALE FOR THIS TEST:
   *   The hydrateFeed TTL is a business rule: 72 hours = 259,200 seconds.
   *   Deviations (e.g., 3600 or 86400) indicate an implementation bug.
   *   This test pins the exact TTL value to prevent regressions.
   *
   * EXPECTED BEHAVIOR:
   *   - hydrateFeed is called with ttlSeconds === 72 * 3600 (259,200).
   *   - The timeline returned contains the celebrity's post with source "pull".
   *   - The DB is queried for posts from ALL followed accounts (both celebrity and normal).
   */
  it(
    "should call hydrateFeed with exactly 72 * 3600 seconds TTL (259200 seconds) " +
    "when seeding the Redis cache during a cache-miss feed reconstruction",
    async () => {
      const userId = "new-user";
      const celebId = "big-celeb";
      const celebrity: User = {
        id: celebId,
        username: "super_star",
        followerCount: CELEBRITY_FOLLOWER_THRESHOLD + 5000,
      };
      const celebPost = makePost(celebId, {
        id: "celeb-pull-post",
        createdAt: new Date("2024-02-01"),
      });

      const db = mockDb({
        followers: [celebId],
        users: [celebrity],
        recentPosts: [celebPost],
      });
      const cache = mockCache();
      // No cache — this user has never loaded their feed

      const service = new FeedService(db, cache);
      const timeline = await service.getTimeline(userId, 20);

      // Timeline must include the celebrity post
      expect(timeline.some((e) => e.postId === celebPost.id)).toBe(true);

      // Hydration must use exactly 72-hour TTL
      expect(cache.hydrateFeed).toHaveBeenCalledTimes(1);
      const [, , ttl] = (cache.hydrateFeed as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(ttl).toBe(72 * 3600); // strict equality — 259200 seconds exactly
    },
  );

  /**
   * SCENARIO: A brand-new user who has never had any cache follows a celebrity.
   *           This tests the combined cache-miss + celebrity pull-path merge.
   *
   * RATIONALE:
   *   When an inactive user follows only celebrities, the cache miss triggers a
   *   full DB pull. The reconstructed feed should contain celebrity posts (pull)
   *   and nothing from the push cache (since there is none). This tests that the
   *   two paths (celebrity pull + cache miss) work correctly together.
   *
   * EXPECTED BEHAVIOR:
   *   - hasFeed → false (no pre-existing cache).
   *   - DB is queried for posts by all followed authors including celebrity.
   *   - Timeline contains the celebrity post with source "pull".
   *   - hydrateFeed is called once to seed the cache.
   *   - DB.getRecentPostsByAuthors is called with all followed author IDs.
   */
  it(
    "should trigger a full DB pull and celebrity post merge on cache miss, " +
    "correctly hydrating the cache when the new user exclusively follows celebrity accounts",
    async () => {
      const newUserId = "first-time-user";
      const celebId = "mega-celeb";
      const celebrity: User = {
        id: celebId,
        username: "viral_star",
        followerCount: 1_000_000,
      };
      const celebPost = makePost(celebId, {
        id: "viral-post-1",
        createdAt: new Date("2024-03-10T15:00:00Z"),
      });

      const db = mockDb({
        followers: [celebId],       // new user follows the celebrity
        users: [celebrity],         // celebrity metadata
        recentPosts: [celebPost],   // celebrity's recent posts from DB
      });
      const cache = mockCache();
      // No cache at all for this new user

      const service = new FeedService(db, cache);
      const timeline = await service.getTimeline(newUserId, 10);

      // Must return the celebrity post
      expect(timeline).toHaveLength(1);
      expect(timeline[0].postId).toBe(celebPost.id);
      expect(timeline[0].source).toBe("pull");

      // Must hydrate the cache (DB data seeded into Redis)
      expect(cache.hydrateFeed).toHaveBeenCalledOnce();

      // DB must have been queried with the celebrity's ID
      expect(db.getRecentPostsByAuthors).toHaveBeenCalledWith(
        expect.arrayContaining([celebId]),
        expect.any(Number),
      );
    },
  );
});

// ─── Test Suite 3: API Gateway ───────────────────────────────────────────────

describe("APIGateway", () => {
  /**
   * Factory: Creates a mock IServiceRegistry that implements the standard
   * three-path routing rules using prefix matching.
   */
  const makeRegistry = (): IServiceRegistry => ({
    resolve: vi.fn((path: string) => {
      if (path.startsWith("/api/v1/posts")) return "PostService";
      if (path.startsWith("/api/v1/follows")) return "FollowService";
      if (path.startsWith("/api/v1/feed")) return "FeedService";
      return null;
    }),
  });

  /**
   * SCENARIO: A valid authenticated request arrives for the Post Service.
   *
   * EXPECTED BEHAVIOR:
   *   - Gateway validates the Authorization header successfully.
   *   - Registry resolves "/api/v1/posts/create" → "PostService".
   *   - Response status is 200.
   *   - Response service is "PostService".
   */
  it(
    "should route GET/POST /api/v1/posts/* requests to PostService with HTTP 200 " +
    "when a valid Bearer token is present in the Authorization header",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);
      const response = await gateway.handleRequest({
        path: "/api/v1/posts/create",
        headers: { authorization: makeAuthToken("user-post-author") },
        body: { content: "Hello!" },
      });

      expect(response.status).toBe(200);
      expect(response.service).toBe("PostService");
    },
  );

  /**
   * SCENARIO: A valid authenticated request arrives for the Feed Service.
   *
   * EXPECTED BEHAVIOR:
   *   - Registry resolves "/api/v1/feed/home" → "FeedService".
   *   - Response status is 200 and service is "FeedService".
   */
  it(
    "should route GET /api/v1/feed/* requests to FeedService with HTTP 200 " +
    "when a valid Bearer token is present in the Authorization header",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);
      const response = await gateway.handleRequest({
        path: "/api/v1/feed/home",
        headers: { authorization: makeAuthToken("user-reader") },
      });

      expect(response.status).toBe(200);
      expect(response.service).toBe("FeedService");
    },
  );

  /**
   * SCENARIO: A request arrives with no Authorization header at all.
   *
   * EXPECTED BEHAVIOR:
   *   - Gateway immediately rejects the request with HTTP 401.
   *   - Response error message matches /unauthorized/i.
   *   - The registry.resolve method should NOT be called (fail fast before routing).
   *   - The service field should be empty or absent.
   */
  it(
    "should return HTTP 401 Unauthorized with a descriptive error message " +
    "when the Authorization header is completely absent from the request",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);
      const response = await gateway.handleRequest({
        path: "/api/v1/feed/home",
        headers: {},
      });

      expect(response.status).toBe(401);
      expect(response.error).toMatch(/unauthorized/i);
    },
  );

  /**
   * SCENARIO: A valid authenticated request arrives for a path that has no
   *           registered service in the routing table.
   *
   * EXPECTED BEHAVIOR:
   *   - Gateway validates the auth token successfully.
   *   - Registry returns null for the path.
   *   - Response status is 404.
   *   - Response error message matches /not found/i.
   */
  it(
    "should return HTTP 404 Not Found when the request path does not match " +
    "any registered service in the routing registry",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);
      const response = await gateway.handleRequest({
        path: "/api/v1/unknown/route",
        headers: { authorization: makeAuthToken("user-404") },
      });

      expect(response.status).toBe(404);
      expect(response.error).toMatch(/not found/i);
    },
  );

  /**
   * SCENARIO: A valid authenticated request arrives. The gateway must extract
   *           the userId from the JWT's `sub` claim and inject it into the
   *           downstream request as X-User-Id.
   *
   * RATIONALE:
   *   This test enforces the security contract: downstream services (PostService,
   *   FeedService) trust the X-User-Id header because the Gateway has already
   *   validated the JWT. Without this injection, microservices have no way to
   *   know which authenticated user made the request.
   *
   * EXPECTED BEHAVIOR:
   *   - Gateway decodes the base64 JWT payload and extracts `sub` = "user-abc-123".
   *   - The forwarded userId appears in the response's `data` field.
   *   - Status is 200 and service is correctly resolved.
   *
   * TOKEN FORMAT:
   *   "Bearer <base64({"sub":"user-abc-123","role":"user"})>.<sig>"
   */
  it(
    "should decode the JWT Bearer token, extract the sub claim as userId, " +
    "and inject it as the X-User-Id in the downstream response data",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);
      const targetUserId = "user-abc-123";

      const response = await gateway.handleRequest({
        path: "/api/v1/posts/create",
        headers: { authorization: makeAuthToken(targetUserId) },
        body: { content: "A post with auth injection test" },
      });

      expect(response.status).toBe(200);
      expect(response.service).toBe("PostService");

      // The gateway must surface the extracted userId in the response data
      // so downstream services can use it as X-User-Id
      expect(response.data).toMatchObject({
        forwardedUserId: targetUserId,
      });
    },
  );

  /**
   * SCENARIO: A request arrives with an Authorization header that has the
   *           "Bearer " prefix but a completely malformed token (not valid base64 JSON).
   *
   * EXPECTED BEHAVIOR:
   *   - Gateway attempts to decode the token but fails to parse the payload.
   *   - Response status is 401.
   *   - Response error matches /unauthorized/i.
   *   - No downstream routing occurs.
   */
  it(
    "should return HTTP 401 Unauthorized when the Bearer token is present " +
    "but the payload is malformed and cannot be decoded as valid JSON",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);

      const response = await gateway.handleRequest({
        path: "/api/v1/feed/home",
        headers: { authorization: "Bearer not-valid-base64-or-jwt" },
      });

      expect(response.status).toBe(401);
      expect(response.error).toMatch(/unauthorized/i);
    },
  );

  /**
   * SCENARIO: A valid authenticated request arrives for the Follow Service.
   *
   * EXPECTED BEHAVIOR:
   *   - Registry resolves "/api/v1/follows/user-123" → "FollowService".
   *   - Response status is 200 and service is "FollowService".
   */
  it(
    "should route /api/v1/follows/* requests to FollowService with HTTP 200 " +
    "when a valid Bearer token is present",
    async () => {
      const registry = makeRegistry();
      const gateway = new APIGateway(registry);

      const response = await gateway.handleRequest({
        path: "/api/v1/follows/user-123",
        headers: { authorization: makeAuthToken("user-follower") },
      });

      expect(response.status).toBe(200);
      expect(response.service).toBe("FollowService");
    },
  );
});
