import { describe, expect, it } from "vitest";
import { InMemoryAuditSink } from "../audit";
import { MockExternalAgentAdapter, SimulatedTransport } from "../adapters/jarvis-mock";
import { resolveConfig } from "../config";
import { AgentGateway } from "../gateway";
import { createRuntime } from "../runtime";
import { doc, provider, rid, withScript } from "./fixtures";

function harness(document: any = doc(), health: Record<string, any> = {}) {
  const audit = new InMemoryAuditSink();
  const resolved = resolveConfig(provider(document));
  let clock = 0;
  const gateway = new AgentGateway(
    resolved,
    audit,
    async () => {},
    () => (clock += 1000),
  );
  for (const agent of resolved.config.agents) {
    const sim = resolved.simulationFor(agent.agentId);
    gateway.register(
      new MockExternalAgentAdapter(
        agent.agentId,
        agent.endpointRef!,
        agent.credentialRef,
        new SimulatedTransport(sim.script),
        () => health[agent.agentId] ?? sim.health,
      ),
    );
  }
  return { gateway, audit, resolved };
}

const task = (n: string, capability = "engineering.inspect") => ({
  requestId: rid(n),
  capability,
  objective: "inspect the module",
  payload: {},
});

describe("agent gateway", () => {
  it("registers agents generically and audits registration", () => {
    const { audit } = harness();
    const events = audit.list().filter((e) => e.action === "gateway.register");
    expect(events.length).toBe(2);
    expect(events.some((e) => e.subject === "jarvis-external")).toBe(true);
  });

  it("discovers capabilities without leaking implementation detail", () => {
    const { gateway } = harness();
    const found = gateway.discover();
    expect(found.map((c) => c.capability)).toContain("engineering.change");
    expect(found.every((c) => c.agents.every((a) => typeof a.isMock === "boolean"))).toBe(true);
  });

  it("routes an authorized task and records provenance", async () => {
    const { gateway } = harness();
    const result = await gateway.execute({ task: task("ok"), scopes: ["kare:execute"], actorId: "t" });
    expect(result.ok).toBe(true);
    expect(result.provenance.agentId).toBe("kare-analyzer");
    expect(result.provenance.isMock).toBe(true);
    expect(result.provenance.configVersion).toBe("kare-config/v1");
    expect(result.provenance.endpointRef).toBe("endpoint.kare.analyzer.local");
  });

  it("rejects unauthorized callers (missing scope)", async () => {
    const { gateway } = harness();
    await expect(
      gateway.execute({ task: task("noscope"), scopes: [], actorId: "t" }),
    ).rejects.toThrowError(/Missing scopes/);
  });

  it("rejects invalid task input", async () => {
    const { gateway } = harness();
    await expect(
      gateway.execute({ task: { requestId: "x" }, scopes: ["kare:execute"], actorId: "t" }),
    ).rejects.toThrowError(/schema validation/);
  });

  it("skips unavailable agents and fails closed when none remain", async () => {
    const { gateway } = harness(doc(), { "kare-analyzer": "unavailable", "jarvis-external": "unavailable" });
    await expect(
      gateway.execute({ task: task("down"), scopes: ["kare:execute"], actorId: "t" }),
    ).rejects.toThrowError(/No healthy agent/);
  });

  it("falls over to the next configured agent when the preferred one is unavailable", async () => {
    const { gateway } = harness(doc(), { "kare-analyzer": "unavailable" });
    const r = await gateway.execute({ task: task("failover"), scopes: ["kare:execute"], actorId: "t" });
    expect(r.provenance.agentId).toBe("jarvis-external");
  });

  it("retries per configured policy on transient outcomes", async () => {
    const d = withScript("kare-analyzer", [
      { ok: false, outcome: "transient", summary: "flaky" },
      { ok: true, outcome: "success", summary: "second try" },
    ]);
    const { gateway } = harness(d);
    const r = await gateway.execute({ task: task("retry"), scopes: ["kare:execute"], actorId: "t" });
    expect(r.ok).toBe(true);
    expect(r.provenance.attempt).toBe(2);
  });

  it("stops at configured retry exhaustion", async () => {
    const d = withScript("kare-analyzer", [{ ok: false, outcome: "transient", summary: "always flaky" }]);
    const { gateway, resolved } = harness(d);
    const r = await gateway.execute({ task: task("exhaust"), scopes: ["kare:execute"], actorId: "t" });
    expect(r.ok).toBe(false);
    expect(r.provenance.attempt).toBe(resolved.policyFor("policy.internal.fast").retry.maxAttempts);
  });

  it("does not retry non-retryable outcomes (timeout on the internal policy)", async () => {
    const d = withScript("kare-analyzer", [{ ok: false, outcome: "timeout", summary: "timed out" }]);
    const { gateway } = harness(d);
    const r = await gateway.execute({ task: task("timeout"), scopes: ["kare:execute"], actorId: "t" });
    expect(r.outcome).toBe("timeout");
    expect(r.provenance.attempt).toBe(1);
  });

  it("treats a malformed adapter response as a failure, not a pass", async () => {
    const audit = new InMemoryAuditSink();
    const resolved = resolveConfig(provider(doc()));
    const gateway = new AgentGateway(resolved, audit, async () => {});
    gateway.register({
      agentId: "kare-analyzer",
      async health() {
        return "healthy";
      },
      async execute() {
        return { garbage: true } as any;
      },
    });
    const r = await gateway.execute({ task: task("malformed"), scopes: ["kare:execute"], actorId: "t" });
    expect(r.ok).toBeFalsy();
  });

  it("opens the circuit at the configured failure threshold", async () => {
    const d = withScript("kare-analyzer", [{ ok: false, outcome: "transient", summary: "down" }]);
    d.routing["engineering.inspect"] = ["kare-analyzer"];
    const { gateway } = harness(d);
    await gateway.execute({ task: task("c1"), scopes: ["kare:execute"], actorId: "t" });
    await expect(
      gateway.execute({ task: task("c2"), scopes: ["kare:execute"], actorId: "t" }),
    ).rejects.toThrowError(/No healthy agent|Circuit open/);
  });

  it("is idempotent per requestId", async () => {
    const { gateway } = harness();
    const a = await gateway.execute({ task: task("idem"), scopes: ["kare:execute"], actorId: "t" });
    const b = await gateway.execute({ task: task("idem"), scopes: ["kare:execute"], actorId: "t" });
    expect(b).toBe(a);
  });

  it("the shipped runtime document boots and executes end to end", async () => {
    const runtime = createRuntime();
    const r = await runtime.gateway.execute({
      task: task("runtime"),
      scopes: ["kare:execute"],
      actorId: "t",
    });
    expect(r.ok).toBe(true);
  });
});
