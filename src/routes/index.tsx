import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getKareStatus, submitKareTask, decideKareTask } from "@/lib/kare.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "K-ARE Operator Console — Engineering Control Layer" },
      {
        name: "description",
        content:
          "K-ARE operator console: task state, agent health, capability routing, evidence, provenance, approvals, correction budget and rollback status.",
      },
      { property: "og:title", content: "K-ARE Operator Console" },
      {
        property: "og:description",
        content:
          "Operate the K-ARE engineering control layer: routing, evidence, provenance, approvals and rollback.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => getKareStatus(),
  component: Console,
});

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    ok: "bg-primary/10 text-primary",
    warn: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${tones[tone] ?? tones["muted"]}`}>
      {children}
    </span>
  );
}

const failStates = ["FAILED", "REJECTED", "ROLLED_BACK"];

function Console() {
  const status = Route.useLoaderData();
  const router = useRouter();
  const [objective, setObjective] = useState("");
  const [risk, setRisk] = useState<"low" | "medium" | "high" | "critical">("low");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const tasks = status.tasks;
  const active = tasks.find((t) => t.taskId === (selected ?? tasks[0]?.taskId)) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const task = await submitKareTask({
        data: {
          requestId: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          capability: "engineering.inspect",
          objective,
          risk,
        },
      });
      setSelected(task.taskId);
      setObjective("");
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(taskId: string, approve: boolean) {
    setBusy(true);
    try {
      await decideKareTask({ data: { taskId, approve } });
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="font-mono text-lg font-semibold tracking-tight">K-ARE Operator Console</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Engineering control layer · {status.invariantId} · config{" "}
          <span className="font-mono">
            {status.provenance.configVersion} r{status.provenance.revision}
          </span>{" "}
          from <span className="font-mono">{status.source}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          JARVIS integration: <Tag tone="warn">{status.jarvisIntegration}</Tag>
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Panel title="Task intake">
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Describe the engineering objective…"
              className="w-full rounded border border-input bg-background p-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value as typeof risk)}
                className="rounded border border-input bg-background p-1.5 text-xs"
              >
                {["low", "medium", "high", "critical"].map((r) => (
                  <option key={r} value={r}>
                    risk: {r}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || objective.trim().length < 4}
                onClick={submit}
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                Submit task
              </button>
            </div>
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </Panel>

          <Panel title="Agent health">
            <ul className="space-y-1 text-xs">
              {Object.entries(status.health).map(([agentId, health]) => (
                <li key={agentId} className="flex justify-between">
                  <span className="font-mono">{agentId}</span>
                  <Tag tone={health === "healthy" ? "ok" : health === "unknown" ? "muted" : "warn"}>
                    {health}
                  </Tag>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Capabilities & routing">
            <ul className="space-y-2 text-xs">
              {status.capabilities.map((c) => (
                <li key={c.capability}>
                  <div className="font-mono">{c.capability}</div>
                  <div className="text-muted-foreground">
                    {c.agents.map((a) => `${a.agentId}${a.isMock ? " (mock)" : ""}`).join(" → ")}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Panel title="Tasks">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks submitted yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {tasks.map((t) => (
                  <li key={t.taskId}>
                    <button
                      onClick={() => setSelected(t.taskId)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
                        active?.taskId === t.taskId ? "bg-muted" : "hover:bg-muted/60"
                      }`}
                    >
                      <span className="truncate">
                        <span className="font-mono text-[11px]">{t.taskId}</span> · {t.objective}
                      </span>
                      <Tag
                        tone={
                          t.state === "COMPLETED"
                            ? "ok"
                            : failStates.includes(t.state)
                              ? "warn"
                              : "muted"
                        }
                      >
                        {t.state}
                      </Tag>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {active ? (
            <>
              <Panel title={`Active task · ${active.taskId}`}>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    state <Tag>{active.state}</Tag> verdict <Tag>{active.verdict}</Tag>
                  </div>
                  <div>
                    routed <Tag>{active.routedAgentId ?? "—"}</Tag> policy{" "}
                    <Tag>{active.policyRef ?? "—"}</Tag>
                  </div>
                  <div>
                    correction{" "}
                    <Tag>
                      {active.correctionsUsed}/{active.correctionBudget}
                    </Tag>
                  </div>
                  <div>
                    rollback <Tag>{active.rollback.status}</Tag> approval{" "}
                    <Tag>{active.approval.status}</Tag>
                  </div>
                </div>
                {active.state === "AWAITING_APPROVAL" ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => decide(active.taskId, true)}
                      className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => decide(active.taskId, false)}
                      className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </Panel>

              <Panel title="Execution timeline">
                <ol className="space-y-1 font-mono text-[11px]">
                  {active.timeline.map((entry, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">{entry.at.slice(11, 19)}</span>
                      <span className="w-36">{entry.state}</span>
                      <span className="text-muted-foreground">{entry.note}</span>
                    </li>
                  ))}
                </ol>
              </Panel>

              <Panel title="Evidence & provenance">
                <ul className="space-y-1 text-[11px]">
                  {active.evidence.map((e) => (
                    <li key={e.evidenceId} className="flex gap-2">
                      <Tag tone={e.outcome === "pass" ? "ok" : e.outcome === "fail" ? "warn" : "muted"}>
                        {e.outcome}
                      </Tag>
                      <span className="font-mono">{e.kind}</span>
                      <span className="text-muted-foreground">
                        {e.label} · {e.detail} · by {e.producedBy}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : null}

          <Panel title="Configuration provenance (runtime consumption)">
            <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {status.configConsumptions.map((c, i) => (
                <li key={i}>
                  {c.at.slice(11, 19)} · {c.key} · {c.policyRef ?? "—"} · {c.configVersion} r
                  {c.revision} · ref {c.ref ?? "—"}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Audit log">
            <ul className="space-y-1 font-mono text-[11px]">
              {status.audit.map((a) => (
                <li key={a.auditId} className="flex gap-2">
                  <span className="text-muted-foreground">{a.at.slice(11, 19)}</span>
                  <span className="w-40">{a.action}</span>
                  <Tag tone={a.outcome === "denied" ? "warn" : "muted"}>{a.outcome}</Tag>
                  <span className="truncate text-muted-foreground">{a.subject}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}
