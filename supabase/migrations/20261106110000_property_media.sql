-- Property photos for the NAVEO Homes galleries. A photo is captured as a reference to where it came from; it is only ever
-- shown in a gallery after a person has recorded why it may be published (rights_status = 'cleared' with a basis).

create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  lead_id text not null,
  property_id uuid references public.properties(id) on delete set null,
  source text not null,
  source_url text,
  image_url text not null,
  image_key text not null,
  position integer not null default 0,
  is_hero boolean not null default false,
  hidden boolean not null default false,
  rights_status text not null default 'unreviewed' check (rights_status in ('unreviewed', 'cleared', 'restricted', 'rejected')),
  rights_basis text check (rights_basis in ('seller_provided', 'owner_authorized', 'licensed_feed', 'source_terms_allow', 'own_photography')),
  rights_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  -- Our own copy, so a published gallery does not depend on (or hotlink) the source site's server.
  storage_path text,
  mirrored_at timestamptz,
  mirror_error text,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rights_status <> 'cleared' or rights_basis is not null)
);
create unique index if not exists property_media_lead_image_idx on public.property_media (organization_id, lead_id, image_key);
create index if not exists property_media_lead_idx on public.property_media (lead_id, position);
create index if not exists property_media_review_idx on public.property_media (organization_id, rights_status) where rights_status = 'unreviewed';

create or replace function public.set_property_media_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists property_media_updated_at on public.property_media;
create trigger property_media_updated_at before update on public.property_media for each row execute function public.set_property_media_updated_at();

alter table public.property_media enable row level security;
drop policy if exists property_media_admin_org on public.property_media;
create policy property_media_admin_org on public.property_media for all to authenticated
  using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin')
  with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
