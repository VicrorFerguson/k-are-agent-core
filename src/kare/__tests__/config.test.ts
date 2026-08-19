import { describe, expect, it } from "vitest";
import { StaticConfigProvider, resolveConfig } from "../config";
import { doc, provider } from "./fixtures";

describe("configuration authority", () => {
  it("resolves a valid versioned document and exposes provenance", () => {
    const r = resolveConfig(provider(doc(), "config/kare.config.json"));
    expect(r.config.configVersion).toBe("kare-config/v1");
    expect(r.provenance.revision).toBeGreaterThan(0);
    expect(r.provenance.immutable).toBe(true);
    expect(r.provenance.publishedBy.length).toBeGreaterThan(0);
  });

  it("fails closed when configuration is missing", () => {
    expect(() => resolveConfig(new StaticConfigProvider(null, "empty"))).toThrowError(
      /No K-ARE configuration/,
    );
  });

  it("fails closed on malformed (non-object) configuration", () => {
    expect(() => resolveConfig(provider("not-a-document"))).toThrowError(/must be an object/);
  });

  it("fails closed on schema-invalid configuration", () => {
    const d = doc();
    delete d.policies;
    expect(() => resolveConfig(provider(d))).toThrowError(/schema validation/);
  });

  it("rejects an invalid configVersion", () => {
    const d = doc();
    d.configVersion = "v9";
    expect(() => resolveConfig(provider(d))).toThrowError(/schema validation|Unsupported/);
  });

  it("rejects an unsupported configVersion that is well-formed", () => {
    const d = doc();
    d.configVersion = "kare-config/v99";
    expect(() => resolveConfig(provider(d))).toThrowError(/Unsupported configVersion/);
  });

  it("rejects missing/invalid provenance", () => {
    const d = doc();
    delete d.provenance;
    expect(() => resolveConfig(provider(d))).toThrowError(/schema validation/);
    const d2 = doc();
    d2.provenance.immutable = false;
    expect(() => resolveConfig(provider(d2))).toThrowError(/schema validation/);
  });

  it("rejects a document that attempts to override a protected invariant", () => {
    const d = doc();
    d.JARVIS_IS_EXTERNAL_API_ONLY = false;
    expect(() => resolveConfig(provider(d))).toThrowError(/protected architectural invariant/);
  });

  it("rejects dangling references (corrupted configuration)", () => {
    const d = doc();
    d.routing["engineering.inspect"] = ["ghost-agent"];
    expect(() => resolveConfig(provider(d))).toThrowError(/unknown agent/);
    const d2 = doc();
    d2.defaults.selectionPolicyRef = "policy.nope";
    expect(() => resolveConfig(provider(d2))).toThrowError(/selectionPolicyRef/);
  });

  it("is immutable once published (frozen)", () => {
    const r = resolveConfig(provider(doc()));
    expect(Object.isFrozen(r.config)).toBe(true);
    expect(() => {
      (r.config.correction as any).maxCorrectionAttempts = 99;
    }).toThrow();
  });

  it("records provenance for every runtime consumption", () => {
    const r = resolveConfig(provider(doc()));
    r.selectionPolicy("task-1");
    r.agentsForCapability("engineering.inspect", "task-1");
    const c = r.consumptions();
    expect(c.length).toBe(2);
    expect(c[0]).toMatchObject({ configVersion: "kare-config/v1", ref: "task-1" });
    expect(c[0]!.at).toMatch(/\dT\d/);
  });

  it("fails closed for an unknown capability and unknown policy", () => {
    const r = resolveConfig(provider(doc()));
    expect(() => r.agentsForCapability("nope.nope")).toThrowError(/No route configured/);
    expect(() => r.policyFor("policy.ghost")).toThrowError(/is not defined/);
  });
});
