-- Live transcript of a phone call, written by Twilio's real-time transcription webhook and read by the teleprompter while the call runs.
create table if not exists public.call_transcript_events (
  id bigint generated always as identity primary key,
  session_id text,
  call_sid text,
  event text not null,
  track text,
  speaker text,
  text text,
  is_final boolean,
  sequence integer,
  created_at timestamptz not null default now()
);

create index if not exists call_transcript_events_session_idx on public.call_transcript_events (session_id, id);
create index if not exists call_transcript_events_created_idx on public.call_transcript_events (created_at);

-- Only the server (service role) reads and writes this table.
alter table public.call_transcript_events enable row level security;
