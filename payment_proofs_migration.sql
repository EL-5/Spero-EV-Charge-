-- ============================================================
-- Migration: Payment Proofs (MoMo SMS Verification)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the payment_proofs table
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  receipt_number TEXT,
  attendant_id UUID NOT NULL REFERENCES public.profiles(id),
  image_url TEXT NOT NULL,          -- Public URL from Supabase Storage
  storage_path TEXT NOT NULL,       -- Internal storage path (for deletion)
  sms_text TEXT,                    -- Optional: attendant-typed SMS content
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  notes TEXT
);

-- 2. Enable Row Level Security
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Attendants can insert their own proofs
CREATE POLICY "attendants_insert_own_proofs"
  ON public.payment_proofs FOR INSERT
  TO authenticated
  WITH CHECK (attendant_id = auth.uid());

-- Attendants can view their own proofs
CREATE POLICY "attendants_view_own_proofs"
  ON public.payment_proofs FOR SELECT
  TO authenticated
  USING (attendant_id = auth.uid());

-- Managers and Admins can view all proofs
CREATE POLICY "admins_view_all_proofs"
  ON public.payment_proofs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'accountant', 'finance')
    )
  );

-- Admins can update (verify) proofs
CREATE POLICY "admins_update_proofs"
  ON public.payment_proofs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- 4. Index for fast lookups by session and payment
CREATE INDEX IF NOT EXISTS idx_payment_proofs_session_id ON public.payment_proofs(session_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment_id ON public.payment_proofs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_attendant_id ON public.payment_proofs(attendant_id);

-- ============================================================
-- 5. Supabase Storage Bucket Setup
-- Run these commands in the Supabase SQL Editor as well
-- ============================================================

-- Create the storage bucket (private — requires signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880, -- 5MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Authenticated users can upload to their own folder
CREATE POLICY "auth_users_upload_proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: Users can read their own uploads
CREATE POLICY "auth_users_read_own_proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: Admins/Managers can read all proofs
CREATE POLICY "admins_read_all_proofs_storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'accountant', 'finance')
    )
  );

-- ============================================================
-- Done! Run the entire script, then proceed with code changes.
-- ============================================================
