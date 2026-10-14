'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mergePrefs, type AgentPrefs } from '@/lib/agentPrefs';

/** The signed-in user's saved preferences from My Profile & Prefs; null until loaded. */
export function useAgentPrefs(): AgentPrefs | null {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AgentPrefs | null>(null);
  useEffect(() => {
    if (!user?.id) return; let live = true;
    createClient().from('user_profiles').select('agent_preferences').eq('id', user.id).maybeSingle().then(({ data }) => { if (live) setPrefs(mergePrefs(data?.agent_preferences)); });
    return () => { live = false; };
  }, [user?.id]);
  return prefs;
}
