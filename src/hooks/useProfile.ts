import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface UserProfile {
  name: string;
  avatar: string | null;
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboarded, setOnboarded] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setOnboarded(false);
      setLoading(false);
      return;
    }

    // Key local profile storage strictly by active Supabase User ID
    const storageKey = `rozana_profile_${user.id}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfile(parsed);
        setOnboarded(true);
      } catch (e) {
        console.error('Error parsing stored profile', e);
      }
    } else {
      // Auto-extract Google full name/photo or email name if no custom profile exists
      const defaultName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'User';
      const defaultAvatar = user.user_metadata?.avatar_url || null;

      const initialProfile = { name: defaultName, avatar: defaultAvatar };
      setProfile(initialProfile);
      setOnboarded(true);
      localStorage.setItem(storageKey, JSON.stringify(initialProfile));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const saveProfile = useCallback(async (newProfile: UserProfile) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const storageKey = `rozana_profile_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify(newProfile));
    setProfile(newProfile);
    setOnboarded(true);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const storageKey = `rozana_profile_${user.id}`;
    setProfile((prev) => {
      const updated = prev ? { ...prev, ...updates } : { name: 'User', avatar: null, ...updates };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return {
    profile,
    onboarded,
    loading,
    saveProfile,
    updateProfile,
    refetchProfile: loadProfile,
  };
}