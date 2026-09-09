-- Seed realistic bookings and payouts data for homeowner dashboard
-- This migration populates the bookings and payouts tables with demo data
-- tied to the existing property_homeowners record so the dashboard shows real data.

DO $$
DECLARE
    v_lead_id TEXT;
    v_homeowner_user_id UUID;
    v_now DATE := CURRENT_DATE;
BEGIN
    -- Get the existing property_homeowners record
    SELECT lead_id, homeowner_user_id
    INTO v_lead_id, v_homeowner_user_id
    FROM public.property_homeowners
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        RAISE NOTICE 'No property_homeowners record found. Skipping seed data.';
        RETURN;
    END IF;

    -- Seed bookings (12 months of realistic STR bookings)
    -- Past bookings (completed)
    INSERT INTO public.bookings (id, lead_id, guest_name, check_in, check_out, nights, gross_revenue, platform, status)
    VALUES
        (gen_random_uuid(), v_lead_id, 'Sarah & James Mitchell', v_now - INTERVAL '180 days', v_now - INTERVAL '175 days', 5, 1250.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Carlos Reyes', v_now - INTERVAL '165 days', v_now - INTERVAL '161 days', 4, 980.00, 'VRBO', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Emily & Tom Harrington', v_now - INTERVAL '155 days', v_now - INTERVAL '148 days', 7, 1820.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Priya Nair', v_now - INTERVAL '140 days', v_now - INTERVAL '137 days', 3, 720.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'David & Lisa Chen', v_now - INTERVAL '130 days', v_now - INTERVAL '123 days', 7, 1960.00, 'VRBO', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Marcus Johnson', v_now - INTERVAL '115 days', v_now - INTERVAL '112 days', 3, 690.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Rachel & Ben Torres', v_now - INTERVAL '100 days', v_now - INTERVAL '93 days', 7, 2100.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Aisha Williams', v_now - INTERVAL '88 days', v_now - INTERVAL '85 days', 3, 750.00, 'VRBO', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Kevin & Amy Park', v_now - INTERVAL '78 days', v_now - INTERVAL '71 days', 7, 1890.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Olivia Sanchez', v_now - INTERVAL '65 days', v_now - INTERVAL '62 days', 3, 810.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Nathan & Grace Kim', v_now - INTERVAL '55 days', v_now - INTERVAL '48 days', 7, 2240.00, 'VRBO', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Sophia Patel', v_now - INTERVAL '42 days', v_now - INTERVAL '39 days', 3, 870.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Tyler & Megan Brooks', v_now - INTERVAL '32 days', v_now - INTERVAL '25 days', 7, 2050.00, 'Airbnb', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Isabella Nguyen', v_now - INTERVAL '20 days', v_now - INTERVAL '17 days', 3, 780.00, 'VRBO', 'completed'),
        (gen_random_uuid(), v_lead_id, 'Jordan & Casey Lee', v_now - INTERVAL '12 days', v_now - INTERVAL '8 days', 4, 1040.00, 'Airbnb', 'completed'),
        -- Current / upcoming bookings
        (gen_random_uuid(), v_lead_id, 'Alex & Morgan Davis', v_now + INTERVAL '3 days', v_now + INTERVAL '10 days', 7, 2310.00, 'Airbnb', 'confirmed'),
        (gen_random_uuid(), v_lead_id, 'Samantha Rivera', v_now + INTERVAL '15 days', v_now + INTERVAL '18 days', 3, 840.00, 'VRBO', 'confirmed'),
        (gen_random_uuid(), v_lead_id, 'Chris & Dana Thompson', v_now + INTERVAL '25 days', v_now + INTERVAL '32 days', 7, 2450.00, 'Airbnb', 'confirmed'),
        (gen_random_uuid(), v_lead_id, 'Natalie Foster', v_now + INTERVAL '40 days', v_now + INTERVAL '43 days', 3, 900.00, 'Airbnb', 'pending'),
        (gen_random_uuid(), v_lead_id, 'Ryan & Jess Martinez', v_now + INTERVAL '55 days', v_now + INTERVAL '62 days', 7, 2380.00, 'VRBO', 'pending')
    ON CONFLICT (id) DO NOTHING;

    -- Seed payouts (6 months of monthly payout statements)
    INSERT INTO public.payouts (id, homeowner_user_id, lead_id, gross_amount, net_amount, management_fee, period_start, period_end, status, stripe_transfer_id, statement_url)
    VALUES
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 4230.00, 3384.00, 846.00,
         (v_now - INTERVAL '5 months')::date,
         (v_now - INTERVAL '5 months' + INTERVAL '1 month - 1 day')::date,
         'paid', 'tr_demo_001', ''),
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 5180.00, 4144.00, 1036.00,
         (v_now - INTERVAL '4 months')::date,
         (v_now - INTERVAL '4 months' + INTERVAL '1 month - 1 day')::date,
         'paid', 'tr_demo_002', ''),
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 6720.00, 5376.00, 1344.00,
         (v_now - INTERVAL '3 months')::date,
         (v_now - INTERVAL '3 months' + INTERVAL '1 month - 1 day')::date,
         'paid', 'tr_demo_003', ''),
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 5940.00, 4752.00, 1188.00,
         (v_now - INTERVAL '2 months')::date,
         (v_now - INTERVAL '2 months' + INTERVAL '1 month - 1 day')::date,
         'paid', 'tr_demo_004', ''),
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 4870.00, 3896.00, 974.00,
         (v_now - INTERVAL '1 month')::date,
         (v_now - INTERVAL '1 month' + INTERVAL '1 month - 1 day')::date,
         'paid', 'tr_demo_005', ''),
        (gen_random_uuid(), v_homeowner_user_id, v_lead_id, 3120.00, 2496.00, 624.00,
         date_trunc('month', v_now)::date,
         (date_trunc('month', v_now) + INTERVAL '1 month - 1 day')::date,
         'pending', '', '')
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Seeded bookings and payouts for lead_id: %', v_lead_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Seed data insertion failed: %', SQLERRM;
END $$;
