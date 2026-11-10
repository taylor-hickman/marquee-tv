-- The beta pricing cohort follows the person when a guest's drafts are claimed
-- (architecture 5.4, PRD 16.4). Null for a user who never claimed a guest.
alter table app_user
  add column cohort text check (cohort in ('pass_first', 'sub_first'));
