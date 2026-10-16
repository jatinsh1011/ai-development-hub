/** Single-file migration list. Append new entries; never edit applied ones. */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  handle text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  github_id text UNIQUE,                 -- OAuth-ready: filled by GitHub login later
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'session',   -- session | pat
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  UNIQUE (org_id, slug)
);
CREATE TABLE memberships (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','maintainer','developer')),
  PRIMARY KEY (org_id, user_id)
);
CREATE TABLE team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('maintainer','member')),
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('user','org')),
  owner_id uuid NOT NULL,
  owner_slug text NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  slug text NOT NULL,
  title text NOT NULL,
  type text NOT NULL,
  description text NOT NULL,
  author text NOT NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private','organization','team')),
  latest_version text,
  license text,
  repository text,
  homepage text,
  tags text[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  frameworks text[] NOT NULL DEFAULT '{}',
  compat jsonb NOT NULL DEFAULT '{}',
  verified boolean NOT NULL DEFAULT false,
  official boolean NOT NULL DEFAULT false,
  downloads int NOT NULL DEFAULT 0,
  installs int NOT NULL DEFAULT 0,
  stars int NOT NULL DEFAULT 0,
  forked_from uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  search tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_slug, slug)
);
CREATE INDEX artifacts_search_idx ON artifacts USING gin (search);
CREATE INDEX artifacts_type_idx ON artifacts (type);
CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  file_index jsonb NOT NULL,             -- [{path,size}] ; bytes live in object storage
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  readme text,
  findings jsonb NOT NULL DEFAULT '[]',
  risk jsonb NOT NULL DEFAULT '[]',
  published_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version)           -- versions are immutable: never UPDATEd
);
CREATE TABLE artifact_grants (
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('team','user')),
  grantee_id uuid NOT NULL,
  PRIMARY KEY (artifact_id, grantee_type, grantee_id)
);
CREATE TABLE org_policies (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('approved','blocked')),
  set_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, artifact_id)
);
CREATE TABLE stars (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, artifact_id)
);
CREATE TABLE ratings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, artifact_id)
);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Usage events (monitoring architecture). Ingested minimally now; analytics read from here later.
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider text,
  agent text,
  model text,
  session_id text,
  repository text,
  input_tokens int,
  output_tokens int,
  estimated_cost numeric(12,6),
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  artifact_version text,
  payload jsonb NOT NULL DEFAULT '{}',
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_org_ts_idx ON events (org_id, ts DESC);
CREATE INDEX events_artifact_idx ON events (artifact_id);
`,
  },
  {
    id: '002_github_stars',
    sql: `
ALTER TABLE artifacts ADD COLUMN github_repo text;
ALTER TABLE artifacts ADD COLUMN github_stars int;
ALTER TABLE artifacts ADD COLUMN github_synced_at timestamptz;
CREATE INDEX artifacts_github_repo_idx ON artifacts (github_repo);
`,
  },
];
