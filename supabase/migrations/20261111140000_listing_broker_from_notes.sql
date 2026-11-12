-- Zillow imports kept the listing brokerage only in the lead notes ("... | Broker: Collier & Associates- Rogers Branch"), so the lead profile, the
-- already-listed rule and the AI qualification could not see who a home is listed with. Copy it into listing_broker_name where that is empty.
SET LOCAL statement_timeout = '5min';
UPDATE public.leads
SET listing_broker_name = btrim(substring(notes FROM '(?:^|\|)\s*Broker:\s*([^|\n]+)'))
WHERE price_type = 'sale'
  AND (listing_broker_name IS NULL OR btrim(listing_broker_name) = '')
  AND (listing_agent_name IS NULL OR btrim(listing_agent_name) = '')
  AND notes ~ '(^|\|)\s*Broker:\s*[^|\n]{2,}';
