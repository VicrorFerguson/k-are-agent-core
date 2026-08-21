# K-ARE Architecture (Slice 1)

Version: 1.0 · Status of the implementation described here: see
`evidence/kare-slice1-verification.md`.

## 1. System boundary

K-ARE is a standalone engineering and analytical control layer. It is not embedded in
KNOW Stylist AI and contains no JARVIS source, runtime or filesystem access.

```text
  KNOW Stylist AI ──▶ K-ARE API boundary ──▶ Agent Gateway ──▶ adapter ──▶ external JARVIS API
        (customer-facing)     (schema-validated)   (routing/policy)   (mock today)
        KNOW ─╳──▶ JARVIS   (forbidden: no direct connection, ever)
```

- `src/lib/kare.functions.ts` — the only server/API boundary (typed server functions).
- `src/kare/*` — runtime core. No React component holds runtime logic.
- `config/kare.config.json` — the versioned configuration document (the control plane).

## 2. KF-ARCH-INVARIANT-001 — zero hardcoding

Mutable operational behaviour must not live in source. Enforcement is threefold:

1. `src/kare/invariants.ts` holds only protected architectural invariants.
2. `scripts/zero-hardcoding-audit.ts` scans source, classifies every finding as
   `PROTECTED_INVARIANT | BOOTSTRAP_REQUIREMENT | MUTABLE_CONFIGURATION | BUSINESS_POLICY | VIOLATION`
   and exits non-zero on any `VIOLATION`.
3. `src/kare/__tests__/zero-hardcoding.test.ts` executes that audit inside the test suite,
   so a re-introduced hardcode fails the gate.

Artifacts: `docs/zero-hardcoding-audit.md`, `docs/zero-hardcoding-audit.json`.

## 3. Bootstrap

Source is allowed to know exactly two things:

- which configuration schema versions this build can interpret
  (`SUPPORTED_CONFIG_VERSIONS` in `src/kare/config.ts`), and
- where the configuration document comes from (`defaultConfigProvider()` in
  `src/kare/runtime.ts`).

Everything else — endpoints, timeouts, retries, backoff, circuit thresholds, correction
budget, approval/rollback risk classes, routing order, credential policy, API-boundary
identity, and even the mock transport's simulated behaviour — is read from the document.

## 4. Configuration authority and policy

`resolveConfig(provider)`:

- fails closed when the document is absent, non-object, schema-invalid, of an
  unsupported `configVersion`, or missing provenance;
- rejects any document key that shadows a protected invariant;
- checks referential integrity (agent→policy, routing→agent, `defaults.selectionPolicyRef`);
- deep-freezes the document (immutable once published — change = new `revision`);
- records a `ConfigConsumption` (config version, revision, source, key, policyRef,
  timestamp, task/request ref) on every runtime read.

Policies: `ExecutionPolicy` (timeout, retry, circuit, degraded routing) and
`CorrectionPolicy` (correction budget, approval risk classes, rollback risk classes,
destructive-action switch, default `false`).

## 5. Agent Gateway

`src/kare/gateway.ts`: generic `register(adapter)` (no per-agent branching),
capability discovery, scope authorization, health-aware selection over the configured
route order, configured bounded retry with multiplicative backoff, circuit breaker,
per-`requestId` idempotency, structured observations, audit on registration and
execution, and provenance on every result (agent, kind, isMock, endpointRef, policyRef,
attempt, timestamps, config version/revision/source).

Untrusted adapter/external-API responses are schema validated
(`AgentResponseSchema`); a malformed response becomes an explicit `rejected` failure
and can never be interpreted as success.

## 6. JARVIS boundary

`src/kare/adapters/jarvis-mock.ts` is a labelled mock transport contract only. There is
no JARVIS implementation, runtime, filesystem access, live endpoint or credential in this
repository. Endpoints are references (`endpoint.jarvis.primary`), never URLs.

Status: **JARVIS INTEGRATION = MOCK / EXTERNAL ADAPTER CONTRACT ONLY.**

## 7. KNOW Stylist boundary

KNOW may call the K-ARE API boundary only, and never JARVIS. K-ARE exposes capabilities,
task state, evidence and audit — never internal implementation, secrets or execution
primitives.

## 8. Credentials

`CredentialGateway` validates the request, enforces the configured namespace allow-list
and minimum secret length, hands the raw value to a `SecretManager` abstraction, and
stores only a reference plus metadata (provider, label, namespace, non-reversible
fingerprint, manager kind, ephemerality, health, timestamps). Audit metadata is redacted
for secret-like keys. The MVP manager is explicitly `ephemeral-in-process (MVP, not a
secret vault)` — no external secret manager is claimed.

## 9. Runtime, correction, approval, rollback

Core loop: `INTAKE → UNDERSTAND → INSPECT → PLAN → [AWAITING_APPROVAL] → CHANGE → TEST`,
then `VERIFY → RECORD → COMPLETED` on passing execution evidence, or
`DIAGNOSE → CORRECT → TEST` bounded by the configured correction budget, else
`ROLLING_BACK → ROLLED_BACK`. Transitions are enforced by an explicit table
(`state-machine.ts`); illegal transitions throw.

- Approval: risk classes in `correction.approvalRequiredFor` stop before CHANGE and
  require the `kare:approve` scope.
- Correction: bounded by `correction.maxCorrectionAttempts`; the policy is read through
  the configuration authority, so an unavailable policy fails closed.
- Rollback: a checkpoint evidence item is recorded before the change; rollback records
  restore-verified evidence plus an audit event.
- `VERIFY` only yields `verdict: "pass"` when a `test-run` evidence item with outcome
  `pass` exists.

## 10. Security posture

Least privilege via required scopes; strict Zod validation at every boundary (task
intake, gateway task, agent response, credential request, API inputs); no
`eval`/`new Function`/`child_process`/filesystem execution in runtime source; audit
logging with redaction; secrets by reference only; protected invariants
non-overridable; destructive autonomy disabled by default; the API boundary acts with
the configured operator identity rather than caller-supplied scopes.

## 11. Audit, evidence, provenance, testing

Audit: append-only in-memory sink with redaction (`InMemoryAuditSink`).
Evidence: typed items (inspection, test-run, diff/checkpoint, health-probe, audit) with
producer and timestamp. Provenance: configuration consumption ledger plus per-execution
gateway provenance. Testing: `bun run test` (Vitest) covers configuration, gateway,
runtime loop, credentials, JARVIS/security boundary and the zero-hardcoding audit,
including failure injection for every fail-closed path.

## 12. Known limitations (Slice 1)

In-memory audit/task/credential stores (no persistence), ephemeral secret manager, mock
agents only, no authentication/RBAC on the HTTP surface beyond the configured operator
identity, and change/test execution is simulated rather than performed in a real isolated
sandbox.
