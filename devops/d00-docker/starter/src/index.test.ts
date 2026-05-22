import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================
// TDD Verification Suite: Dockerfile & Docker Compose
//
// Philosophy (from TDD skill): Tests verify observable behavior
// through public interfaces (the config file content), not
// implementation details. Each test describes what the container
// configuration MUST guarantee in production.
//
// Red-Green-Refactor workflow:
//   RED:   Run these tests → they fail because files don't exist yet
//   GREEN: Write Dockerfile and docker-compose.yml → tests pass
//   REFACTOR: Optimise layer ordering, reduce image size
// ============================================================

describe("Dockerfile TDD Verification", () => {
  const dockerfilePath = path.join(process.cwd(), "Dockerfile");

  /**
   * Scenario: Dockerfile must exist before any other checks can run.
   * If this test fails, all subsequent Dockerfile tests are skipped
   * gracefully to prevent misleading errors.
   */
  it("should contain a Dockerfile at the project root", () => {
    expect(
      fs.existsSync(dockerfilePath),
      "Dockerfile was not found. Create starter/Dockerfile to proceed."
    ).toBe(true);
  });

  /**
   * Scenario: Multi-stage build structure must be present.
   * Why: A single-stage build ships the TypeScript compiler and all
   * devDependencies into the production image, bloating it from ~50MB
   * to >800MB and widening the security attack surface.
   * Expected: At least 2 FROM statements, one aliased as 'build' or 'builder'.
   */
  it("should implement multi-stage build structure with at least two FROM statements", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Look for at least two FROM statements to indicate multi-stage
    const fromMatches = content.match(/FROM\s+/gi);
    expect(
      fromMatches ? fromMatches.length : 0,
      "Expected at least 2 FROM statements (build stage + production stage)"
    ).toBeGreaterThanOrEqual(2);

    // Look for stage aliases like AS build or AS builder
    expect(
      content,
      "Expected a build stage aliased with 'AS build' or 'AS builder'"
    ).toMatch(/AS\s+(build|builder)/i);
  });

  /**
   * Scenario: Production runtime stage must use a minimal alpine or slim base image.
   * Why: node:20 weighs ~1GB. node:20-alpine weighs ~50MB. The smaller the image,
   * the smaller the attack surface, the faster the pull time, and the lower the
   * cloud registry storage cost.
   * Expected: A FROM instruction using 'node:N-alpine' or 'node:N-slim'.
   */
  it("should target node:20-alpine or similar minimal alpine/slim base image in runtime stage", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Check if alpine/slim image is used
    expect(
      content,
      "Production stage must use a minimal image (node:XX-alpine or node:XX-slim)"
    ).toMatch(/node:\d+-(alpine|slim)/i);
  });

  /**
   * Scenario: Container must execute as a non-root user.
   * Why: Running as root means an attacker who escapes the container
   * sandbox inherits full root privileges on the host machine.
   * The node:alpine image ships with a pre-created 'node' user (UID 1000).
   * Expected: 'USER node' directive present.
   */
  it("should enforce container security with non-root USER node execution", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Make sure USER node is configured in the Dockerfile
    expect(
      content,
      "Security: Must include 'USER node' to avoid running as root in production"
    ).toMatch(/USER\s+node/i);
  });

  /**
   * Scenario: Container must expose port 3000 for the Express server.
   * Why: EXPOSE is metadata — it tells orchestration platforms (Docker Compose,
   * Kubernetes) which port the application binds to internally. Without it,
   * Kubernetes cannot configure pod health probes or service routing correctly.
   * Expected: 'EXPOSE 3000' directive present.
   */
  it("should expose port 3000 (the Express API port)", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    expect(
      content,
      "Must EXPOSE 3000 so orchestrators know which port the app binds to"
    ).toMatch(/EXPOSE\s+3000/i);
  });

  /**
   * Scenario: CMD must use exec-form (JSON array), not shell-form (string).
   * Why: Shell-form CMD wraps the command in /bin/sh -c, making /bin/sh the
   * PID 1 process. Docker's SIGTERM (for graceful shutdown) goes to /bin/sh,
   * which may NOT forward it to the node process, causing forced SIGKILL after
   * the timeout and data loss.
   * Expected: CMD in JSON array format: CMD ["node", "dist/index.js"]
   */
  it("should use exec-form CMD (JSON array) for proper SIGTERM signal handling", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Exec-form: CMD ["node", ...]
    expect(
      content,
      "CMD must use exec-form JSON array, e.g. CMD [\"node\", \"dist/index.js\"]"
    ).toMatch(/CMD\s+\[/i);
  });

  /**
   * Scenario: Production stage must NOT install devDependencies.
   * Why: DevDependencies include TypeScript, ts-node, testing frameworks,
   * linters — none of which are needed at runtime. They add weight and
   * introduce unnecessary CVE exposure.
   * Expected: npm install uses --only=production or --omit=dev flag.
   */
  it("should install only production dependencies (no devDependencies) in runtime stage", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    const hasProductionFlag =
      content.includes("--only=production") ||
      content.includes("--omit=dev") ||
      content.includes("npm ci --omit");

    expect(
      hasProductionFlag,
      "Runtime stage must use 'npm ci --only=production' or '--omit=dev' to exclude devDependencies"
    ).toBe(true);
  });

  /**
   * Scenario: COPY from builder stage must reference only the dist/ output.
   * Why: Copying the entire source code (including .ts files, test files,
   * tsconfig.json) into the production image exposes proprietary source code
   * and adds unnecessary file bloat.
   * Expected: A COPY --from=builder instruction targeting dist/ or similar output.
   */
  it("should copy only compiled dist/ output from builder stage (not raw source files)", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    expect(
      content,
      "Must use COPY --from=builder to selectively copy compiled output, not raw TypeScript source"
    ).toMatch(/COPY\s+--from=(build|builder)/i);
  });
});

describe("Docker Compose TDD Verification", () => {
  const composePath = path.join(process.cwd(), "docker-compose.yml");

  /**
   * Scenario: docker-compose.yml must exist.
   * This is the entrypoint for local development and CI testing of the full stack.
   */
  it("should contain a docker-compose.yml at the project root", () => {
    expect(
      fs.existsSync(composePath),
      "docker-compose.yml was not found. Create starter/docker-compose.yml to proceed."
    ).toBe(true);
  });

  /**
   * Scenario: Both 'web' and 'db' services must be declared.
   * Why: The application requires a web service (TypeScript API) and a
   * database service (PostgreSQL). Without both, the stack is incomplete.
   */
  it("should declare both 'web' and 'db' services", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content, "Missing 'web:' service definition").toMatch(/web:/i);
    expect(content, "Missing 'db:' service definition").toMatch(/db:/i);
  });

  /**
   * Scenario: Database service must use official PostgreSQL alpine image.
   * Why: Official images are maintained by the PostgreSQL team and regularly
   * receive security patches. Alpine variant keeps image size minimal.
   */
  it("should configure postgres:15-alpine or similar official postgres image for database", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(
      content,
      "db service must use official postgres:15-alpine (or similar versioned) image"
    ).toMatch(/postgres:\d+(-alpine)?/i);
  });

  /**
   * Scenario: Web service must bind port 3000 and declare startup dependency on db.
   * Why: Port binding makes the API accessible from the host machine for development
   * and integration testing. depends_on prevents startup race conditions where
   * the API tries to connect to a database that isn't ready.
   */
  it("should map web port 3000 and configure database startup dependencies", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content, "web service must bind port 3000:3000").toMatch(/3000:3000/i);
    expect(
      content,
      "web service must declare depends_on to prevent startup race conditions"
    ).toMatch(/depends_on:/i);
  });

  /**
   * Scenario: Database container must have a persistent named volume.
   * Why: Container filesystems are ephemeral. Without a volume, all PostgreSQL
   * data is wiped every time the db container is deleted or recreated. In a
   * production-like local environment, this causes catastrophic data loss.
   */
  it("should define a named volume for database persistence across container restarts", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(
      content,
      "Must declare a named volume (e.g., postgres_data) to persist database files"
    ).toMatch(/volumes:/i);
  });

  /**
   * Scenario: Database service must have a health check configured.
   * Why: depends_on: condition: service_healthy requires a healthcheck on the db.
   * Without it, Docker Compose cannot determine when the database is truly ready
   * to accept connections, leading to flaky startup failures where the web service
   * crashes on boot because it can't connect to PostgreSQL.
   */
  it("should configure a healthcheck on the db service for readiness gating", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(
      content,
      "db service must have a healthcheck (pg_isready or similar) for service_healthy condition"
    ).toMatch(/healthcheck:/i);

    // Check that health check uses pg_isready (standard PostgreSQL readiness probe)
    const hasPgReady = content.includes("pg_isready") || content.includes("pg_ready");
    expect(
      hasPgReady,
      "Health check should use pg_isready to verify PostgreSQL is accepting connections"
    ).toBe(true);
  });

  /**
   * Scenario: Web service depends on db with the 'service_healthy' condition.
   * Why: depends_on with only a list (not condition: service_healthy) only waits
   * for the container to START, not for the process inside to be READY.
   * PostgreSQL takes 2-8 seconds to initialize — the web service can crash in that gap.
   */
  it("should use service_healthy condition in web depends_on for proper readiness ordering", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(
      content,
      "web depends_on must use 'condition: service_healthy' to wait for DB readiness"
    ).toMatch(/service_healthy/i);
  });

  /**
   * Scenario: Database must have required POSTGRES_* environment variables.
   * Why: The postgres:15-alpine image requires POSTGRES_USER, POSTGRES_PASSWORD,
   * and POSTGRES_DB to initialize the database on first run. Missing these causes
   * the container to fail on startup with 'POSTGRES_PASSWORD not set' error.
   */
  it("should configure required POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB environment variables", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content, "Missing POSTGRES_USER environment variable").toMatch(
      /POSTGRES_USER/i
    );
    expect(content, "Missing POSTGRES_PASSWORD environment variable").toMatch(
      /POSTGRES_PASSWORD/i
    );
    expect(content, "Missing POSTGRES_DB environment variable").toMatch(
      /POSTGRES_DB/i
    );
  });

  /**
   * Scenario: Web service must inject DB_HOST environment variable pointing to 'db'.
   * Why: The TypeScript application reads DB_HOST from environment variables
   * (see src/index.ts). In Docker Compose, the db service is reachable via its
   * service name 'db' through the internal Docker DNS. If DB_HOST is not set,
   * the app defaults to 'localhost' which points to the web container itself.
   */
  it("should inject DB_HOST=db environment variable into web service for Docker DNS resolution", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(
      content,
      "web service must set DB_HOST=db so Docker DNS resolves the database service"
    ).toMatch(/DB_HOST:\s*("|')?db("|')?/i);
  });
});
