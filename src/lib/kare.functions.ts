import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Minimum K-ARE server/API boundary for Slice 1.
 * Every input is schema validated. No secret material, no secret-manager values
 * and no arbitrary execution are exposed. The caller never supplies its own
 * scopes — the boundary uses the operator identity from versioned configuration.
 */
const TaskIdSchema = z.object({ taskId: z.string().min(4) });

const SubmitSchema = z.object({
  requestId: z.string().min(8).max(200),
  capability: z.string().min(3).max(120),
  objective: z.string().min(4).max(4000),
  risk: z.enum(["low", "medium", "high", "critical"]),
});

const DecisionSchema = z.object({ taskId: z.string().min(4), approve: z.boolean() });

async function boundary() {
  const { getRuntime } = await import("@/kare/runtime");
  const runtime = getRuntime();
  const actor = runtime.resolved.config.apiBoundary;
  return { runtime, actor };
}

export const getKareStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { runtime } = await boundary();
  await runtime.gateway.refreshHealth();
  return {
    provenance: runtime.resolved.provenance,
    source: runtime.resolved.source,
    invariantId: "KF-ARCH-INVARIANT-001",
    jarvisIntegration: "MOCK / EXTERNAL ADAPTER CONTRACT ONLY",
    capabilities: runtime.gateway.discover(),
    health: runtime.gateway.healthSnapshot(),
    observations: runtime.gateway.observations_().slice(0, 20),
    tasks: runtime.orchestrator.list(),
    audit: runtime.audit.list().slice(0, 40),
    configConsumptions: runtime.resolved.consumptions().slice(-20),
  };
});

export const submitKareTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { runtime, actor } = await boundary();
    const task = await runtime.orchestrator.submit({
      ...data,
      actor: { actorId: actor.operatorActorId, scopes: actor.operatorScopes },
      payload: {},
    });
    return task;
  });

export const getKareTask = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TaskIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { runtime } = await boundary();
    return runtime.orchestrator.get(data.taskId) ?? null;
  });

export const decideKareTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DecisionSchema.parse(input))
  .handler(async ({ data }) => {
    const { runtime, actor } = await boundary();
    return runtime.orchestrator.decide({
      taskId: data.taskId,
      approve: data.approve,
      actorId: actor.operatorActorId,
      scopes: actor.operatorScopes,
    });
  });

export const getKareEvidence = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TaskIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { runtime } = await boundary();
    return runtime.orchestrator.get(data.taskId)?.evidence ?? [];
  });

export const getKareAgentHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { runtime } = await boundary();
  return await runtime.gateway.refreshHealth();
});

export const getKareAudit = createServerFn({ method: "GET" }).handler(async () => {
  const { runtime } = await boundary();
  return runtime.audit.list().slice(0, 100);
});
