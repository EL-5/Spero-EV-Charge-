'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  initialize: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isInitialized: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      initialize: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
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
            }
          }
        } finally {
          set({ isInitialized: true });
        }
      },
      login: async (email: string, password: string) => {
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (authError || !authData.user) return false;

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

          if (profileError || !profile) return false;

          const user: User = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            phone: profile.phone,
            isActive: profile.is_active,
            createdAt: profile.created_at,
          };

          set({ user, isAuthenticated: true, isInitialized: true });
          return true;
        } catch (error) {
          return false;
        }
      },
      logout: () => {
        supabase.auth.signOut();
        set({ user: null, isAuthenticated: false });
      },
    }),
    { 
      name: 'scms-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
