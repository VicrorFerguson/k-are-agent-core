import type { AgentAdapter, AgentTask } from "../gateway";
import type { HealthState } from "../domain";

/**
 * MOCK external JARVIS adapter — LABELLED MOCK ON PURPOSE.
 *
 * No JARVIS source code, runtime, filesystem access or internal implementation
 * exists in this repository. JARVIS is an external system reachable only over a
 * documented HTTP API. Until a real API contract, endpoint and authentication
 * method are supplied, this adapter simulates the transport for tests and demos.
 */
export interface ExternalApiTransport {
  /** Endpoint comes from configuration (endpointRef), never from source. */
  call(input: {
    endpointRef: string;
    credentialRef: string | null;
    task: AgentTask;
    timeoutMs: number;
  }): Promise<{ ok: boolean; outcome: "success" | "timeout" | "unavailable" | "transient" | "rejected"; summary: string; detail?: string }>;
}

export class MockExternalAgentAdapter implements AgentAdapter {
  readonly isMock = true;

  constructor(
    public readonly agentId: string,
    private readonly endpointRef: string,
    private readonly credentialRef: string | null,
    private readonly transport: ExternalApiTransport,
    private readonly healthState: () => HealthState = () => "healthy",
  ) {}

  async health(): Promise<HealthState> {
    return this.healthState();
  }

  async execute(task: AgentTask, ctx: { timeoutMs: number }) {
    const response = await this.transport.call({
      endpointRef: this.endpointRef,
      credentialRef: this.credentialRef,
      task,
      timeoutMs: ctx.timeoutMs,
    });
    return {
      ok: response.ok,
      outcome: response.outcome,
      summary: `[MOCK ${this.agentId}] ${response.summary}`,
      detail: response.detail,
    };
  }
}

/** Deterministic in-process transport used by tests and the seeded demo console. */
export class SimulatedTransport implements ExternalApiTransport {
  constructor(
    private readonly script: Array<{
      ok: boolean;
      outcome: "success" | "timeout" | "unavailable" | "transient" | "rejected";
      summary: string;
    }> = [{ ok: true, outcome: "success", summary: "inspection completed" }],
  ) {}

  private index = 0;

  async call() {
    const step = this.script[Math.min(this.index, this.script.length - 1)]!;
    this.index += 1;
    return { ...step, detail: "simulated external API response (mock transport)" };
  }
}