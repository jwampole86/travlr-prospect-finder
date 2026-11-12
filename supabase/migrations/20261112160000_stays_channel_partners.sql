-- Professional managers who co-list homes on NAVEO Stays. The channel fee is charged only on bookings made through NAVEO Stays checkout,
-- so the partner name and the date its homes went live are all AVYRO needs to work the fee out from stays_bookings.
alter table public.stays_listings add column if not exists channel_partner text;
alter table public.stays_listings add column if not exists channel_live_date date;
create index if not exists stays_listings_channel_partner_idx on public.stays_listings (organization_id, channel_partner) where channel_partner is not null;
