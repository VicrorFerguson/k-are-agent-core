-- K-ARE Slice 1.1 persistence (additive)
CREATE TABLE public.kare_config_versions (
  config_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (config_version, revision)
);

CREATE TABLE public.kare_tasks (
  task_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  capability TEXT NOT NULL,
  objective TEXT NOT NULL,
  risk TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  corrections_used INTEGER NOT NULL DEFAULT 0,
  correction_budget INTEGER NOT NULL DEFAULT 0,
  routed_agent_id TEXT,
  policy_ref TEXT,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  approval_status TEXT NOT NULL,
  approval_decided_by TEXT,
  rollback_available BOOLEAN NOT NULL DEFAULT false,
  rollback_status TEXT NOT NULL,
  verdict TEXT NOT NULL,
  config_version TEXT NOT NULL,
  config_revision INTEGER NOT NULL,
  config_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.kare_task_transitions (
  task_id TEXT NOT NULL REFERENCES public.kare_tasks(task_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_id, seq)
);

CREATE TABLE public.kare_task_executions (
  task_id TEXT NOT NULL REFERENCES public.kare_tasks(task_id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  summary TEXT NOT NULL,
  agent_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_id, attempt)
);

CREATE TABLE public.kare_evidence (
  evidence_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES public.kare_tasks(task_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  produced_at TIMESTAMPTZ NOT NULL,
  produced_by TEXT NOT NULL,
  PRIMARY KEY (task_id, evidence_id)
);

CREATE TABLE public.kare_provenance (
  task_id TEXT PRIMARY KEY REFERENCES public.kare_tasks(task_id) ON DELETE CASCADE,
  config_version TEXT NOT NULL,
  config_revision INTEGER NOT NULL,
  config_source TEXT NOT NULL,
  policy_ref TEXT,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.kare_rollbacks (
  task_id TEXT PRIMARY KEY REFERENCES public.kare_tasks(task_id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  corrections_used INTEGER NOT NULL,
  correction_budget INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.kare_agents (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_mock BOOLEAN NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  credential_ref TEXT,
  endpoint_ref TEXT,
  policy_ref TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  config_version TEXT NOT NULL,
  config_revision INTEGER NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kare_agent_health (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  health TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kare_audit_events (
  audit_id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX kare_tasks_created_at_idx ON public.kare_tasks (created_at DESC);
CREATE INDEX kare_audit_events_at_idx ON public.kare_audit_events (at DESC);
CREATE INDEX kare_agent_health_observed_at_idx ON public.kare_agent_health (observed_at DESC);

-- Data API access: privileged server-side identity only.
-- K-ARE has no end-user authentication/RBAC yet (documented limitation), so no
-- anon/authenticated grants or policies are issued. RLS is enabled and no policy
-- exists for anon/authenticated, which denies all direct client access.
GRANT ALL ON public.kare_config_versions TO service_role;
GRANT ALL ON public.kare_tasks TO service_role;
GRANT ALL ON public.kare_task_transitions TO service_role;
GRANT ALL ON public.kare_task_executions TO service_role;
GRANT ALL ON public.kare_evidence TO service_role;
GRANT ALL ON public.kare_provenance TO service_role;
GRANT ALL ON public.kare_rollbacks TO service_role;
GRANT ALL ON public.kare_agents TO service_role;
GRANT ALL ON public.kare_agent_health TO service_role;
GRANT ALL ON public.kare_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.kare_agent_health_id_seq TO service_role;

ALTER TABLE public.kare_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_task_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_rollbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_agent_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kare_audit_events ENABLE ROW LEVEL SECURITY;