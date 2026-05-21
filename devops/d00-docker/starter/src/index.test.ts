import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Dockerfile TDD Verification", () => {
  const dockerfilePath = path.join(process.cwd(), "Dockerfile");

  it("should contain a Dockerfile", () => {
    expect(fs.existsSync(dockerfilePath)).toBe(true);
  });

  it("should implement multi-stage build structure", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Look for at least two FROM statements to indicate multi-stage
    const fromMatches = content.match(/FROM\s+/gi);
    expect(fromMatches ? fromMatches.length : 0).toBeGreaterThanOrEqual(2);

    // Look for stage aliases like AS build or AS builder
    expect(content).toMatch(/AS\s+(build|builder)/i);
  });

  it("should target node:20-alpine or similar minimal alpine base image in runtime stage", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Check if alpine/slim image is used
    expect(content).toMatch(/node:\d+-(alpine|slim)/i);
  });

  it("should enforce container security with non-root USER node execution", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Make sure USER node is configured in the Dockerfile
    expect(content).toMatch(/USER\s+node/i);
  });

  it("should expose port 3000", () => {
    if (!fs.existsSync(dockerfilePath)) return;
    const content = fs.readFileSync(dockerfilePath, "utf-8");

    expect(content).toMatch(/EXPOSE\s+3000/i);
  });
});

describe("Docker Compose TDD Verification", () => {
  const composePath = path.join(process.cwd(), "docker-compose.yml");

  it("should contain a docker-compose.yml", () => {
    expect(fs.existsSync(composePath)).toBe(true);
  });

  it("should declare both 'web' and 'db' services", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content).toMatch(/web:/i);
    expect(content).toMatch(/db:/i);
  });

  it("should configure postgres:15-alpine or similar official postgres image for database", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content).toMatch(/postgres:\d+(-alpine)?/i);
  });

  it("should map web port 3000 and configure database dependencies", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content).toMatch(/3000:3000/i);
    expect(content).toMatch(/depends_on:/i);
  });

  it("should define database volume mapping for durability", () => {
    if (!fs.existsSync(composePath)) return;
    const content = fs.readFileSync(composePath, "utf-8");

    expect(content).toMatch(/volumes:/i);
  });
});
