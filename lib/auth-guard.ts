/**
 * auth-guard.ts
 * Server-side authentication & authorization guard for use in Next.js Server Actions.
 *
 * WHY: The client-side Zustand auth store can be forged by manipulating localStorage.
 * This module derives identity directly from the Supabase auth session cookie,
 * which is cryptographically signed and cannot be spoofed by the caller.
 *
 * USAGE:
 *   const user = await requireAuth();                           // Any authenticated user
 *   const user = await requireAuth(['super_admin', 'manager']); // Role-restricted
 */

import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

export interface AuthenticatedUser {
  id: string;
  role: string;
  name: string;
  email: string;
  isActive: boolean;
}

/**
 * Verifies the caller is authenticated and optionally checks their role.
 * Throws an Error (do NOT catch — let the action return { success: false }) if unauthorized.
 *
 * @param allowedRoles - Optional list of roles that are permitted. If omitted, any authenticated user passes.
 * @returns The authenticated user's profile.
 */
export async function requireAuth(allowedRoles?: string[]): Promise<AuthenticatedUser> {
  // Get the current Supabase session (reads from auth cookie / JWT)
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    throw new Error('Unauthenticated: You must be signed in to perform this action.');
  }

  // Fetch the user's profile with role info (use admin client to bypass RLS)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, is_active')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Unauthenticated: User profile not found.');
  }

  if (!profile.is_active) {
    throw new Error('Forbidden: Your account has been deactivated. Contact a system administrator.');
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    throw new Error(
      `Forbidden: This action requires one of the following roles: ${allowedRoles.join(', ')}. Your role: ${profile.role}`
    );
  }

  return {
    id: profile.id,
    role: profile.role,
    name: profile.name,
    email: profile.email,
    isActive: profile.is_active,
  };
}

/**
 * Safe wrapper that catches auth errors and returns a standard error response.
 * Use this when you want to return { success: false, error } instead of throwing.
 */
export async function withAuth<T>(
  allowedRoles: string[] | undefined,
  fn: (user: AuthenticatedUser) => Promise<T>
): Promise<T | { success: false; error: string }> {
  try {
    const user = await requireAuth(allowedRoles);
    return await fn(user);
  } catch (err: any) {
    console.error('[AUTH_GUARD]', err.message);
    return { success: false, error: err.message };
  }
}
