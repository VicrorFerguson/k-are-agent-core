import { z } from "zod";
import type { AuditSink } from "./audit";
import type { ResolvedConfig } from "./config";
import type { AgentDescriptor, ExecutionPolicy, HealthState } from "./domain";
import { KareError } from "./errors";

/** ------------------------------------------------------------- contracts */
export interface AgentTask {
  requestId: string;
  capability: string;
  objective: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  ok: boolean;
  outcome: "success" | "timeout" | "unavailable" | "transient" | "rejected";
  summary: string;
  detail?: string | undefined;
  /** Provenance recorded by the gateway for every execution. */
  provenance: {
    agentId: string;
    kind: string;
    isMock: boolean;
    endpointRef: string | null;
    policyRef: string;
    attempt: number;
    startedAt: string;
    finishedAt: string;
    configVersion: string;
    configRevision: number;
    configSource: string;
  };
}

/**
 * Every agent — including the external JARVIS API — is reached only through this
 * adapter interface. Registering a new agent requires no bespoke routing logic.
 */
export interface AgentAdapter {
  readonly agentId: string;
  health(): Promise<HealthState>;
  execute(task: AgentTask, ctx: { timeoutMs: number }): Promise<Omit<AgentResult, "provenance">>;
}

export const AgentTaskSchema = z.object({
  requestId: z.string().min(8),
  capability: z.string().min(3),
  objective: z.string().min(4),
  payload: z.record(z.string(), z.unknown()),
});

/** Untrusted agent/external-API responses are schema validated before use. */
export const AgentResponseSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(["success", "timeout", "unavailable", "transient", "rejected"]),
  summary: z.string().min(1),
  detail: z.string().optional(),
});

/** ------------------------------------------------------ circuit breaker */
interface CircuitState {
  failures: number;
  openedAt: number | null;
}

export interface GatewayObservation {
  requestId: string;
  agentId: string;
  capability: string;
  attempts: number;
  outcome: AgentResult["outcome"];
  durationMs: number;
  at: string;
}

export class AgentGateway {
  private adapters = new Map<string, AgentAdapter>();
  private circuits = new Map<string, CircuitState>();
  private healthCache = new Map<string, HealthState>();
  private observations: GatewayObservation[] = [];
  /** Idempotency: one result per requestId. */
  private idempotency = new Map<string, AgentResult>();

  constructor(
    private readonly resolved: ResolvedConfig,
    private readonly audit: AuditSink,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Registration is generic — no per-agent branching anywhere in the gateway. */
  register(adapter: AgentAdapter): void {
    const descriptor = this.descriptor(adapter.agentId);
    this.adapters.set(descriptor.agentId, adapter);
    this.audit.record({
      actorId: "system",
      action: "gateway.register",
      subject: descriptor.agentId,
      outcome: "recorded",
      metadata: {
        kind: descriptor.kind,
        isMock: descriptor.isMock,
        capabilities: descriptor.capabilities.join(","),
        endpointRef: descriptor.endpointRef,
        credentialRef: descriptor.credentialRef,
      },
    });
  }

  descriptor(agentId: string): AgentDescriptor {
    const found = this.resolved.config.agents.find((a) => a.agentId === agentId);
    if (!found) {
      throw new KareError("config_missing", `Agent "${agentId}" is not declared in config.`, {
        agentId,
      });
    }
    return found;
  }

  /** Capability discovery for callers (e.g. KNOW Stylist AI via the public API). */
  discover(): Array<{
    capability: string;
    agents: Array<{ agentId: string; kind: string; isMock: boolean; health: HealthState }>;
  }> {
    return Object.entries(this.resolved.config.routing).map(([capability, agentIds]) => ({
      capability,
      agents: agentIds.map((agentId) => {
        const d = this.resolved.config.agents.find((a) => a.agentId === agentId);
        return {
          agentId,
          kind: d?.kind ?? "unknown",
          isMock: d?.isMock ?? true,
          health: this.healthCache.get(agentId) ?? "unknown",
        };
      }),
    }));
  }

  async refreshHealth(): Promise<Record<string, HealthState>> {
    for (const [agentId, adapter] of this.adapters) {
      try {
        this.healthCache.set(agentId, await adapter.health());
      } catch {
        this.healthCache.set(agentId, "unavailable");
      }
    }
    return Object.fromEntries(this.healthCache);
  }

  healthSnapshot(): Record<string, HealthState> {
    const snapshot: Record<string, HealthState> = {};
    for (const agent of this.resolved.config.agents) {
      snapshot[agent.agentId] = this.healthCache.get(agent.agentId) ?? "unknown";
    }
    return snapshot;
  }

  observations_(): GatewayObservation[] {
    return [...this.observations].reverse();
  }

  private authorize(descriptor: AgentDescriptor, scopes: string[]): void {
    const missing = descriptor.requiredScopes.filter((s) => !scopes.includes(s));
    if (missing.length > 0) {
      throw new KareError("unauthorized", `Missing scopes for "${descriptor.agentId}".`, {
        missing,
      });
    }
  }

  private circuit(agentId: string): CircuitState {
    let state = this.circuits.get(agentId);
    if (!state) {
      state = { failures: 0, openedAt: null };
      this.circuits.set(agentId, state);
    }
    return state;
  }

  private isCircuitOpen(agentId: string, policy: ExecutionPolicy): boolean {
    const state = this.circuit(agentId);
    if (state.openedAt === null) return false;
    if (this.now() - state.openedAt >= policy.circuit.openDurationMs) {
      state.openedAt = null;
      state.failures = 0;
      return false;
    }
    return true;
  }

  /** Health-aware selection over the configured route order. */
  private select(capability: string, policy: ExecutionPolicy): AgentDescriptor {
    const candidates = this.resolved.agentsForCapability(capability);
    const usable: AgentDescriptor[] = [];
    for (const agentId of candidates) {
      const descriptor = this.descriptor(agentId);
      if (!descriptor.enabled) continue;
      if (!this.adapters.has(agentId)) continue;
      if (this.isCircuitOpen(agentId, policy)) continue;
      const health = this.healthCache.get(agentId) ?? "unknown";
      if (health === "unavailable") continue;
      if (health === "degraded" && !policy.allowDegradedRouting) continue;
      usable.push(descriptor);
    }
    const chosen = usable[0];
    if (!chosen) {
      throw new KareError("agent_unavailable", `No healthy agent for "${capability}".`, {
        capability,
        candidates,
      });
    }
    return chosen;
  }

  async execute(input: {
    task: unknown;
    scopes: string[];
    actorId: string;
  }): Promise<AgentResult> {
    const parsed = AgentTaskSchema.safeParse(input.task);
    if (!parsed.success) {
      throw new KareError("invalid_input", "Gateway task failed schema validation.", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const task = parsed.data as AgentTask;

    const cached = this.idempotency.get(task.requestId);
    if (cached) return cached;

    await this.refreshHealth();

    // Policy is resolved from configuration, never from source constants.
    const preliminary = this.resolved.selectionPolicy(task.requestId);
    const descriptor = this.select(task.capability, preliminary);
    const policy = this.resolved.policyFor(descriptor.policyRef, task.requestId);

    this.authorize(descriptor, input.scopes);

    const adapter = this.adapters.get(descriptor.agentId)!;
    const startedAt = new Date().toISOString();
    const t0 = this.now();

    let attempt = 0;
    let last: Omit<AgentResult, "provenance"> | null = null;
    let backoff = policy.retry.initialBackoffMs;

    while (attempt < policy.retry.maxAttempts) {
      attempt += 1;
      if (this.isCircuitOpen(descriptor.agentId, policy)) {
        throw new KareError("circuit_open", `Circuit open for "${descriptor.agentId}".`, {
          agentId: descriptor.agentId,
        });
      }
      try {
        const raw = await adapter.execute(task, { timeoutMs: policy.timeoutMs });
        const validated = AgentResponseSchema.safeParse(raw);
        last = validated.success
          ? validated.data
          : {
              ok: false,
              outcome: "rejected",
              summary: "malformed agent response rejected by validation",
              detail: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
            };
      } catch (error) {
        last = {
          ok: false,
          outcome: "transient",
          summary: "adapter threw",
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      if (last.ok) {
        this.circuit(descriptor.agentId).failures = 0;
        break;
      }

      const state = this.circuit(descriptor.agentId);
      state.failures += 1;
      if (state.failures >= policy.circuit.failureThreshold) {
        state.openedAt = this.now();
      }

      const retryable = policy.retry.retryableOutcomes.includes(
        last.outcome as "timeout" | "unavailable" | "transient",
      );
      if (!retryable || attempt >= policy.retry.maxAttempts) break;
      await this.sleep(backoff);
      backoff = Math.round(backoff * policy.retry.backoffMultiplier);
    }

    const result: AgentResult = {
      ...(last ?? { ok: false, outcome: "unavailable", summary: "no attempt executed" }),
      provenance: {
        agentId: descriptor.agentId,
        kind: descriptor.kind,
        isMock: descriptor.isMock,
        endpointRef: descriptor.endpointRef,
        policyRef: descriptor.policyRef,
        attempt,
        startedAt,
        finishedAt: new Date().toISOString(),
        configVersion: this.resolved.provenance.configVersion,
        configRevision: this.resolved.provenance.revision,
        configSource: this.resolved.source,
      },
    };

    this.idempotency.set(task.requestId, result);
    this.observations.push({
      requestId: task.requestId,
      agentId: descriptor.agentId,
      capability: task.capability,
      attempts: attempt,
      outcome: result.outcome,
      durationMs: this.now() - t0,
      at: new Date().toISOString(),
    });
    this.audit.record({
      actorId: input.actorId,
      action: "gateway.execute",
      subject: `${task.capability}@${descriptor.agentId}`,
      outcome: result.ok ? "allowed" : "denied",
      metadata: {
        requestId: task.requestId,
        attempts: attempt,
        outcome: result.outcome,
        isMock: descriptor.isMock,
        policyRef: descriptor.policyRef,
      },
    });

    return result;
  }
}