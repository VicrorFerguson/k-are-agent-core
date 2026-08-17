# K-ARE — Product Requirements Document (living spec)

- Document version: 0.1.0 (foundation)
- Status: FOUNDATION ONLY. Not production-ready. No compliance claimed.

## 1. Purpose
K-ARE is a standalone technical engineering and analytical agent platform: the
engineering control layer that plans, executes, tests, self-corrects (within
bounds) and records verifiable evidence for engineering tasks.

## 2. Hard architectural boundaries (non-negotiable)
- K-ARE is **not** embedded in KNOW.
- **No JARVIS source code, runtime, filesystem access or internal implementation
  may exist in this repository.** JARVIS is an EXTERNAL system reached only via a
  documented API through an adapter.
- KNOW Stylist AI is a separate customer-facing system and must **never** call
  JARVIS directly. Future integrations go through the K-ARE Agent Gateway API.
- Until a real JARVIS API contract, endpoint and auth method are supplied, only a
  clearly labelled **mock** adapter exists (`src/kare/adapters/jarvis-mock.ts`).

## 3. Non-goals (this phase)
Real JARVIS integration; external secret manager; durable persistence; destructive
autonomous actions; multi-tenant RBAC directory; production hardening.

## 4. Foundation principles
Fast capability routing · runtime orchestration · health-aware routing · request
tracking (idempotent request ids) · failure isolation (circuit breaker) ·
observability · incremental reversible changes · provenance · tests · rollback ·
zero operational hardcoding.

## 5. Self-correction contract
`UNDERSTAND -> INSPECT -> PLAN -> [approval gate] -> CHANGE -> TEST`; on failure
`DIAGNOSE -> CORRECT -> RETEST`; on success `VERIFY -> RECORD`.
Bounded by: correction budget, risk classification, protected invariants,
approval gates, rollback. **PASS is never claimed because a mechanism exists** —
`VERIFY` requires a `test-run` evidence item with outcome `pass`.

## 6. Agent Gateway contract
Capability discovery, scope authorization, adapter-based API connection, task
execution, health status, configured timeout/retry policy, circuit isolation,
idempotency and provenance. Registration is generic: adding an agent means adding
a config entry plus an adapter — no bespoke routing logic.

## 7. Credential lifecycle
Chat/console request -> schema validation -> validation hook -> store value only
through the `SecretManager` abstraction under a dedicated namespace -> app stores
**reference + metadata + fingerprint only** -> health check -> audit record.
Secrets never appear in chat history, logs, telemetry, source, config or Git.
MVP uses an explicitly labelled ephemeral in-process manager; no external secret
manager is configured and none is pretended.

## 8. Security requirements
Least privilege scopes, policy checks before execution, strict zod validation at
every boundary, no arbitrary code execution from untrusted input, audit logging
with redaction, protected invariants, approval gates for high risk, isolated
execution for change/test work.

## 9. Observability
Structured audit entries, gateway observations (attempts, outcome, duration),
per-task timeline, evidence ledger with provenance, health snapshots.

## 10. Rollback model
Every plan must be reversible. Budget exhaustion or a rollback-required risk
class drives `ROLLING_BACK -> ROLLED_BACK` with an audit record.

## 11. Evidence requirements
No claim of PASS, readiness or compliance without recorded execution evidence.