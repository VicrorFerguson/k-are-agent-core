# K-ARE Zero-Hardcoding Audit (KF-ARCH-INVARIANT-001)

- Audit ID: `zh-audit-mt0jigvz`
- Executed: 2026-08-19T20:24:32.255Z
- Scanner: kare-zero-hardcoding-scanner v1.1.0
- Scope: src/kare, src/routes, scripts (14 files)
- Findings: 3 · Violations: 3
- **Status: BLOCKED**

## Classification rule

`PROTECTED_INVARIANT` and `BOOTSTRAP_REQUIREMENT` may remain in source. Every
`MUTABLE_CONFIGURATION` / `BUSINESS_POLICY` value must be read from the versioned
configuration document through the configuration authority (`src/kare/config.ts`),
which fails closed when the document is missing or invalid.

## Remediations applied in this pass

| Removed source default | Now resolved from |
| --- | --- |
| `policies[0].policyRef` as implicit selection policy | `defaults.selectionPolicyRef` |
| `endpointRef ?? "endpoint.local"` | `agents[].endpointRef` (fail closed when null) |
| mock transport default success script | `simulation.agents[id].script` |
| mock adapter default health `"healthy"` | `simulation.agents[id].health` |
| credential validator minimum length `8` | `credentials.minSecretLength` |
| implicit namespace acceptance | `credentials.allowedNamespaces` |

## Findings

| ID | Location | Rule | Classification | Remediation / exemption |
| --- | --- | --- | --- | --- |
| ZH-001 | `src/kare/credentials.ts:133` | operational-identifier-literal | VIOLATION | resolve the identifier through configuration/policy |
| ZH-002 | `src/routes/index.tsx:19` | absolute-url | VIOLATION | move endpoint to configuration (endpointRef) |
| ZH-003 | `scripts/zero-hardcoding-audit.ts:129` | operational-string-fallback | VIOLATION | remove hidden fallback; fail closed instead |
