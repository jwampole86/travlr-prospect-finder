-- The cadence engine now skips (and pauses) a for-sale home that is listed with a broker, and records why.
ALTER TABLE public.cadence_send_log DROP CONSTRAINT IF EXISTS cadence_send_log_status_check;
ALTER TABLE public.cadence_send_log
  ADD CONSTRAINT cadence_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped_opt_out', 'skipped_dnc', 'skipped_already_listed'));
