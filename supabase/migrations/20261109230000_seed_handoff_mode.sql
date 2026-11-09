-- The handoff flag starts on the watch_videos URL (architecture 7.2). On-call
-- flips it to copy_list with an update when the URL breaks (J16).
insert into app_flag (key, value) values ('handoff_mode', 'url')
on conflict (key) do nothing;
