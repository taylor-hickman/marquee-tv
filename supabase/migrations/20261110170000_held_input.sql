-- The brief a 402 holds on the draft through sign-in and payment (architecture
-- 7.3): the person's input as they sent it, run by the next generate that comes
-- without one, then cleared. Null when nothing is held.
alter table playlist_draft
  add column held_input jsonb;
