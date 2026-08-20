# K-ARE Zero-Hardcoding Audit (KF-ARCH-INVARIANT-001)

- Audit ID: `zh-audit-mt11o9a2`
- Executed: 2026-08-20T04:52:55.418Z
- Scanner: kare-zero-hardcoding-scanner v1.1.0
- Scope: src/kare, src/lib, src/routes, scripts (26 files)
- Findings: 8 · Violations: 1
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
| ZH-001 | `src/kare/__tests__/config.test.ts:70` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-002 | `src/kare/__tests__/credentials.test.ts:16` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-003 | `src/kare/__tests__/credentials.test.ts:22` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-004 | `src/kare/__tests__/credentials.test.ts:55` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-005 | `src/kare/__tests__/credentials.test.ts:76` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-006 | `src/kare/__tests__/gateway.test.ts:125` | operational-identifier-literal | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-007 | `src/kare/__tests__/orchestrator.test.ts:132` | operational-numeric-assignment | MUTABLE_CONFIGURATION | exempt: test fixtures are supplied as configuration documents, never runtime defaults |
| ZH-008 | `src/routes/index.tsx:19` | absolute-url | VIOLATION | move endpoint to configuration (endpointRef) |
