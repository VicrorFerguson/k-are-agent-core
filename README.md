# K-ARE Agent Core

Create a new project named K-ARE: a standalone technical engineering and analytical agent platform. IMPORTANT ARCHITECTURE: K-ARE is NOT embedded in KNOW and must have no JARVIS source code, runtime, filesystem access, or internal implementation copied into it. JARVIS is an EXTERNAL system accessed only through a documented API. KNOW Stylist AI is a separate customer-facing system and must not directly call JARVIS; future integrations go through K-ARE's Agent Gateway.

Build K-ARE as the engineering control layer. Core loop: UNDERSTAND -> INSPECT -> PLAN -> CHANGE -> TEST -> if failure: DIAGNOSE -> CORRECT -> RETEST; otherwise VERIFY -> RECORD. Self-correction must be bounded by correction budget, risk classification, protected architectural invariants, approval gates, and rollback. Never claim PASS merely because a mechanism exists; require execution evidence.

FOUNDATION PRINCIPLES: fast capability routing; runtime orchestration; health-aware routing; request tracking; failure isolation; observability; incremental reversible changes; provenance; tests; rollback; zero operational hardcoding. Mutable operational behavior must come from versioned configuration/policy, not source constants. Architectural invariants are protected and cannot be overridden by registry configuration.

AGENT GATEWAY: central connection point for K-ARE and future agents. Use capability discovery, authorization, API connection, task execution, health status, timeout/retry policy, and provenance. JARVIS must be represented as an external API capability, not as embedded code. Design the gateway so future agents can be registered without bespoke routing logic.

CREDENTIAL GATEWAY: users may request provider/API-key connection through chat. Capture the secret securely, validate it, store it only through a dedicated secret-management abstraction, assign a dedicated environment/workspace namespace, establish the provider connection, run a health check, and create an audit record. Never expose secrets in chat history, logs, source, ordinary config, or Git. The application should store credential references/metadata rather than raw secret values. For the initial MVP, implement the abstraction and safe UX; do not pretend a real external secret manager exists if it is not configured.

RUNTIME/RESILIENCE: use queue-based or asynchronous task execution where appropriate, health-aware routing, bounded retries with configurable policy, timeouts, circuit-breaker style isolation, idempotent request IDs, structured telemetry, and graceful degradation. Do not hardcode provider IDs, endpoints, retry counts, timeouts, thresholds, model names, prompts, or business rules. Use configuration/policy interfaces and fail closed when required configuration is missing.

SECURITY: least privilege, RBAC/policy checks, strict input/schema validation, no arbitrary code execution from untrusted inputs, audit logging, secret exclusion, protected invariants, approval gates for high-risk operations, and isolated execution for code changes/tests.

UI/UX: build a polished operator console for K-ARE, not a consumer fashion storefront. Include dashboard, task intake/chat-like engineering console, active task state, agent/capability health, execution timeline, evidence/provenance, approvals, rollback status, integrations/credentials, and settings. Keep the visual system clean and professional. The future KNOW Stylist AI should be able to call K-ARE through its API without knowing internal implementation details.

PRD/DOCS: before or alongside implementation, create a versioned K-ARE PRD and architecture document inside the project that records the above boundaries, interfaces, non-goals, security requirements, routing/runtime behavior, self-correction contract, credential lifecycle, agent gateway contract, observability, testing/evidence requirements, rollback model, and explicit prohibition on embedding JARVIS into K-ARE or KNOW. Treat the PRD as a living specification. Do not invent production integrations or claim compliance without evidence.

IMPLEMENTATION STRATEGY: start with a minimal, reversible foundation. Establish domain models/interfaces, configuration/policy abstraction, task state machine, agent gateway abstraction, external JARVIS adapter interface, credential abstraction, audit/provenance model, health/routing layer, bounded self-correction orchestrator, and testable API boundaries. Use the project's native full-stack TypeScript stack. Keep secrets out of the repository. Add tests for successful routing, unavailable agent, missing configuration fail-closed, invalid input/schema rejection, bounded retry/correction, rollback state transitions, credential reference-only handling, provenance, and gateway registration. Do not implement destructive autonomous actions by default. Do not integrate JARVIS until an actual API contract/endpoint and authentication method are supplied; use a mock adapter for tests and clearly label it as mock.

ZERO-HARDCODING AUDIT: explicitly distinguish protected invariants from mutable operational values. Protected invariants may be source-level constants only where necessary for security/architecture. Everything operational must be externally configurable/versioned. Include an audit checklist and tests demonstrating this distinction.

Do not claim the system is production-ready or fully compliant until actual implementation and tests provide evidence. First build the foundation and report exactly what was implemented, what remains, and what evidence was produced.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aaf9e120-7c22-4fe8-83e8-9c05748b640f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
