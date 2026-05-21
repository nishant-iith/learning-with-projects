import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import YAML from "yaml";

describe("GitHub Actions CI/CD Pipeline TDD Verification", () => {
  const workflowPath = path.join(process.cwd(), ".github", "workflows", "ci.yml");

  it("should contain the ci.yml workflow file", () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
  });

  it("should parse as a valid YAML structure", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);
    expect(doc).toBeTypeOf("object");
    expect(doc.name).toBeDefined();
  });

  it("should trigger on pushes and pull requests to the main branch", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(doc.on).toBeDefined();
    
    // Check push config
    const pushConfig = doc.on.push;
    expect(pushConfig).toBeDefined();
    expect(pushConfig.branches).toContain("main");

    // Check pull_request config
    const prConfig = doc.on.pull_request;
    expect(prConfig).toBeDefined();
    expect(prConfig.branches).toContain("main");
  });

  it("should define lint, test, and build jobs", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(doc.jobs).toBeDefined();
    expect(doc.jobs.lint).toBeDefined();
    expect(doc.jobs.test).toBeDefined();
    expect(doc.jobs.build).toBeDefined();
  });

  it("should establish job order and dependencies (needs status)", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    const testJob = doc.jobs.test;
    const buildJob = doc.jobs.build;

    // test depends on lint
    expect(testJob.needs).toBeDefined();
    if (Array.isArray(testJob.needs)) {
      expect(testJob.needs).toContain("lint");
    } else {
      expect(testJob.needs).toBe("lint");
    }

    // build depends on test
    expect(buildJob.needs).toBeDefined();
    if (Array.isArray(buildJob.needs)) {
      expect(buildJob.needs).toContain("test");
    } else {
      expect(buildJob.needs).toBe("test");
    }
  });

  it("should use latest ubuntu runner for all jobs", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    const doc = YAML.parse(rawContent);

    expect(doc.jobs.lint["runs-on"]).toBe("ubuntu-latest");
    expect(doc.jobs.test["runs-on"]).toBe("ubuntu-latest");
    expect(doc.jobs.build["runs-on"]).toBe("ubuntu-latest");
  });

  it("should implement dependency caching or npm setup-node caching in at least one job", () => {
    if (!fs.existsSync(workflowPath)) return;
    const rawContent = fs.readFileSync(workflowPath, "utf-8");
    
    // Quick text check or structural check for actions/cache or cache: npm
    const hasCache = rawContent.includes("cache: 'npm'") || rawContent.includes("cache: \"npm\"") || rawContent.includes("actions/cache");
    expect(hasCache).toBe(true);
  });
});
