-- Migration: Seed Maryland (Baltimore) STR regulation rules
-- These rules power Section C of the Homeowner Qualification Questionnaire
-- for leads with prefilled_state = 'MD'.
-- Source: Baltimore City Code Article 15, Subtitle 48 / Ordinance 19-0270
-- Last verified: 2026-08-31

-- Idempotent: delete existing MD rules before re-inserting
DELETE FROM public.regulation_rules WHERE state = 'MD';

INSERT INTO public.regulation_rules
  (id, state, city, rule_key, rule_label, rule_description, rule_type, rule_options, is_required, is_verified, verification_notes, display_order, is_active)
VALUES
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'primary_residence_confirmation',
    'Is this property your primary residence?',
    'Baltimore City only issues STR licenses for the owner''s primary residence (Baltimore City Code Article 15, Subtitle 48). The property must be deeded in your name as an individual — not a company or LLC.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against Baltimore City Code Art. 15 §48-7(a)(1) and DHCD STR program page (2026-08-31).',
    1,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'dhcd_license_status',
    'Do you currently hold a Baltimore City DHCD Short-Term Rental license, or are you applying for a new one?',
    'All STR operators in Baltimore City must hold an annual license from the Department of Housing & Community Development (DHCD). Note: New unhosted (non-owner-occupied) licenses are currently frozen — only existing unhosted licenses may renew. New hosted (owner-present) licenses are still available.',
    'select',
    ARRAY['I have an existing license (hosted)', 'I have an existing license (unhosted — renewal only)', 'I am applying for a new hosted license', 'I do not have a license yet'],
    TRUE,
    TRUE,
    'Verified against DHCD STR program page and Ordinance 19-0270 (2026-08-31). Unhosted new license freeze confirmed.',
    2,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'code_violations',
    'Is the property currently free of any open Baltimore City code violations?',
    'A property with open code violations is ineligible for an STR license under Baltimore City Code Article 15, Subtitle 48. All violations must be resolved before a license can be issued or renewed.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against DHCD STR licensing prerequisites (2026-08-31).',
    3,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'liability_insurance',
    'Does the property have liability insurance coverage for short-term rental use?',
    'Baltimore City requires proof of liability insurance as part of the STR license application. Standard homeowner''s insurance may not cover STR activity — a dedicated STR or landlord policy is typically required.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against DHCD STR application requirements (2026-08-31).',
    4,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'state_tax_registration',
    'Is the property owner registered with the Maryland State Comptroller for sales and use tax collection?',
    'STR operators in Baltimore City must be registered with the Maryland State Comptroller to collect and remit sales and use tax on rental income. This is a prerequisite for the DHCD license.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against Baltimore City Code Art. 15 §48-7(b)(4) (2026-08-31).',
    5,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'life_safety_inspection',
    'Has the property passed a life-safety self-certification inspection (smoke detectors, CO detectors, fire extinguisher, egress)?',
    'Baltimore City requires a self-certified life-safety inspection as part of the STR license application. This covers working smoke detectors, carbon monoxide detectors, fire extinguisher, and safe egress from all sleeping areas.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against DHCD STR application checklist (2026-08-31).',
    6,
    TRUE
  ),
  (
    gen_random_uuid(),
    'MD', 'Baltimore',
    'listing_license_display',
    'Are you prepared to display your Baltimore City STR license number on all listing platforms (Airbnb, VRBO, etc.)?',
    'Baltimore City Ordinance 19-0270 requires the STR license number to be displayed on every listing. Listings without a valid license number are subject to takedown demands sent to the platform.',
    'boolean',
    NULL,
    TRUE,
    TRUE,
    'Verified against Ordinance 19-0270 and DHCD compliance protocols (2026-08-31).',
    7,
    TRUE
  );
