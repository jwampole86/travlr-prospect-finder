-- TRAVLR is expanding beyond the original Palm Springs boutique model, so outreach no longer calls the company boutique.
UPDATE public.email_templates
SET body = regexp_replace(regexp_replace(body, 'a boutique luxury (vacation rental|property management)', 'a luxury \1', 'gi'), 'a boutique (vacation rental|property management)', 'a \1', 'gi'),
    subject = regexp_replace(subject, 'boutique ', '', 'gi')
WHERE body ILIKE '%boutique%' OR subject ILIKE '%boutique%';
