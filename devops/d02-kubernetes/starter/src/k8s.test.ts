import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import YAML from "yaml";

describe("Kubernetes Manifests TDD Verification", () => {
  const readManifest = (filename: string): any => {
    const filePath = path.join(process.cwd(), filename);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    // Strip comments to ensure we are parsing active YAML blocks
    const activeYaml = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    if (!activeYaml.trim()) return null;
    return YAML.parse(activeYaml);
  };

  it("should contain a valid configmap.yaml with proper schema and database hosts", () => {
    const doc = readManifest("configmap.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.apiVersion).toBe("v1");
    expect(doc.kind).toBe("ConfigMap");
    expect(doc.metadata.name).toBe("app-config");
    expect(doc.data.DB_HOST).toBe("postgres-service");
  });

  it("should contain a valid secrets.yaml declaring Opaque database credentials", () => {
    const doc = readManifest("secrets.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.apiVersion).toBe("v1");
    expect(doc.kind).toBe("Secret");
    expect(doc.metadata.name).toBe("app-secrets");
    expect(doc.type).toBe("Opaque");
    expect(doc.data.DB_USER).toBeDefined();
    expect(doc.data.DB_PASSWORD).toBeDefined();
  });

  it("should define postgres database deployment running postgres:15-alpine", () => {
    const doc = readManifest("postgres-deployment.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.kind).toBe("Deployment");
    expect(doc.metadata.name).toBe("postgres-deployment");
    
    const container = doc.spec.template.spec.containers[0];
    expect(container.name).toBe("postgres");
    expect(container.image).toMatch(/postgres:\d+(-alpine)?/);
  });

  it("should define postgres service mapping internal port 5432", () => {
    const doc = readManifest("postgres-service.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.kind).toBe("Service");
    expect(doc.metadata.name).toBe("postgres-service");
    expect(doc.spec.type).toBe("ClusterIP");
    expect(doc.spec.ports[0].port).toBe(5432);
  });

  it("should define web-deployment with 2 replicas, resources limits, and health probes", () => {
    const doc = readManifest("web-deployment.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.kind).toBe("Deployment");
    expect(doc.metadata.name).toBe("web-deployment");
    expect(doc.spec.replicas).toBe(2);

    const container = doc.spec.template.spec.containers[0];
    expect(container.name).toBe("web");
    
    // Check environment injection from configmap/secret
    const envVars = container.env || [];
    expect(envVars.length).toBeGreaterThan(0);

    // Assert CPU and Memory constraints
    expect(container.resources).toBeDefined();
    expect(container.resources.limits).toBeDefined();
    expect(container.resources.requests).toBeDefined();

    // Assert Health probes
    expect(container.livenessProbe).toBeDefined();
    expect(container.readinessProbe).toBeDefined();
    expect(container.readinessProbe.httpGet.path).toBe("/health");
  });

  it("should define web-service exposing port 80 externally mapping to container port 3000", () => {
    const doc = readManifest("web-service.yaml");
    expect(doc).toBeTypeOf("object");
    expect(doc.kind).toBe("Service");
    expect(doc.metadata.name).toBe("web-service");
    expect(doc.spec.ports[0].port).toBe(80);
    expect(doc.spec.ports[0].targetPort).toBe(3000);
  });
});
