'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/client';
import { identifyUser, resetMixpanel } from '../lib/mixpanel';

export type UserRole = 'admin' | 'owner' | 'agent' | 'homeowner';

interface AuthContextType {
  user: any;
  session: any;
  loading: boolean;
  role: UserRole | null;
  signUp: (email: string, password: string, metadata?: any) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<any>;
  signInWithApple: () => Promise<any>;
  getCurrentUser: () => Promise<any>;
  isEmailVerified: () => boolean;
  getUserProfile: () => Promise<any>;
  isAdmin: () => boolean;
  isAgent: () => boolean;
  isHomeowner: () => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const supabase = createClient();

  const extractRole = (u: any): UserRole => {
    const r = u?.user_metadata?.role || u?.raw_user_meta_data?.role;
    if (r === 'agent') return 'agent';
    if (r === 'homeowner') return 'homeowner';
    if (r === 'owner') return 'owner';
    return 'admin';
  };

  const loadRoleFromProfile = async (userId: string): Promise<UserRole | null> => {
    try {
      const profileRequest = supabase
        .from('user_profiles')
        .select('app_role')
        .eq('id', userId)
        .single();
      const profileResult = await Promise.race([
        profileRequest,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const data = profileResult?.data;
      if (data?.app_role === 'agent') return 'agent';
      if (data?.app_role === 'admin') return 'admin';
      if (data?.app_role === 'owner') return 'owner';
      if (data?.app_role === 'homeowner') return 'homeowner';
    } catch { /* silent */ }
    return null;
  };

  useEffect(() => {
    const sessionRequest = supabase.auth.getSession();
    const sessionTimeout = new Promise<{ data: { session: null }; error: null }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null }, error: null }), 3000)
    );

    Promise.race([sessionRequest, sessionTimeout])
      .then(async ({ data: { session }, error }) => {
        if (error) throw error;
        setSession(session);
        if (session?.user) {
          // The session JWT is already available locally; avoid an extra auth request here.
          const authenticatedUser = session.user;
          setUser(authenticatedUser ?? null);
          if (authenticatedUser) {
            const profileRole = await loadRoleFromProfile(authenticatedUser.id);
            setRole(profileRole ?? extractRole(authenticatedUser));
            identifyUser(authenticatedUser.id, { email: authenticatedUser.email });
          } else {
            setRole(null);
          }
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      })
      .catch(async (err) => {
        // A stale/invalid refresh token (e.g. from a previous Supabase project or domain)
        // gets stuck in storage and throws here — wipe it so the user can sign in fresh.
        if (err?.message?.includes('Refresh Token')) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        setUser(null);
        setSession(null);
        setRole(null);
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        // The session JWT is already available locally; avoid an extra auth request here.
        const authenticatedUser = session.user;
        setUser(authenticatedUser ?? null);
        // Show a fast fallback role immediately; refine it in the background once the profile loads.
        setRole(extractRole(authenticatedUser));
        identifyUser(authenticatedUser.id, { email: authenticatedUser.email });
        loadRoleFromProfile(authenticatedUser.id).then((profileRole) => {
          if (profileRole) {
            setRole(profileRole);
            if (typeof document !== 'undefined') {
              document.cookie = `travlr_role=${profileRole}; path=/; max-age=86400; SameSite=Lax`;
            }
          }
        });
      } else {
        setUser(null);
        setRole(null);
        resetMixpanel();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, metadata: any = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.fullName || '',
          avatar_url: metadata?.avatarUrl || '',
          role: metadata?.role || 'admin',
        }
      }
    });
    if (error) throw error;
    if (!data.session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw new Error('Account created! Please check your email to confirm your account, then sign in.');
      }
      return signInData;
    }
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Set a fast fallback role cookie immediately for middleware route protection;
    // onAuthStateChange refines it once the profile query resolves in the background.
    if (data?.user && typeof document !== 'undefined') {
      document.cookie = `travlr_role=${extractRole(data.user)}; path=/; max-age=86400; SameSite=Lax`;
    }
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear role cookie
    if (typeof document !== 'undefined') {
      document.cookie = 'travlr_role=; path=/; max-age=0';
    }
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return data;
  };

  const signInWithApple = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return data;
  };

  const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  };

  const isEmailVerified = () => user?.email_confirmed_at !== null;

  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  };

  const isAdmin = () => role === 'admin' || role === 'owner';
  const isAgent = () => role === 'agent';
  const isHomeowner = () => role === 'homeowner';

  const value: AuthContextType = {
    user,
    session,
    loading,
    role,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    signInWithApple,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
    isAdmin,
    isAgent,
    isHomeowner,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
