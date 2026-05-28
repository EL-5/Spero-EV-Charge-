-- Migration: Create Stations table and link Chargers
-- Description:
-- 1. Creates `stations` table for grouping chargers geographically.
-- 2. Adds `station_id` to `chargers` table.

CREATE TABLE IF NOT EXISTS public.stations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.chargers
ADD COLUMN IF NOT EXISTS station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chargers_station_id ON public.chargers(station_id);
