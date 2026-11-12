alter table public.activity_events drop constraint if exists activity_events_event_type_check;
alter table public.activity_events add constraint activity_events_event_type_check check (event_type = any (array[
  'lead_created', 'csv_imported', 'sync_imported', 'stage_changed', 'score_updated', 'note_added', 'note_edited', 'regulation_refreshed',
  'live_status', 'lead_edited', 'contact_updated', 'lead_assigned', 'lead_unassigned', 'lead_archived', 'lead_restored', 'bulk_update',
  'enrichment_completed', 'outreach_sent', 'email_sent', 'sms_sent', 'call_completed'
]));
