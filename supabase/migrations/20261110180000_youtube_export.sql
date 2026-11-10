-- Save to my YouTube (PRD 10.2, architecture 11). Live only while
-- app_flag.handoff_mode is 'api'.

-- One Google grant for the youtube scope per user. The refresh token is
-- encrypted by the app (AES-256-GCM, YOUTUBE_TOKEN_KEY) before it reaches here,
-- and never leaves the server.
create table youtube_connection (
  user_id uuid primary key references app_user (id) on delete cascade,
  refresh_token bytea not null,
  created_at timestamptz not null default now()
);

-- One export per draft revision, so a second tap finds this row instead of
-- creating a second playlist. items_done counts the revision's items already
-- inserted or skipped, so a failed export resumes where it stopped.
create table export_job (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references playlist_draft (id) on delete cascade,
  revision integer not null,
  user_id uuid not null references app_user (id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'done', 'failed')),
  youtube_playlist_id text,
  items_done integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, revision),
  foreign key (draft_id, revision)
    references playlist_revision (draft_id, number) on delete cascade
);

alter table youtube_connection enable row level security;
alter table export_job enable row level security;
