import { describe, expect, it } from "vitest";
import { InMemoryAuditSink, redactMetadata } from "../audit";
import { CredentialGateway, EphemeralSecretManager, fingerprint } from "../credentials";
import { createRuntime } from "../runtime";
import { doc, provider } from "./fixtures";

const SECRET = "super-secret-value-1234567890";

function harness() {
  const audit = new InMemoryAuditSink();
  const manager = new EphemeralSecretManager();
  const gateway = new CredentialGateway(
    manager,
    audit,
    async ({ secret, minSecretLength }) => ({ ok: secret.length >= minSecretLength }),
    () => ({ minSecretLength: 16, allowedNamespaces: ["kare-dev"] }),
  );
  return { audit, manager, gateway };
}

const request = (over: Record<string, unknown> = {}) => ({
  provider: "acme",
  label: "ACME API key",
  namespace: "kare-dev",
  secret: SECRET,
  actorId: "operator",
  ...over,
});

describe("credential gateway", () => {
  it("creates a reference-only record and never returns the secret", async () => {
    const { gateway } = harness();
    const record = await gateway.connect(request());
    expect(record.credentialRef).toMatch(/^cred_/);
    expect(JSON.stringify(record)).not.toContain(SECRET);
    expect(record.fingerprint).not.toContain(SECRET);
    expect(record.managerIsEphemeral).toBe(true);
    expect(await gateway.isUsable(record.credentialRef)).toBe(true);
  });

  it("stores the raw value only via the secret manager abstraction", async () => {
    const { gateway, manager } = harness();
    const record = await gateway.connect(request());
    expect(await manager.has("kare-dev", record.credentialRef)).toBe(true);
    expect(Object.keys(record)).not.toContain("secret");
  });

  it("keeps secrets out of audit records", async () => {
    const { gateway, audit } = harness();
    await gateway.connect(request());
    expect(JSON.stringify(audit.list())).not.toContain(SECRET);
  });

  it("redacts secret-like metadata keys but keeps references", () => {
    const out = redactMetadata({ apiKey: SECRET, token: SECRET, credentialRef: "cred_x" });
    expect(out.apiKey).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.credentialRef).toBe("cred_x");
  });

  it("rejects a secret below the configured minimum (invalid credential)", async () => {
    const { gateway } = harness();
    await expect(gateway.connect(request({ secret: "short-ish" }))).rejects.toThrow();
  });

  it("rejects a namespace outside the configured allow-list", async () => {
    const { gateway, audit } = harness();
    await expect(gateway.connect(request({ namespace: "kare-prod" }))).rejects.toThrowError(
      /not allowed/,
    );
    expect(audit.list().some((e) => e.outcome === "denied")).toBe(true);
  });

  it("rejects malformed credential requests", async () => {
    const { gateway } = harness();
    await expect(gateway.connect({ provider: "a" })).rejects.toThrowError(/validation/);
  });

  it("fingerprints are non-reversible and stable", () => {
    expect(fingerprint(SECRET)).toBe(fingerprint(SECRET));
    expect(fingerprint(SECRET)).not.toContain(SECRET);
  });

  it("the shipped runtime enforces the configured credential policy", async () => {
    const r = createRuntime(provider(doc()));
    const record = await r.credentials.connect(request({ secret: SECRET }));
    expect(record.namespace).toBe("kare-dev");
    await expect(r.credentials.connect(request({ namespace: "nope", secret: SECRET }))).rejects.toThrow();
  });
});
