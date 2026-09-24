CREATE SCHEMA IF NOT EXISTS meter_app;
CREATE TABLE meter_app.users (
  id uuid PRIMARY KEY,
  username text UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator')),
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  auth_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meter_app.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES meter_app.users(id) ON DELETE CASCADE,
  auth_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON meter_app.sessions(user_id);
CREATE TABLE meter_app.rate_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL
);
CREATE TABLE meter_app.reports (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES meter_app.users(id),
  plant text NOT NULL CHECK (plant IN ('JRE','UNILAND')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date > start_date),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, plant, start_date, end_date)
);
CREATE INDEX reports_owner_updated ON meter_app.reports(owner_id, updated_at DESC, id);
CREATE TABLE meter_app.report_revisions (
  report_id uuid NOT NULL REFERENCES meter_app.reports(id),
  revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES meter_app.users(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(report_id, revision)
);
CREATE TABLE meter_app.audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES meter_app.users(id),
  action text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
