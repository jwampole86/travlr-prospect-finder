-- AVA introduces herself once per person, not once per browser: the first time is recorded on the account.
alter table public.user_profiles add column if not exists ava_introduced_at timestamptz;
