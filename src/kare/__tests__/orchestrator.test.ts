import { describe, expect, it } from "vitest";
import { createRuntime } from "../runtime";
import { canTransition, isTerminal } from "../state-machine";
import { OPERATOR, doc, provider, rid, testFailsEverywhere, withScript } from "./fixtures";

function runtime(document: any = doc()) {
  return createRuntime(provider(document));
}

const req = (n: string, over: Record<string, unknown> = {}) => ({
  requestId: rid(n),
  capability: "engineering.inspect",
  objective: "refactor the routing module",
  risk: "low",
  actor: OPERATOR,
  payload: {},
  ...over,
});

describe("state machine", () => {
  it("permits only declared transitions", () => {
    expect(canTransition("INTAKE", "UNDERSTAND")).toBe(true);
    expect(canTransition("INTAKE", "COMPLETED")).toBe(false);
    expect(canTransition("TEST", "VERIFY")).toBe(true);
    expect(canTransition("VERIFY", "CHANGE")).toBe(false);
    expect(isTerminal("ROLLED_BACK")).toBe(true);
  });
});

describe("orchestrator core loop", () => {
  it("rejects invalid task input", async () => {
    const r = runtime();
    await expect(r.orchestrator.submit({ objective: "x" })).rejects.toThrowError(
      /schema validation/,
    );
  });

  it("runs UNDERSTAND->...->RECORD->COMPLETED with execution evidence", async () => {
    const r = runtime();
    const task = await r.orchestrator.submit(req("happy"));
    expect(task.state).toBe("COMPLETED");
    expect(task.verdict).toBe("pass");
    const states = task.timeline.map((t) => t.state);
    expect(states).toEqual([
      "INTAKE",
      "UNDERSTAND",
      "INSPECT",
      "PLAN",
      "CHANGE",
      "TEST",
      "VERIFY",
      "RECORD",
      "COMPLETED",
    ]);
    expect(task.evidence.some((e) => e.kind === "test-run" && e.outcome === "pass")).toBe(true);
  });

  it("is idempotent on repeated requestIds", async () => {
    const r = runtime();
    const a = await r.orchestrator.submit(req("idem"));
    const b = await r.orchestrator.submit(req("idem"));
    expect(b.taskId).toBe(a.taskId);
  });

  it("holds high-risk work at the approval gate and requires kare:approve", async () => {
    const r = runtime();
    const task = await r.orchestrator.submit(req("approval", { risk: "high" }));
    expect(task.state).toBe("AWAITING_APPROVAL");
    expect(task.approval).toMatchObject({ required: true, status: "pending" });
    await expect(
      r.orchestrator.decide({ taskId: task.taskId, approve: true, actorId: "x", scopes: [] }),
    ).rejects.toThrowError(/kare:approve/);
    expect(r.orchestrator.get(task.taskId)!.state).toBe("AWAITING_APPROVAL");
  });

  it("proceeds after approval and records the decision", async () => {
    const r = runtime();
    const task = await r.orchestrator.submit(req("approved", { risk: "high" }));
    const done = await r.orchestrator.decide({
      taskId: task.taskId,
      approve: true,
      actorId: "approver",
      scopes: OPERATOR.scopes,
    });
    expect(done.state).toBe("COMPLETED");
    expect(r.audit.list().some((e) => e.action === "task.approve")).toBe(true);
  });

  it("rejects on denial without executing CHANGE", async () => {
    const r = runtime();
    const task = await r.orchestrator.submit(req("denied", { risk: "critical" }));
    const out = await r.orchestrator.decide({
      taskId: task.taskId,
      approve: false,
      actorId: "approver",
      scopes: OPERATOR.scopes,
    });
    expect(out.state).toBe("REJECTED");
    expect(out.timeline.some((t) => t.state === "CHANGE")).toBe(false);
  });

  it("bounds correction by the configured budget and then rolls back", async () => {
    const d = testFailsEverywhere();
    const r = runtime(d);
    const task = await r.orchestrator.submit(req("budget"));
    expect(task.correctionsUsed).toBe(task.correctionBudget);
    expect(task.correctionsUsed).toBe(d.correction.maxCorrectionAttempts);
    expect(task.state).toBe("ROLLED_BACK");
    expect(task.verdict).toBe("fail");
    expect(task.timeline.filter((t) => t.state === "CORRECT").length).toBe(task.correctionBudget);
  });

  it("cannot reach PASS when no passing test evidence exists", async () => {
    const d = testFailsEverywhere();
    const r = runtime(d);
    const task = await r.orchestrator.submit(req("nopass"));
    expect(task.verdict).not.toBe("pass");
    expect(task.evidence.some((e) => e.kind === "test-run" && e.outcome === "pass")).toBe(false);
  });

  it("executes a full rollback scenario with checkpoint and restore evidence", async () => {
    const d = testFailsEverywhere();
    d.correction.maxCorrectionAttempts = 0;
    const r = runtime(d);
    const task = await r.orchestrator.submit(req("rollback"));
    expect(task.correctionsUsed).toBe(0);
    expect(task.rollback).toMatchObject({ available: true, status: "completed" });
    expect(task.evidence.some((e) => e.label.startsWith("checkpoint"))).toBe(true);
    const restore = task.evidence.find((e) => e.label.startsWith("rollback"));
    expect(restore?.outcome).toBe("pass");
    expect(task.state).toBe("ROLLED_BACK");
    expect(r.audit.list().some((e) => e.action === "task.rollback")).toBe(true);
  });

  it("rolls back instead of auto-correcting for rollback-mandated risk", async () => {
    const d = testFailsEverywhere();
    const r = runtime(d);
    const task = await r.orchestrator.submit(req("critrb", { risk: "critical" }));
    const out = await r.orchestrator.decide({
      taskId: task.taskId,
      approve: true,
      actorId: "a",
      scopes: OPERATOR.scopes,
    });
    expect(out.state).toBe("ROLLED_BACK");
    expect(out.correctionsUsed).toBe(0);
  });

  it("fails the task when the gateway cannot route (no unauthorized continuation)", async () => {
    const d = doc();
    d.simulation.agents["kare-analyzer"].health = "unavailable";
    d.simulation.agents["jarvis-external"].health = "unavailable";
    const r = runtime(d);
    const task = await r.orchestrator.submit(req("noagent"));
    expect(task.state).toBe("FAILED");
    expect(task.timeline.some((t) => t.state === "CHANGE")).toBe(false);
    expect(task.evidence.some((e) => e.outcome === "fail")).toBe(true);
  });

  it("records configuration provenance for every task consumption", async () => {
    const r = runtime();
    const task = await r.orchestrator.submit(req("prov"));
    const consumptions = r.resolved.consumptions();
    expect(consumptions.some((c) => c.key === "correction" && c.ref === task.taskId)).toBe(true);
    expect(consumptions.every((c) => c.configVersion === "kare-config/v1")).toBe(true);
    expect(consumptions.every((c) => c.source === "test-fixture")).toBe(true);
  });
});
