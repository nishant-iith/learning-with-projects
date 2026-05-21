// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface User {
  id: string;
  username: string;
  /** Accounts with > 10,000 followers are treated as celebrities (pull path). */
  followerCount: number;
}

export interface FeedEntry {
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  source: "push" | "pull";
}

// ─── Database Adapter (PostgreSQL mock contract) ────────────────────────────

/**
 * Abstraction over the PostgreSQL persistence layer.
 * In real code this would use `pg` Pool queries.
 * In tests this is replaced with an in-memory mock.
 */
export interface IDatabase {
  /** Insert a new post and return it with a generated id. */
  savePost(post: Omit<Post, "id">): Promise<Post>;

  /** Return followers of the given user id. */
  getFollowers(userId: string): Promise<string[]>;

  /** Return `limit` most-recent posts authored by any of `userIds`. */
  getRecentPostsByAuthors(userIds: string[], limit: number): Promise<Post[]>;

  /** Fetch user metadata (follower count). */
  getUser(userId: string): Promise<User | null>;
}

// ─── Cache Adapter (Redis mock contract) ────────────────────────────────────

/**
 * Abstraction over the Redis Sorted-Set based timeline cache.
 * Key convention: `feed:<userId>`  score = createdAt epoch ms.
 */
export interface ICache {
  /** Push a post entry to a user's cached timeline (ZADD). */
  pushToFeed(userId: string, entry: FeedEntry): Promise<void>;

  /** Retrieve the latest `limit` entries from a user's cached timeline. */
  getFeed(userId: string, limit: number): Promise<FeedEntry[]>;

  /** Returns true if the user has an active (non-empty) cached feed. */
  hasFeed(userId: string): Promise<boolean>;

  /** Hydrate (seed) a timeline from a batch of posts (used on cache-miss). */
  hydrateFeed(userId: string, entries: FeedEntry[], ttlSeconds: number): Promise<void>;
}

// ─── Message Broker Adapter (RabbitMQ/Kafka mock contract) ──────────────────

export interface IMessageBroker {
  /** Publish a "post.created" event so fan-out workers can consume it. */
  publishPostCreated(post: Post): Promise<void>;
}

// ─── Fan-Out Worker ──────────────────────────────────────────────────────────

export const CELEBRITY_FOLLOWER_THRESHOLD = 10_000;

/**
 * Fan-Out Worker — consumes "post.created" events and decides:
 *   • Normal user  → Fan-out on WRITE: push the post to every active follower's cache.
 *   • Celebrity    → Skip write fan-out; followers will pull on read.
 */
export class FanOutWorker {
  constructor(
    private db: IDatabase,
    private cache: ICache,
  ) {}

  /**
   * Process a single "post.created" event.
   * TDD Starter: method is intentionally not implemented — tests will fail (Red state).
   */
  async processPostCreated(post: Post): Promise<{ pushedTo: number }> {
    throw new Error("FanOutWorker.processPostCreated is not implemented");
  }
}

// ─── Feed Service ─────────────────────────────────────────────────────────────

export class FeedService {
  constructor(
    private db: IDatabase,
    private cache: ICache,
  ) {}

  /**
   * Build the home timeline for `userId`.
   *
   * Hybrid algorithm:
   *  1. If the user has a cached feed (active user):
   *     a. Fetch the pre-computed push feed from Redis.
   *     b. Fetch recent posts from all *celebrity* accounts the user follows (pull path).
   *     c. Merge and sort both slices chronologically, return top `limit`.
   *  2. If no cached feed (inactive / new user):
   *     a. Query DB for all recent posts from every followed account (full pull).
   *     b. Hydrate the Redis cache with the result (72-hour TTL).
   *     c. Return the result.
   *
   * TDD Starter: method is intentionally not implemented — tests will fail (Red state).
   */
  async getTimeline(userId: string, limit: number): Promise<FeedEntry[]> {
    throw new Error("FeedService.getTimeline is not implemented");
  }
}

// ─── API Gateway Simulation ───────────────────────────────────────────────────

export interface GatewayRequest {
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface GatewayResponse {
  status: number;
  service: string;
  data?: unknown;
  error?: string;
}

export interface IServiceRegistry {
  resolve(path: string): string | null; // returns service name or null
}

/**
 * API Gateway — validates JWT-style auth header, routes request to the
 * correct downstream service, and forwards injected `X-User-Id` header.
 *
 * Routing rules (prefix-based):
 *   /api/v1/posts/*  → "PostService"
 *   /api/v1/follows/* → "FollowService"
 *   /api/v1/feed/*   → "FeedService"
 *
 * TDD Starter: method is intentionally not implemented — tests will fail (Red state).
 */
export class APIGateway {
  constructor(private registry: IServiceRegistry) {}

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    throw new Error("APIGateway.handleRequest is not implemented");
  }
}
