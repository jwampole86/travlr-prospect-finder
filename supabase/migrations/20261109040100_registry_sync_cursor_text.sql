-- The leads table stores created_at as text (and a few rows have it blank), so the sync cursor is kept as text too, compared the same way.
alter table public.registry_sync_state alter column cursor_at drop default;
alter table public.registry_sync_state alter column cursor_at type text using cursor_at::text;
alter table public.registry_sync_state alter column cursor_at set default '';
update public.registry_sync_state set cursor_at = '', cursor_id = '';
