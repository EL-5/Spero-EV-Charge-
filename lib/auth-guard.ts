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

import { supabaseAdmin, getServerSupabase } from '@/lib/supabase-server';

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
  const supabase = await getServerSupabase();
  const userId = await verifiedUserId(supabase);

  const profile = await loadProfile(userId);

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
 * Identity of the caller. getClaims() checks the token's signature locally, so it
 * skips the network round trip getUser() makes on every action. If the project cannot
 * verify locally, getClaims falls back to the same server check by itself.
 */
async function verifiedUserId(supabase: Awaited<ReturnType<typeof getServerSupabase>>): Promise<string> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!error && typeof sub === 'string' && sub) return sub;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Unauthenticated: You must be signed in to perform this action.');
  }
  return user.id;
}

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

// Profiles change rarely, but every action reads one. A short cache removes that read
// from bursts of actions. Kept to 15 s so a deactivation or role change still bites fast.
const PROFILE_TTL_MS = 15_000;
const profileCache = new Map<string, { at: number; row: ProfileRow }>();

async function loadProfile(userId: string): Promise<ProfileRow> {
  const hit = profileCache.get(userId);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.row;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, is_active')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error('Unauthenticated: User profile not found.');
  }
  if (profileCache.size > 500) profileCache.clear();
  profileCache.set(userId, { at: Date.now(), row: profile as ProfileRow });
  return profile as ProfileRow;
}

export interface AuthenticatedDriver {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

/**
 * Verifies the caller is a signed-in driver.
 * Drivers are NOT rows in `profiles` (registerDriver deletes the trigger-created
 * profile row so the driver role can bypass the profiles_role_check constraint —
 * see app/actions/driver-auth.ts), so requireAuth() cannot be reused here; identity
 * is looked up in the `drivers` table by the authenticated Supabase user id instead.
 * Throws an Error (do NOT catch — let the action return { success: false }) if unauthorized.
 */
export async function requireDriverAuth(): Promise<AuthenticatedDriver> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Unauthenticated: You must be signed in to perform this action.');
  }

  const { data: driver, error: driverError } = await supabaseAdmin
    .from('drivers')
    .select('id, name, phone, is_active')
    .eq('id', user.id)
    .single();

  if (driverError || !driver) {
    throw new Error('Unauthenticated: Driver profile not found.');
  }

  if (!driver.is_active) {
    throw new Error('Forbidden: Your account has been deactivated. Contact a system administrator.');
  }

  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    isActive: driver.is_active,
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
