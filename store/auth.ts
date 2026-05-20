'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/lib/types';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// FIX HIGH-03: User PII (name, email, phone, role, id) is NO LONGER stored in
//              localStorage. Only `isAuthenticated` is persisted so that the
//              splash screen doesn't flicker on reload. The actual user profile
//              is always fetched fresh from Supabase on initialization.
//
// FIX HIGH-04: Client-side brute-force protection with lockout after 5 failed
//              attempts. Lock lasts 15 minutes.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  initialize: () => Promise<void>;
  setUser: (user: User | null) => void;
  resetLockout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isInitialized: false,
      failedAttempts: 0,
      lockedUntil: null,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      resetLockout: () => set({ failedAttempts: 0, lockedUntil: null }),
      initialize: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile && profile.is_active) {
              set({
                user: {
                  id: profile.id,
                  name: profile.name,
                  email: profile.email,
                  role: profile.role,
                  phone: profile.phone,
                  isActive: profile.is_active,
                  createdAt: profile.created_at,
                },
                isAuthenticated: true,
              });
            } else {
              // Profile inactive or missing — sign out
              await supabase.auth.signOut();
              set({ user: null, isAuthenticated: false });
            }
          }
        } finally {
          set({ isInitialized: true });
        }
      },
      login: async (email: string, password: string) => {
        const { failedAttempts, lockedUntil } = get();

        // HIGH-04: Enforce lockout period
        if (lockedUntil && Date.now() < lockedUntil) {
          const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
          return {
            ok: false,
            error: `Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
          };
        }

        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (authError || !authData.user) {
            const newAttempts = failedAttempts + 1;
            const newLockout = newAttempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null;
            set({ failedAttempts: newAttempts, lockedUntil: newLockout });
            return { ok: false, error: 'Invalid email or password. Please try again.' };
          }

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

          if (profileError || !profile) {
            await supabase.auth.signOut();
            return { ok: false, error: 'User profile not found. Contact your administrator.' };
          }

          // Block deactivated accounts at login
          if (!profile.is_active) {
            await supabase.auth.signOut();
            return { ok: false, error: 'Your account has been deactivated. Contact your administrator.' };
          }

          const user: User = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            phone: profile.phone,
            isActive: profile.is_active,
            createdAt: profile.created_at,
          };

          // Successful login — reset lockout state
          set({ user, isAuthenticated: true, isInitialized: true, failedAttempts: 0, lockedUntil: null });
          return { ok: true };
        } catch (error) {
          console.error('[AUTH] Login error:', error);
          return { ok: false, error: 'An unexpected error occurred. Please try again.' };
        }
      },
      logout: () => {
        supabase.auth.signOut();
        set({ user: null, isAuthenticated: false, failedAttempts: 0, lockedUntil: null });
      },
    }),
    {
      name: 'scms-auth',
      storage: createJSONStorage(() => sessionStorage), // sessionStorage clears on tab close
      // HIGH-03: Only persist the bare minimum — NO user PII in browser storage
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        // Persist lockout state so it survives page refreshes
        failedAttempts: state.failedAttempts,
        lockedUntil: state.lockedUntil,
      }),
    }
  )
);
