-- Matching reads the registry one map area at a time, so the latitude and longitude of active licences need an index.
create index if not exists idx_str_registry_active_latlng on public.str_registry (lat, lng) where active;
