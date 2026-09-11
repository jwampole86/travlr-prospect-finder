-- Add the approved interview phone numbers to the canonical candidate records.
-- Match by exact seeded full_name; do not create duplicate candidates.
UPDATE public.candidates
SET phone = source.phone,
    updated_at = now()
FROM (
  VALUES
    ('Brett Allen', '+17047785870'),
    ('Caitlyn Sorrells', '+18176945386'),
    ('Darlene Ciao', '+17027568283'),
    ('Gina L. Mattivello', '+13397930755'),
    ('Karissa Crooks', '+14432052906'),
    ('Kelli Winkel', '+14482057573'),
    ('Margo Johnson', '+19172915361')
) AS source(full_name, phone)
WHERE public.candidates.full_name = source.full_name;