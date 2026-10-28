-- 001_initial.sql — esquema aprobado (CLAUDE.md sección 5).
-- Correr una vez en el SQL Editor de Supabase. Idempotente: se puede repetir.

create table if not exists sessions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  channel           text not null check (channel in ('shopify', 'woo_vtex', 'api', 'none')),
  is_owner          boolean not null default false,
  fintoc_session_id text unique,
  amount            integer not null,
  status            text not null default 'created',
  expires_at        timestamptz not null
);

create table if not exists payment_events (
  id              bigint generated always as identity primary key,
  session_id      uuid references sessions(id) on delete cascade,
  received_at     timestamptz not null default now(),
  event_type      text not null,
  fintoc_event_id text not null unique,   -- idempotencia: un reenvío no duplica
  signature_valid boolean not null,
  payload_raw     jsonb not null           -- siempre se guarda el payload crudo
);

create table if not exists funnel_events (
  id          bigint generated always as identity primary key,
  session_id  uuid references sessions(id) on delete cascade,
  step        text not null,
  occurred_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
);

create table if not exists diagnostics (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  rule_id     text not null,
  severity    text not null,
  explanation text not null,
  next_step   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists payment_events_session_idx on payment_events (session_id);
create index if not exists funnel_events_session_idx on funnel_events (session_id);
create index if not exists funnel_events_step_idx on funnel_events (step, occurred_at);
create index if not exists diagnostics_session_idx on diagnostics (session_id);

-- RLS activado en todas las tablas: sin políticas, nadie accede vía Data API
-- (que además está desactivado). El servidor entra por DATABASE_URL con el
-- rol postgres, que no pasa por RLS.
alter table sessions enable row level security;
alter table payment_events enable row level security;
alter table funnel_events enable row level security;
alter table diagnostics enable row level security;
