import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { KAREToolGate } from "@/kare/tool-gate";

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

/**
 * Zod validation schema for JARVIS [TOOL_REQUEST] payloads.
 */
const ToolRequestSchema = z.object({
  requestId: z.string().min(4),
  timestamp: z.number(),
  action: z.enum([
    "FS_READ",
    "FS_EXISTS",
    "FS_LIST",
    "SHELL_INSPECT",
    "SANDBOX_EDIT",
  ]),
  targetPath: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  content: z.string().optional(),
  reasoning: z.string().min(1),
});

const toolGate = new KAREToolGate();

async function boundary() {
  const { getRuntime } = await import("@/kare/runtime");
  const runtime = getRuntime();
  const actor = runtime.resolved.config.apiBoundary;
  return { runtime, actor };
}

/**
 * Server function to authorize and process JARVIS [TOOL_REQUEST] payloads
 * through the K-ARE Tool Gate.
 */
export const executeJarvisToolRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ToolRequestSchema.parse(input))
  .handler(async ({ data }) => {
    // Bound to K-ARE operator boundary context
    const { actor } = await boundary();
    const result = await toolGate.processRequest(data);
    return {
      ...result,
      operatorActorId: actor.operatorActorId,
    };
  });

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
