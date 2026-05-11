'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { initialize, setUser } = useAuthStore();

  useEffect(() => {
    // 1. Initial check
    initialize();

    // 2. Listen for auth changes (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Only fetch if we don't already have a user in the store
        // to prevent double-fetching on login
        const currentStore = useAuthStore.getState();
        if (!currentStore.user || currentStore.user.id !== session.user.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser({
              id: profile.id,
              name: profile.name,
              email: profile.email,
              role: profile.role,
              phone: profile.phone,
              isActive: profile.is_active,
              createdAt: profile.created_at,
            });
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initialize, setUser]);

  return <>{children}</>;
}
