-- A deal can be marked closed only once the homeowner has signed the DocuSign agreements (envelope completed).
CREATE OR REPLACE FUNCTION public.require_signed_agreement_for_deal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deal_closed IS TRUE AND OLD.deal_closed IS DISTINCT FROM TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM public.signing_sessions s WHERE s.lead_id = NEW.id AND s.session_status = 'completed') THEN
      RAISE EXCEPTION 'A deal cannot be closed until the homeowner has signed the DocuSign agreements' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deal_requires_signed_agreement ON public.leads;
CREATE TRIGGER trg_deal_requires_signed_agreement BEFORE UPDATE OF deal_closed ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.require_signed_agreement_for_deal();
