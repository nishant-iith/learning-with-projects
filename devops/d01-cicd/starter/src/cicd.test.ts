import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import YAML from "yaml";

// ============================================================
// TDD Verification Suite: GitHub Actions CI/CD Pipeline
//
// Philosophy: These tests parse the ci.yml workflow file as structured
// YAML and verify its behavioral contracts — not the exact syntax.
// This allows flexibility in formatting while enforcing the critical
// pipeline properties: correct triggers, job ordering, runner config,
// caching, and security practices.
//
// Red-Green-Refactor:
//   RED:   Tests fail because .github/workflows/ci.yml is a stub
//   GREEN: Write a valid ci.yml → tests pass
//   REFACTOR: Add security scanning, matrix testing, artifact uploads
// ============================================================

describe("GitHub Actions CI/CD Pipeline TDD Verification", () => {
  const workflowPath = path.join(process.cwd(), ".github", "workflows", "ci.yml");

  /**
   * Scenario: ci.yml must exist in the GitHub Actions workflows directory.
   * GitHub Actions only discovers workflows in .github/workflows/*.yml.
   * A misplaced file (e.g., workflows/ci.yml without the .github prefix)
   * is silently ignored by GitHub.
   */
  it("should contain the ci.yml workflow file at .github/workflows/ci.yml", () => {
    expect(
      fs.existsSync(workflowPath),
      "ci.yml not found. Create .github/workflows/ci.yml to proceed."
    ).toBe(true);
  });

  /**
   * Scenario: Workflow file must be valid YAML and have a workflow name.
   * Invalid YAML syntax causes GitHub to reject the entire workflow with
   * a parse error and no jobs run at all. The 'name' field is displayed
   * in the GitHub Actions UI for human identification.
   */
  it("should parse as a valid YAML structure with a workflow name", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    let doc: any;
    try {
      doc = YAML.parse(rawContent);
    } catch (e: any) {
      throw new Error(`ci.yml contains invalid YAML syntax: ${e.message}`);
    }
    expect(doc, "Parsed YAML must be a non-null object").toBeTypeOf("object");
    expect(doc.name, "Workflow must have a 'name' field for GitHub UI identification").toBeDefined();
  });

  /**
   * Scenario: Workflow must trigger on push and pull_request to main branch.
   * Why push? To validate code merged to main (post-merge).
   * Why pull_request? To validate code BEFORE it's merged (pre-merge gate).
   * Restricting to 'main' prevents CI from running on experimental feature
   * branches unless explicitly configured (reducing runner minute consumption).
   */
  it("should trigger on pushes and pull requests to the main branch", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(doc.on, "Missing 'on' trigger configuration").toBeDefined();

    // Check push config
    const pushConfig = doc.on.push;
    expect(pushConfig, "Missing 'push' trigger").toBeDefined();
    expect(
      pushConfig.branches,
      "push trigger must specify branches list"
    ).toContain("main");

    // Check pull_request config
    const prConfig = doc.on.pull_request;
    expect(prConfig, "Missing 'pull_request' trigger").toBeDefined();
    expect(
      prConfig.branches,
      "pull_request trigger must specify branches list"
    ).toContain("main");
  });

  /**
   * Scenario: Workflow must define lint, test, and build jobs.
   * These three jobs represent the minimum viable CI pipeline:
   * - lint: Catches code style and static analysis issues early (fast, <30s)
   * - test: Runs the test suite to verify functional correctness
   * - build: Compiles TypeScript to verify type safety and produce artifacts
   *
   * Missing any of these creates gaps in the quality gate.
   */
  it("should define lint, test, and build jobs as the three pipeline stages", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(doc.jobs, "Missing 'jobs' section").toBeDefined();
    expect(doc.jobs.lint, "Missing 'lint' job").toBeDefined();
    expect(doc.jobs.test, "Missing 'test' job").toBeDefined();
    expect(doc.jobs.build, "Missing 'build' job").toBeDefined();
  });

  /**
   * Scenario: Jobs must have explicit sequential dependencies via 'needs'.
   * Without 'needs', all jobs run in parallel. This means:
   * - The build job could pass while tests are still running
   * - A failed test doesn't block the build from succeeding
   * - Invalid code could be packaged and deployed
   *
   * Correct order: lint → test → build (each gate guards the next)
   */
  it("should establish correct job order: test needs lint, build needs test", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const testJob = doc.jobs.test;
    const buildJob = doc.jobs.build;

    // test depends on lint
    expect(testJob.needs, "test job must declare 'needs: lint'").toBeDefined();
    if (Array.isArray(testJob.needs)) {
      expect(testJob.needs, "test job needs array must include 'lint'").toContain("lint");
    } else {
      expect(testJob.needs, "test job needs must be 'lint'").toBe("lint");
    }

    // build depends on test
    expect(buildJob.needs, "build job must declare 'needs: test'").toBeDefined();
    if (Array.isArray(buildJob.needs)) {
      expect(buildJob.needs, "build job needs array must include 'test'").toContain("test");
    } else {
      expect(buildJob.needs, "build job needs must be 'test'").toBe("test");
    }
  });

  /**
   * Scenario: All jobs must use ubuntu-latest as the runner.
   * Why ubuntu-latest?
   * - Most production Linux deployments use Ubuntu
   * - GitHub provides ubuntu runners at no extra cost
   * - ubuntu-latest includes modern toolchain versions
   * - Consistent runner OS across jobs ensures predictable behavior
   */
  it("should use ubuntu-latest runner for all pipeline jobs", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(
      doc.jobs.lint["runs-on"],
      "lint job must use ubuntu-latest runner"
    ).toBe("ubuntu-latest");
    expect(
      doc.jobs.test["runs-on"],
      "test job must use ubuntu-latest runner"
    ).toBe("ubuntu-latest");
    expect(
      doc.jobs.build["runs-on"],
      "build job must use ubuntu-latest runner"
    ).toBe("ubuntu-latest");
  });

  /**
   * Scenario: At least one job must implement dependency caching.
   * Why: npm install/ci downloads packages from the internet on every runner.
   * Without caching, a 200-package project installs in ~60 seconds per job.
   * With npm cache enabled, subsequent runs take ~5 seconds.
   * Over 100 pipeline runs/day, this saves ~150 minutes of runner time.
   */
  it("should implement dependency caching (setup-node cache or actions/cache) in at least one job", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");

    // Quick text check or structural check for actions/cache or cache: npm
    const hasCache =
      rawContent.includes("cache: 'npm'") ||
      rawContent.includes('cache: "npm"') ||
      rawContent.includes("actions/cache");

    expect(
      hasCache,
      "At least one job must use dependency caching (actions/cache or setup-node cache: 'npm')"
    ).toBe(true);
  });

  /**
   * Scenario: Each job must include a repository checkout step.
   * Why: GitHub Actions runners are fresh VMs. Without checkout, the
   * runner has no access to the repository code and all subsequent
   * commands (npm ci, npm run lint, etc.) will fail with "file not found".
   */
  it("should include actions/checkout step in each job", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const hasCheckout = (steps: any[]) =>
      steps?.some((step: any) => step.uses?.startsWith("actions/checkout"));

    expect(
      hasCheckout(doc.jobs.lint?.steps),
      "lint job must include actions/checkout"
    ).toBe(true);
    expect(
      hasCheckout(doc.jobs.test?.steps),
      "test job must include actions/checkout"
    ).toBe(true);
    expect(
      hasCheckout(doc.jobs.build?.steps),
      "build job must include actions/checkout"
    ).toBe(true);
  });

  /**
   * Scenario: Each job must install dependencies before running commands.
   * Why: Runners start fresh with no node_modules. Even with caching,
   * npm ci must be called to restore packages from cache to node_modules.
   * Missing this causes "Cannot find module 'vitest'" errors.
   *
   * Using 'npm ci' (not 'npm install'):
   * - npm ci uses package-lock.json exactly (deterministic)
   * - npm ci is 2x faster than npm install on fresh installs
   * - npm ci fails if package-lock.json is out of sync (safety net)
   */
  it("should run npm ci (not npm install) for deterministic dependency installation", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");

    // Should contain npm ci (not just npm install)
    expect(
      rawContent,
      "All jobs should use 'npm ci' for deterministic builds"
    ).toMatch(/npm\s+ci/);

    // Warn if npm install is also present (might be intentional in some steps)
    const hasNpmInstall = rawContent.includes("npm install");
    if (hasNpmInstall) {
      console.warn(
        "Warning: 'npm install' found in workflow. Consider replacing with 'npm ci' for reproducibility."
      );
    }
  });

  /**
   * Scenario: Lint job must invoke the npm run lint script.
   * Why: This verifies ESLint (or equivalent) is actually being called.
   * A workflow that installs dependencies but skips running lint is not
   * a lint stage — it's dead weight consuming runner minutes.
   */
  it("should execute npm run lint in the lint job steps", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const lintSteps: any[] = doc.jobs.lint?.steps || [];
    const hasLintRun = lintSteps.some(
      (step: any) =>
        step.run?.includes("npm run lint") || step.run?.includes("lint")
    );

    expect(
      hasLintRun,
      "lint job must include a step running 'npm run lint'"
    ).toBe(true);
  });

  /**
   * Scenario: Test job must invoke the npm run test script.
   * Why: A CI pipeline that doesn't run tests is not CI — it's just
   * a build system. Tests are the primary quality gate.
   */
  it("should execute npm run test in the test job steps", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const testSteps: any[] = doc.jobs.test?.steps || [];
    const hasTestRun = testSteps.some(
      (step: any) =>
        step.run?.includes("npm run test") ||
        step.run?.includes("npm test") ||
        step.run?.includes("vitest")
    );

    expect(
      hasTestRun,
      "test job must include a step running 'npm run test' or 'npm test'"
    ).toBe(true);
  });

  /**
   * Scenario: Build job must invoke the npm run build script.
   * Why: The build step compiles TypeScript → JavaScript. Without it,
   * no artifact is produced and deployment pipelines downstream have
   * nothing to ship.
   */
  it("should execute npm run build in the build job steps", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const buildSteps: any[] = doc.jobs.build?.steps || [];
    const hasBuildRun = buildSteps.some(
      (step: any) =>
        step.run?.includes("npm run build") || step.run?.includes("tsc")
    );

    expect(
      hasBuildRun,
      "build job must include a step running 'npm run build'"
    ).toBe(true);
  });
});
