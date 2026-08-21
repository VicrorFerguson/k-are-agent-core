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
## 12. Slice 1 implemented architecture (living spec update)
The following clarifications reflect what Slice 1 actually implements; see
`docs/KARE-ARCHITECTURE.md` for detail and `evidence/kare-slice1-verification.md`
for the executed evidence.

- **Configuration is the control plane.** `config/kare.config.json` carries
  `configVersion` (`kare-config/vN`), `revision`, and a `provenance` block
  (`source`, `publishedAt`, `publishedBy`, `immutable: true`). It is deep-frozen at
  resolve time: a published document is immutable and any change requires a new
  revision. All runtime reads go through `resolveConfig` — application code never
  imports the document as a static object of behaviour.
- **Provenance ledger.** Every configuration consumption records config version,
  revision, source, key, policyRef, timestamp and the task/request reference.
- **Externalised in this slice.** Selection policy (`defaults.selectionPolicyRef`),
  agent endpoints (`agents[].endpointRef`, fail closed when null), credential policy
  (`credentials.minSecretLength`, `credentials.allowedNamespaces`), API-boundary
  identity/scopes (`apiBoundary`), and mock-agent behaviour (`simulation.agents`).
  No source-level operational default replaced them.
- **Bootstrap exception.** Only the supported configuration schema versions and the
  document location remain in source.
- **Untrusted responses.** Agent/external-API responses are schema validated; a
  malformed response is recorded as `rejected` and cannot be read as success.
- **API boundary.** Typed server functions in `src/lib/kare.functions.ts`: status,
  task submit/get, approval decision, agent health, evidence, audit. Inputs are
  schema validated; scopes come from configuration, not from the caller; no secret
  or secret-manager value is exposed.
- **Operator console.** `/` renders the K-ARE operator console (status, tasks, state,
  agent health, capabilities/routing, timeline, evidence, provenance, correction
  budget, approvals, rollback, audit). Runtime logic stays out of React components.
- **Status discipline.** Slice 1 is `IMPLEMENTED` plus the specific `VERIFIED` claims
  backed by artifacts in `evidence/`. Nothing here claims production readiness,
  compliance, persistence, a real secret vault, or JARVIS connectivity.
