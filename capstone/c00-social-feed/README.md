# 🏆 Phase 5 Capstone: Social Feed Generation Microservices

Welcome to the Capstone project of your engineering curriculum! This capstone integrates everything you have mastered across system design, database modeling, language deep-dives, caching networks, asynchronous event queues, and DevOps container orchestration. 

You will design and build a production-grade, distributed, high-scale **Social Feed Generation Engine** (similar to Twitter/X or Facebook). You will implement a dual-path fan-out model (push vs pull), an API Gateway router, multi-layered Redis caches, and a containerized orchestration pipeline, fully verified under strict automated validation.

---

## 1. 💡 System Architecture

A high-scale social feed requires balancing high write rates (users publishing posts) and high read rates (users viewing their feed). A naive relational query (`SELECT * FROM posts JOIN follows ... ORDER BY created_at DESC`) fails completely at scale due to disk I/O bottlenecks.

To scale, the system is split into specialized microservices and uses a **hybrid feed generation architecture**.

### Microservice Topology

```mermaid
graph TD
    classDef default fill:#ffffff,stroke:#333333,stroke-width:1px,color:#333333;
    classDef service fill:#f9f9f9,stroke:#333333,stroke-width:2px,color:#333333;

    Client([Mobile/Web Client]) -->|Requests| Gateway[API Gateway (Reverse Proxy / Routing)]
    
    Gateway -->|Auth & Routing| PostService[Post Service (Spring Boot)]:::service
    Gateway -->|Auth & Routing| FollowService[Follow Service (Node.js)]:::service
    Gateway -->|Auth & Routing| FeedService[Feed Service (Python / FastAPI)]:::service
    
    PostService -->|Write Post| DB[(PostgreSQL Primary)]
    PostService -->|Publish 'Post Created' Event| Broker[RabbitMQ / Kafka Message Broker]
    
    FollowService -->|Write Follow Relation| FollowDB[(PostgreSQL Follows)]
    
    Broker -->|Message Consumption| Workers[Feed Fan-Out Workers (Python/Go)]:::service
    Workers -->|Query Followers| FollowService
    Workers -->|Push to Timeline| RedisCache[(Redis Cluster: Active Timelines)]
    
    FeedService -->|Query Active Timeline (Push Path)| RedisCache
    FeedService -->|Fetch Inactive Feed (Pull Path)| DB
```

---

## 2. ⚡ In-Depth L1 & L2 Mechanics

### 1. The Core Algorithmic Tradeoff: Fan-Out on Write vs. Fan-Out on Read

To deliver instant page loads (< 100ms), social applications pre-compute feeds. However, this optimization introduces a severe system design tradeoff:

```mermaid
graph TD
    subgraph Fan-Out on Write (Push Path)
        Post[User Posts] --> Worker[Queue Workers]
        Worker --> Cache[Pre-compute Feed for all Followers in Redis]
        Cache --> FastRead[Instant Feed Reads for Active Followers]
    end
    
    subgraph Fan-Out on Read (Pull Path)
        InactiveRead[User Requests Feed] --> Query[Join Posts & Follows Tables in DB]
        Query --> SlowRead[Expensive Computation on Read]
    end
```

#### A. Fan-Out on Write (Push Model)
*   **Mechanic**: When a user creates a new post, an event is published to the broker. Fan-out workers read the user's follower list from the Follow Service, and then prepend the post ID directly to the **Redis Sorted Set (ZSET)** or list of every single follower.
*   **Pros**: Reads are incredibly fast (`O(1)` or `O(log N)` to fetch the cached array).
*   **Cons**: Extremely expensive when a celebrity or high-profile user (e.g., millions of followers) posts. Writing to millions of Redis keys concurrently causes memory exhaustion, network saturation, and queuing delays.

#### B. Fan-Out on Read (Pull Model)
*   **Mechanic**: The system does not pre-compute feeds for followers. When a user opens their home page, the Feed Service queries the database directly to join the list of followed accounts with the posts table, sorting chronologically on-the-fly.
*   **Pros**: Writes are extremely lightweight and fast. No redundant data stored in memory cache.
*   **Cons**: Reads are computationally expensive. A user following thousands of active creators forces the DB to run complex indexing and sorting operations, leading to latency spikes and database CPU exhaustion.

#### C. The Production Solution: Hybrid Feed Pipeline
Your capstone project will implement a **Hybrid Fan-Out Strategy**:
1.  **Standard Users**: Fan-out on **Write (Push)**. Their posts are actively pushed to their followers' cached Redis feeds.
2.  **Celebrities/Influencers (e.g., > 10,000 followers)**: Fan-out on **Read (Pull)**. Their posts are *not* pushed to followers' caches.
3.  **Feed Construction**: When an active user requests their timeline, the Feed Service fetches their pre-computed cache from Redis (Push path) AND queries the recent posts of any celebrity they follow (Pull path), merging the two streams chronologically in-memory before returning them.

---

### 2. Timeline Cache Invalidation & TTL Policies

Memory is an expensive resource. Keeping timelines cached for inactive users is a waste of RAM.
*   **Active Users Filter**: Only maintain pre-computed feeds in Redis for users who have logged in or interacted with the system in the last 7 days.
*   **Least Recently Used (LRU)**: Configure Redis with a `volatile-lru` or `allkeys-lru` eviction policy.
*   **Time-to-Live (TTL)**: Apply a sliding TTL (e.g., 72 hours) to active timelines. When a user requests their feed, update the TTL to extend its life in memory.
*   **Hydration Gate**: If an inactive user returns after weeks of absence, the cache is missing (Cache Miss). The Feed Service will hit the PostgreSQL database to fully "re-hydrate" their timeline, saving it back to Redis and setting the initial TTL.

---

### 3. API Gateway & Microservices Communication

To prevent external clients from direct access to internal microservice ports, you will use an API Gateway:
*   **Reverse Proxy Routing**: Upstream mapping matches paths (e.g., `/api/v1/posts/*` -> Post Service:8081, `/api/v1/feed/*` -> Feed Service:8083).
*   **Authentication Offloading**: The Gateway intercepts all incoming requests, validates JWT claims, decodes user identity headers, and propagates them as `X-User-Id` downstream to the microservices.
*   **Resiliency (Circuit Breakers & Retries)**: Implement circuit breaking on downstream inter-service calls. If the Post database is sluggish, downstream calls quickly fail-fast without consuming threads.

---

## 🛠️ Capstone Laboratory Challenge

### The Goal
Your challenge is to implement a local multi-container integration environment in the `/starter` directory. You will construct:
1.  **A Shared Redis Cache Manager**: Manages Sorted Set data structures for active user feeds (`feed:user_id`).
2.  **A Fan-Out Event Consumer**: Listens to published post events and computes feed routing based on follower lists.
3.  **A Hybrid Feed Aggregator**: Merges pre-cached normal user timelines with dynamic database checks for followed accounts.
4.  **Docker Compose Setup**: Spins up the mock microservices, PostgreSQL databases, and Redis clusters locally.

---

### Project Blueprint & Directory Structure

```text
capstone/c00-social-feed/
├── README.md                   <-- This conceptual handbook
└── starter/
    ├── package.json            <-- Project config & Vitest runner
    ├── tsconfig.json           <-- TS compiler settings
    ├── docker-compose.yml      <-- Local services (Postgres, Redis)
    ├── src/
    │   ├── database.ts         <-- SQL mock/ORM connecting to Postgres
    │   ├── cache.ts            <-- Redis cluster client logic for feeds
    │   ├── fanout.ts           <-- Event handler & Hybrid router
    │   ├── index.ts            <-- API controller entrypoint
    │   └── index.test.ts       <-- Vitest Integration and TDD assertions
```

---

### Phase 5 Milestone Requirements

To pass the Capstone project, your implementation must satisfy the following automated validation rules:
- **TDD Test Assertion 1 (Active Push)**: Normal user posts are pushed to active follower feeds in Redis within 10ms of publishing.
- **TDD Test Assertion 2 (Celebrity Hybrid Merge)**: Celebrity posts are excluded from active follower feed caches, but successfully merged in-memory chronologically when followers read their feed.
- **TDD Test Assertion 3 (Cache Hydration)**: Inactive user feeds return a cache miss, successfully trigger SQL reconstruction from PostgreSQL, and hydrate the Redis cache with a 72-hour TTL.
- **TDD Test Assertion 4 (Microservice Routing)**: The API Gateway simulation forwards requests to appropriate services based on path mappings and injects validated security credentials.
