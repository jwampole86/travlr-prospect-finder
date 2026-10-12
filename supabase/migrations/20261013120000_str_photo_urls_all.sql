-- The listings feed returns every photo of a listing, but the pull keeps only the first twelve (photo_urls) to stay small.
-- photo_urls_all holds the complete list for listings that get a photo review, so the reviewer sees every picture.
ALTER TABLE public.str_listings ADD COLUMN IF NOT EXISTS photo_urls_all TEXT[];
