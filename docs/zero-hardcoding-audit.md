# K-ARE Zero-Hardcoding Audit (KF-ARCH-INVARIANT-001)

- Audit ID: `zh-audit-musiv64o`
- Executed: 2026-10-03T15:03:40.488Z
- Scanner: kare-zero-hardcoding-scanner v1.1.0
- Scope: src/kare, src/lib, src/routes, scripts (34 files)
- Findings: 7 · Violations: 0
- **Status: PASS**

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
| ZH-001 | `src/kare/__tests__/config.test.ts:70` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-002 | `src/kare/__tests__/credentials.test.ts:20` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-003 | `src/kare/__tests__/credentials.test.ts:26` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-004 | `src/kare/__tests__/credentials.test.ts:59` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-005 | `src/kare/__tests__/credentials.test.ts:80` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-006 | `src/kare/__tests__/gateway.test.ts:152` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-007 | `src/kare/__tests__/orchestrator.test.ts:123` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
