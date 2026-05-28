-- Migration: Disable RLS on Stations
-- Description: Disables row-level security on the `stations` table to allow client-side hooks to read the stations list, while write operations are restricted and executed via Server Actions.

ALTER TABLE public.stations DISABLE ROW LEVEL SECURITY;
