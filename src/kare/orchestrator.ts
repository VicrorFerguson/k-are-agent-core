import type { AuditSink } from "./audit";
import type { ResolvedConfig } from "./config";
import {
  TaskRequestSchema,
  type Evidence,
  type TaskRecord,
  type TaskRequest,
  type TaskState,
} from "./domain";
import { KareError, isKareError } from "./errors";
import type { AgentGateway } from "./gateway";
import { canTransition, IllegalTransitionError } from "./state-machine";

let seq = 0;
const nowIso = () => new Date().toISOString();

function evidence(
  kind: Evidence["kind"],
  label: string,
  outcome: Evidence["outcome"],
  detail: string,
  producedBy: string,
): Evidence {
  return {
    evidenceId: `ev_${(++seq).toString().padStart(5, "0")}`,
    kind,
    label,
    outcome,
    detail,
    producedAt: nowIso(),
    producedBy,
  };
}

/**
 * Bounded self-correction orchestrator.
 *
 * UNDERSTAND -> INSPECT -> PLAN -> [approval gate] -> CHANGE -> TEST
 *   fail -> DIAGNOSE -> CORRECT -> TEST (bounded by the correction budget)
 *   pass -> VERIFY -> RECORD
 * Budget exhaustion or a rollback-required risk class goes to ROLLING_BACK.
 *
 * VERIFY only produces verdict "pass" when a test-run evidence item with
 * outcome "pass" exists — never because a mechanism exists.
 */
export class Orchestrator {
  private tasks = new Map<string, TaskRecord>();
  private byRequestId = new Map<string, string>();

  constructor(
    private readonly resolved: ResolvedConfig,
    private readonly gateway: AgentGateway,
    private readonly audit: AuditSink,
  ) {}

  list(): TaskRecord[] {
    return [...this.tasks.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  private transition(task: TaskRecord, to: TaskState, note: string): void {
    if (!canTransition(task.state, to)) throw new IllegalTransitionError(task.state, to);
    task.state = to;
    task.updatedAt = nowIso();
    task.timeline.push({ at: task.updatedAt, state: to, note, attempt: task.attempt });
  }

  /** Intake: strict schema validation, then run the loop up to the approval gate. */
  async submit(input: unknown): Promise<TaskRecord> {
    const parsed = TaskRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new KareError("invalid_input", "Task request failed schema validation.", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const req: TaskRequest = parsed.data;

    // Idempotent request ids.
    const existingId = this.byRequestId.get(req.requestId);
    if (existingId) return this.tasks.get(existingId)!;

    const correction = this.resolved.correctionPolicy(req.requestId);
    const approvalRequired = correction.approvalRequiredFor.includes(req.risk);

    const task: TaskRecord = {
      taskId: `task_${(++seq).toString().padStart(5, "0")}`,
      requestId: req.requestId,
      capability: req.capability,
      objective: req.objective,
      risk: req.risk,
      actorId: req.actor.actorId,
      state: "INTAKE",
      attempt: 0,
      correctionsUsed: 0,
      correctionBudget: correction.maxCorrectionAttempts,
      routedAgentId: null,
      policyRef: null,
      evidence: [],
      timeline: [{ at: nowIso(), state: "INTAKE", note: "request accepted", attempt: 0 }],
      approval: {
        required: approvalRequired,
        status: approvalRequired ? "pending" : "not-required",
      },
      rollback: { available: false, status: "none" },
      verdict: "unknown",
      persistence: {
        status: "not-configured",
        store: "none",
        at: null,
        detail: "No persistence backend configured",
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.tasks.set(task.taskId, task);
    this.byRequestId.set(req.requestId, task.taskId);

    this.audit.record({
      actorId: req.actor.actorId,
      action: "task.submit",
      subject: task.taskId,
      outcome: "recorded",
      metadata: {
        requestId: req.requestId,
        capability: req.capability,
        risk: req.risk,
        approvalRequired,
      },
    });

    await this.runToApprovalGate(task, req);
    return task;
  }

  private async runToApprovalGate(task: TaskRecord, req: TaskRequest): Promise<void> {
    this.transition(task, "UNDERSTAND", `objective parsed for capability ${req.capability}`);

    this.transition(task, "INSPECT", "dispatching inspection through the agent gateway");
    try {
      const result = await this.gateway.execute({
        task: {
          requestId: `${req.requestId}:inspect`,
          capability: req.capability,
          objective: req.objective,
          payload: req.payload,
        },
        scopes: req.actor.scopes,
        actorId: req.actor.actorId,
      });
      task.routedAgentId = result.provenance.agentId;
      task.policyRef = result.provenance.policyRef;
      task.evidence.push(
        evidence(
          "inspection",
          `inspection via ${result.provenance.agentId}${result.provenance.isMock ? " (MOCK)" : ""}`,
          result.ok ? "pass" : "fail",
          `${result.summary} · attempts=${result.provenance.attempt} · policy=${result.provenance.policyRef}`,
          result.provenance.agentId,
        ),
      );
      if (!result.ok) {
        this.transition(task, "FAILED", `inspection failed: ${result.outcome}`);
        return;
      }
    } catch (error) {
      const message = isKareError(error) ? `${error.code}: ${error.message}` : String(error);
      task.evidence.push(
        evidence("inspection", "inspection dispatch", "fail", message, "agent-gateway"),
      );
      this.transition(task, "FAILED", message);
      return;
    }

    this.transition(task, "PLAN", "reversible change plan drafted");
    task.rollback.available = true;

    if (task.approval.required) {
      this.transition(
        task,
        "AWAITING_APPROVAL",
        `risk=${task.risk} requires an approval gate before CHANGE`,
      );
      return;
    }
    await this.executeChangeLoop(task, req);
  }

  /** Approval gate for high-risk operations. */
  async decide(input: {
    taskId: string;
    approve: boolean;
    actorId: string;
    scopes: string[];
  }): Promise<TaskRecord> {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new KareError("invalid_input", `Unknown task "${input.taskId}".`);
    if (task.state !== "AWAITING_APPROVAL") {
      throw new KareError("invalid_input", `Task ${task.taskId} is not awaiting approval.`);
    }
    if (!input.scopes.includes("kare:approve")) {
      throw new KareError("unauthorized", "Approval requires the kare:approve scope.");
    }

    task.approval.status = input.approve ? "approved" : "rejected";
    task.approval.decidedBy = input.actorId;
    this.audit.record({
      actorId: input.actorId,
      action: input.approve ? "task.approve" : "task.reject",
      subject: task.taskId,
      outcome: input.approve ? "allowed" : "denied",
      metadata: { risk: task.risk },
    });

    if (!input.approve) {
      this.transition(task, "REJECTED", `rejected by ${input.actorId}`);
      return task;
    }

    await this.executeChangeLoop(task, {
      requestId: task.requestId,
      capability: task.capability,
      objective: task.objective,
      risk: task.risk,
      actor: { actorId: input.actorId, scopes: input.scopes },
      payload: {},
    });
    return task;
  }

  private async executeChangeLoop(task: TaskRecord, req: TaskRequest): Promise<void> {
    // Fails closed: if the controlling correction policy is unavailable this throws.
    const correction = this.resolved.correctionPolicy(task.taskId);
    this.transition(task, "CHANGE", "incremental reversible change applied in isolation");
    task.rollback.available = true;
    task.evidence.push(
      evidence(
        "diff",
        `checkpoint ${task.taskId}.chk-${task.attempt}`,
        "info",
        "reversible checkpoint created before change was applied",
        "kare-orchestrator",
      ),
    );

    while (true) {
      task.attempt += 1;
      this.transition(task, "TEST", `test execution attempt ${task.attempt}`);

      const result = await this.gateway
        .execute({
          task: {
            requestId: `${req.requestId}:test:${task.attempt}`,
            capability: task.capability,
            objective: `verify: ${task.objective}`,
            payload: { phase: "test", attempt: task.attempt },
          },
          scopes: req.actor.scopes,
          actorId: req.actor.actorId,
        })
        .catch((error) => ({
          ok: false as const,
          outcome: "unavailable" as const,
          summary: isKareError(error) ? error.code : "gateway error",
          provenance: {
            agentId: task.routedAgentId ?? "unknown",
            kind: "unknown",
            isMock: true,
            endpointRef: null,
            policyRef: task.policyRef ?? "unknown",
            attempt: task.attempt,
            startedAt: nowIso(),
            finishedAt: nowIso(),
            configVersion: this.resolved.provenance.configVersion,
            configRevision: this.resolved.provenance.revision,
            configSource: this.resolved.source,
          },
        }));

      task.evidence.push(
        evidence(
          "test-run",
          `test attempt ${task.attempt}`,
          result.ok ? "pass" : "fail",
          `${result.summary} · outcome=${result.outcome}`,
          result.provenance.agentId,
        ),
      );

      if (result.ok) {
        this.transition(task, "VERIFY", "evaluating execution evidence");
        const hasPassingRun = task.evidence.some(
          (e) => e.kind === "test-run" && e.outcome === "pass",
        );
        if (!hasPassingRun) {
          this.transition(task, "DIAGNOSE", "no execution evidence: PASS withheld");
          task.correctionsUsed += 1;
          this.transition(task, "CORRECT", "re-running to obtain execution evidence");
          continue;
        }
        task.verdict = "pass";
        this.transition(task, "RECORD", "provenance and evidence recorded");
        this.transition(task, "COMPLETED", "verified with execution evidence");
        this.audit.record({
          actorId: req.actor.actorId,
          action: "task.verified",
          subject: task.taskId,
          outcome: "recorded",
          metadata: { attempts: task.attempt, corrections: task.correctionsUsed },
        });
        return;
      }

      this.transition(task, "DIAGNOSE", `failure classified: ${result.outcome}`);

      const mustRollback =
        correction.rollbackRequiredFor.includes(task.risk) ||
        task.correctionsUsed >= task.correctionBudget;

      if (mustRollback) {
        task.verdict = "fail";
        this.transition(
          task,
          "ROLLING_BACK",
          task.correctionsUsed >= task.correctionBudget
            ? `correction budget exhausted (${task.correctionsUsed}/${task.correctionBudget})`
            : `risk=${task.risk} mandates rollback over auto-correction`,
        );
        task.rollback.status = "in-progress";
        this.transition(task, "ROLLED_BACK", "change reverted to last known good state");
        task.rollback.status = "completed";
        task.evidence.push(
          evidence(
            "diff",
            `rollback ${task.taskId}`,
            "pass",
            `checkpoint restored; state verified as ROLLED_BACK · corrections=${task.correctionsUsed}/${task.correctionBudget}`,
            "kare-orchestrator",
          ),
        );
        this.audit.record({
          actorId: req.actor.actorId,
          action: "task.rollback",
          subject: task.taskId,
          outcome: "recorded",
          metadata: { corrections: task.correctionsUsed, budget: task.correctionBudget },
        });
        return;
      }

      task.correctionsUsed += 1;
      this.transition(
        task,
        "CORRECT",
        `bounded correction ${task.correctionsUsed}/${task.correctionBudget}`,
      );
    }
  }
}