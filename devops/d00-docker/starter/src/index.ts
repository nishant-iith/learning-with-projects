/**
 * @module UserDirectoryAPI
 * @description
 * A production-ready Express REST API for a User Directory service.
 *
 * This module serves as the containerized application that runs inside
 * a Docker container. It is designed to read ALL configuration (database
 * connection coordinates, port, etc.) from environment variables — never
 * from hardcoded values. This follows the 12-Factor App methodology
 * (https://12factor.net/config), making the same image deployable across
 * development, staging, and production environments by simply changing
 * the environment variables injected at runtime.
 *
 * DATABASE CONNECTION STRATEGY:
 * The pg.Pool is used (not a single Client) because pools maintain a set of
 * reusable connections to PostgreSQL. This is critical for production because:
 * - Connection establishment has ~5ms overhead (TCP handshake + TLS + auth)
 * - Pools pre-warm connections on startup, reducing per-request latency
 * - Pools manage concurrent requests without blocking (multiple parallel queries)
 * - Pool automatically reconnects if a connection drops
 *
 * CONTAINERIZATION NOTES:
 * - DB_HOST defaults to "localhost" for local bare-metal development,
 *   but should be overridden to "db" (Docker Compose service name) or
 *   the PostgreSQL service ClusterIP DNS name in Kubernetes.
 * - The server binds to 0.0.0.0 (all interfaces) by default in Express,
 *   which is required for Docker port-binding to work correctly.
 *   If bound to 127.0.0.1, requests from outside the container cannot reach it.
 */

import express from "express";
import pg from "pg";

const app = express();
app.use(express.json());

/**
 * Port the Express server listens on.
 *
 * Reads from PORT environment variable. This allows the orchestration layer
 * (Docker Compose, Kubernetes) to override the port without rebuilding the image.
 * Default: 3000
 *
 * In the Docker container, EXPOSE 3000 in the Dockerfile documents this port,
 * and the docker-compose.yml maps it as "3000:3000" (host:container).
 */
const port = process.env.PORT || 3000;

/**
 * PostgreSQL connection pool.
 *
 * Configuration is sourced entirely from environment variables following the
 * 12-Factor App methodology. In the Docker Compose stack, these are injected
 * via the `environment:` block in docker-compose.yml.
 *
 * Key parameters:
 * - host: Service name "db" (resolved by Docker internal DNS) in containers,
 *         "localhost" for bare-metal development.
 * - port: PostgreSQL default port 5432.
 * - user/password: Should match POSTGRES_USER/POSTGRES_PASSWORD in db service.
 * - database: Should match POSTGRES_DB in db service.
 *
 * Pool behavior:
 * - Creates connections lazily (on first query)
 * - Default pool size: 10 connections
 * - Idle timeout: connections released after 10 seconds of inactivity
 */
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "users_db",
});

/**
 * GET /health
 * @description Health check endpoint for container orchestration readiness probes.
 *
 * Purpose: This endpoint is called by:
 * - Docker health checks (healthcheck in docker-compose.yml)
 * - Kubernetes readinessProbe and livenessProbe
 * - Load balancer health checks
 *
 * Implementation: Executes "SELECT 1" — the lightest possible query that:
 * - Verifies the database TCP connection is alive
 * - Verifies PostgreSQL can execute a query (not just accept connections)
 * - Returns in <1ms (no disk I/O, no table scan)
 *
 * Response:
 * - 200 OK + { status: "healthy", database: "connected" } — application is ready
 * - 500 Internal Server Error + { status: "unhealthy", error: string } — DB unreachable
 *
 * Edge cases:
 * - If PostgreSQL is starting up (during Docker Compose boot), this returns 500.
 *   The health check retries (5 times, 5s interval) until success.
 * - If DB connection pool is exhausted, this also returns 500 — intentional,
 *   as the service is effectively degraded and should be removed from rotation.
 */
app.get("/health", async (req, res) => {
  try {
    // Simple query to verify DB connection is active
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

/**
 * GET /users
 * @description Retrieve all users from the database.
 *
 * Returns: JSON array of user objects with id, name, email.
 * Note: In production, this should be paginated (LIMIT/OFFSET or cursor-based)
 * to prevent memory exhaustion when the users table grows large.
 *
 * Database: Queries the `users` table (must be pre-created).
 * Schema assumption:
 *   CREATE TABLE users (
 *     id SERIAL PRIMARY KEY,
 *     name VARCHAR(255) NOT NULL,
 *     email VARCHAR(255) UNIQUE NOT NULL,
 *     created_at TIMESTAMP DEFAULT NOW()
 *   );
 *
 * Response:
 * - 200 OK + [{ id, name, email }] array
 * - 500 Internal Server Error + { error: message } if DB query fails
 *
 * Edge cases:
 * - Empty table returns 200 with empty array []
 * - Database unavailable returns 500
 */
app.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email FROM users");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /users
 * @description Create a new user in the database.
 *
 * Request body: { name: string, email: string }
 * - name: Required. The display name of the user.
 * - email: Required. Must be unique across all users.
 *
 * Response:
 * - 201 Created + { id, name, email } of the newly created user
 * - 400 Bad Request + { error: "Name and email are required" } if fields missing
 * - 500 Internal Server Error + { error: message } if DB query fails
 *   Note: If email is not unique, PostgreSQL raises a unique constraint violation
 *   which surfaces as a 500 error. Production code should catch error code '23505'
 *   and return 409 Conflict instead.
 *
 * Parameterized query: Uses $1, $2 placeholders (not string interpolation) to
 * prevent SQL injection attacks. The pg driver handles escaping automatically.
 *
 * Edge cases:
 * - Duplicate email: Returns 500 (23505 unique constraint violation from PostgreSQL)
 * - Very long name/email: Truncated/rejected by DB VARCHAR(255) constraint
 * - name="" (empty string): Passes this validation, insert might fail on NOT NULL
 */
app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * HTTP Server instance.
 *
 * Exported for graceful shutdown in test environments and production.
 * In containerized environments, the Docker daemon sends SIGTERM to PID 1
 * when stopping a container (docker stop). Proper shutdown:
 * 1. Stop accepting new connections
 * 2. Wait for in-flight requests to complete
 * 3. Close the database pool
 * 4. Exit cleanly
 *
 * The CMD exec-form in Dockerfile ensures SIGTERM reaches this Node process
 * directly (not filtered through /bin/sh).
 */
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Graceful shutdown handler: drains in-flight requests before exiting.
// This prevents data corruption and connection leaks during container restarts.
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(async () => {
    await pool.end(); // Release all database connections
    console.log("HTTP server closed. Database pool drained. Exiting.");
    process.exit(0);
  });
});

export { app, server, pool };
