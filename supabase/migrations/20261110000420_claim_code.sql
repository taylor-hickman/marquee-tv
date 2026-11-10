-- One-time claim codes (architecture 4, claiming). Sign-in mints one bound to
-- the guest and carries it through the magic link or OAuth redirect, so a
-- different browser can still claim the guest's drafts. Consuming a code
-- deletes its row.
create table claim_code (
  -- SHA-256 of the code; the code itself is never stored
  code_hash bytea primary key check (octet_length(code_hash) = 32),
  guest_id uuid not null references guest (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index claim_code_guest_id_idx on claim_code (guest_id);

alter table claim_code enable row level security;
