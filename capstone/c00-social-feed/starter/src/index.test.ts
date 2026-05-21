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

// ─── In-Memory Mocks ──────────────────────────────────────────────────────────

function makePost(authorId: string, overrides: Partial<Post> = {}): Post {
  return {
    id: `post-${Math.random().toString(36).slice(2)}`,
    authorId,
    content: "Hello world!",
    createdAt: new Date(),
    ...overrides,
  };
}

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
  it("should push a normal user post to all active followers caches (Fan-out on Write)", async () => {
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
    expect(cache.pushToFeed).toHaveBeenCalledWith("user-A", expect.objectContaining({ postId: post.id, source: "push" }));
    expect(cache.pushToFeed).toHaveBeenCalledWith("user-B", expect.objectContaining({ postId: post.id, source: "push" }));
    expect(cache.pushToFeed).not.toHaveBeenCalledWith("user-C", expect.anything());
  });

  it("should skip fan-out entirely for a celebrity user (Fan-out on Read path)", async () => {
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
      cache._store.set(id, [{ postId: "x", authorId: "y", content: "...", createdAt: new Date(), source: "push" }]),
    );

    const worker = new FanOutWorker(db, cache);
    const post = makePost("celeb-1");
    const result = await worker.processPostCreated(post);

    // Celebrity posts must NOT be pushed to any follower cache
    expect(result.pushedTo).toBe(0);
    expect(cache.pushToFeed).not.toHaveBeenCalled();
  });
});

// ─── Test Suite 2: Feed Service ──────────────────────────────────────────────

describe("FeedService", () => {
  it("should return a merged timeline (push + pull) for an active user following a celebrity", async () => {
    const userId = "reader-1";
    const normalAuthorId = "normal-author";
    const celebId = "celeb-author";

    const normalPost = makePost(normalAuthorId, { id: "normal-post-1", createdAt: new Date("2024-01-10") });
    const celebPost = makePost(celebId, { id: "celeb-post-1", createdAt: new Date("2024-01-15") });
    const celebrity: User = { id: celebId, username: "mega_star", followerCount: CELEBRITY_FOLLOWER_THRESHOLD + 1 };

    const cachedPushFeed: FeedEntry[] = [
      { postId: normalPost.id, authorId: normalAuthorId, content: normalPost.content, createdAt: normalPost.createdAt, source: "push" },
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
  });

  it("should hydrate the cache and return DB feed for an inactive user (cache miss)", async () => {
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
  });
});

// ─── Test Suite 3: API Gateway ───────────────────────────────────────────────

describe("APIGateway", () => {
  const makeRegistry = (): IServiceRegistry => ({
    resolve: vi.fn((path: string) => {
      if (path.startsWith("/api/v1/posts")) return "PostService";
      if (path.startsWith("/api/v1/follows")) return "FollowService";
      if (path.startsWith("/api/v1/feed")) return "FeedService";
      return null;
    }),
  });

  it("should route /api/v1/posts/* requests to PostService", async () => {
    const registry = makeRegistry();
    const gateway = new APIGateway(registry);
    const response = await gateway.handleRequest({
      path: "/api/v1/posts/create",
      headers: { authorization: "Bearer valid-jwt-token" },
      body: { content: "Hello!" },
    });

    expect(response.status).toBe(200);
    expect(response.service).toBe("PostService");
  });

  it("should route /api/v1/feed/* requests to FeedService", async () => {
    const registry = makeRegistry();
    const gateway = new APIGateway(registry);
    const response = await gateway.handleRequest({
      path: "/api/v1/feed/home",
      headers: { authorization: "Bearer valid-jwt-token" },
    });

    expect(response.status).toBe(200);
    expect(response.service).toBe("FeedService");
  });

  it("should return 401 when the Authorization header is missing", async () => {
    const registry = makeRegistry();
    const gateway = new APIGateway(registry);
    const response = await gateway.handleRequest({
      path: "/api/v1/feed/home",
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(response.error).toMatch(/unauthorized/i);
  });

  it("should return 404 for an unknown route", async () => {
    const registry = makeRegistry();
    const gateway = new APIGateway(registry);
    const response = await gateway.handleRequest({
      path: "/api/v1/unknown/route",
      headers: { authorization: "Bearer valid-jwt-token" },
    });

    expect(response.status).toBe(404);
    expect(response.error).toMatch(/not found/i);
  });
});
