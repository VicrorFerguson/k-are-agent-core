/**
 * K-ARE zero-hardcoding audit (KF-ARCH-INVARIANT-001).
 * Source-level scanner. Classifies every finding and fails the gate on VIOLATION.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Classification =
  | "PROTECTED_INVARIANT"
  | "BOOTSTRAP_REQUIREMENT"
  | "MUTABLE_CONFIGURATION"
  | "BUSINESS_POLICY"
  | "VIOLATION";

export interface Finding {
  id: string;
  file: string;
  line: number;
  snippet: string;
  rule: string;
  classification: Classification;
  remediation: string;
}

export const SCANNER = { name: "kare-zero-hardcoding-scanner", version: "1.1.0" };

const RULES: Array<{ rule: string; re: RegExp; remediation: string }> = [
  { rule: "absolute-url", re: /['"`]https?:\/\/[^'"`]+['"`]/, remediation: "move endpoint to configuration (endpointRef)" },
  { rule: "operational-numeric-assignment", re: /\b(timeoutMs|maxAttempts|retryCount|retries|initialBackoffMs|backoffMultiplier|failureThreshold|openDurationMs|halfOpenProbes|maxCorrectionAttempts|correctionBudget|ttl|ttlMs|pollIntervalMs|cacheTtl|minSecretLength|riskThreshold)\s*[=:]\s*-?\d+/, remediation: "read the value from the versioned configuration document" },
  { rule: "operational-identifier-literal", re: /\b(provider|model|modelId|endpoint|endpointRef|agentId|policyRef|credentialRef)\s*[=:]\s*['"`][^'"`]+['"`]/, remediation: "resolve the identifier through configuration/policy" },
  { rule: "semantic-threshold-comparison", re: /\b(attempt|attempts|correctionsUsed|failures|retries)\b\s*(>=|>|<|<=)\s*\d+/, remediation: "compare against a configured policy value" },
  { rule: "numeric-default-argument", re: /=\s*\(\s*\)\s*=>\s*\d+|\w+\s*(?:\?\?|\|\|)\s*\d{2,}/, remediation: "remove hidden numeric fallback; fail closed instead" },
  { rule: "operational-string-fallback", re: /(?:\?\?|\|\|)\s*['"`](?:endpoint|provider|model|policy|https?)[^'"`]*['"`]/, remediation: "remove hidden fallback; fail closed instead" },
];

/** Explicitly classified exemptions. Nothing here may be operational behaviour. */
const EXEMPTIONS: Array<{ file: RegExp; rule?: string; classification: Classification; why: string }> = [
  { file: /src\/kare\/invariants\.ts$/, classification: "PROTECTED_INVARIANT", why: "security/architecture invariants; deliberately non-overridable" },
  { file: /src\/kare\/domain\.ts$/, classification: "MUTABLE_CONFIGURATION", why: "schema bounds (zod validation), not operational values" },
  { file: /src\/kare\/config\.ts$/, rule: "operational-identifier-literal", classification: "BOOTSTRAP_REQUIREMENT", why: "supported config schema versions; required to interpret the document" },
  { file: /src\/kare\/runtime\.ts$/, rule: "operational-identifier-literal", classification: "BOOTSTRAP_REQUIREMENT", why: "configuration document location only" },
  { file: /__tests__|\.test\.ts$/, classification: "MUTABLE_CONFIGURATION", why: "test fixtures are supplied as configuration documents, never runtime defaults" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

export function runAudit(roots: string[] = ["src/kare", "src/routes", "scripts"]) {
  const files = roots.flatMap((r) => {
    try {
      return walk(r);
    } catch {
      return [];
    }
  });
  const findings: Finding[] = [];
  let n = 0;
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      const line = text.trim();
      if (line.startsWith("*") || line.startsWith("//")) return;
      for (const { rule, re, remediation } of RULES) {
        if (!re.test(line)) continue;
        const exemption = EXEMPTIONS.find(
          (e) => e.file.test(file) && (e.rule === undefined || e.rule === rule),
        );
        findings.push({
          id: `ZH-${String(++n).padStart(3, "0")}`,
          file,
          line: i + 1,
          snippet: line.slice(0, 160),
          rule,
          classification: exemption ? exemption.classification : "VIOLATION",
          remediation: exemption ? `exempt: ${exemption.why}` : remediation,
        });
      }
    });
  }
  const violations = findings.filter((f) => f.classification === "VIOLATION");
  return {
    auditId: `zh-audit-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    invariant: "KF-ARCH-INVARIANT-001",
    scanner: SCANNER,
    scope: roots,
    filesScanned: files.length,
    findings,
    violationCount: violations.length,
    status: violations.length === 0 ? "PASS" : "BLOCKED",
  } as const;
}

export function writeArtifacts(result: ReturnType<typeof runAudit>) {
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/zero-hardcoding-audit.json", JSON.stringify(result, null, 2) + "\n");
  const rows = result.findings
    .map((f) => `| ${f.id} | \`${f.file}:${f.line}\` | ${f.rule} | ${f.classification} | ${f.remediation} |`)
    .join("\n");
  writeFileSync(
    "docs/zero-hardcoding-audit.md",
    `# K-ARE Zero-Hardcoding Audit (KF-ARCH-INVARIANT-001)

- Audit ID: \`${result.auditId}\`
- Executed: ${result.timestamp}
- Scanner: ${result.scanner.name} v${result.scanner.version}
- Scope: ${result.scope.join(", ")} (${result.filesScanned} files)
- Findings: ${result.findings.length} · Violations: ${result.violationCount}
- **Status: ${result.status}**

## Classification rule

\`PROTECTED_INVARIANT\` and \`BOOTSTRAP_REQUIREMENT\` may remain in source. Every
\`MUTABLE_CONFIGURATION\` / \`BUSINESS_POLICY\` value must be read from the versioned
configuration document through the configuration authority (\`src/kare/config.ts\`),
which fails closed when the document is missing or invalid.

## Remediations applied in this pass

| Removed source default | Now resolved from |
| --- | --- |
| \`policies[0].policyRef\` as implicit selection policy | \`defaults.selectionPolicyRef\` |
| \`endpointRef ?? "endpoint.local"\` | \`agents[].endpointRef\` (fail closed when null) |
| mock transport default success script | \`simulation.agents[id].script\` |
| mock adapter default health \`"healthy"\` | \`simulation.agents[id].health\` |
| credential validator minimum length \`8\` | \`credentials.minSecretLength\` |
| implicit namespace acceptance | \`credentials.allowedNamespaces\` |

## Findings

| ID | Location | Rule | Classification | Remediation / exemption |
| --- | --- | --- | --- | --- |
${rows || "| — | — | — | — | no findings |"}
`,
  );
}

if (process.argv[1]?.includes("zero-hardcoding-audit")) {
  const result = runAudit();
  writeArtifacts(result);
  console.log(`zero-hardcoding audit: ${result.status} (violations=${result.violationCount})`);
  if (result.status !== "PASS") {
    for (const f of result.findings.filter((x) => x.classification === "VIOLATION")) {
      console.log(` VIOLATION ${f.file}:${f.line} [${f.rule}] ${f.snippet}`);
    }
    process.exitCode = 1;
  }
}
