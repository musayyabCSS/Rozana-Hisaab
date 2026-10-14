import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface UserProfile {
  name: string;
  avatar: string | null;
}

const cachedProfileKey = 'rozana_cached_profile';

function parseProfile(value: unknown): UserProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const profile = value as Record<string, unknown>;
  if (typeof profile.name !== 'string') return null;
  if (profile.avatar !== null && typeof profile.avatar !== 'string') return null;
  return { name: profile.name, avatar: profile.avatar };
}

function readCachedProfile(userId?: string): UserProfile | null {
  try {
    if (userId) {
      const saved = localStorage.getItem(`rozana_profile_${userId}`);
      const userProfile = saved ? parseProfile(JSON.parse(saved)) : null;
      if (userProfile) return userProfile;
    }

    const cached = localStorage.getItem(cachedProfileKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { userId?: unknown; profile?: unknown };
    if (userId && parsed.userId !== userId) return null;
    return parseProfile(parsed.profile);
  } catch (error) {
    console.error('Error reading cached profile:', error);
    return null;
  }
}

function writeCachedProfile(userId: string, profile: UserProfile) {
  localStorage.setItem(`rozana_profile_${userId}`, JSON.stringify(profile));
  localStorage.setItem(cachedProfileKey, JSON.stringify({ userId, profile }));
}

export function useProfile(activeUserId?: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboarded, setOnboarded] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!activeUserId) {
      setLoading(true);
      return;
    }

    setLoading(true);
    let sessionProfile: UserProfile | null = null;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      const user = session?.user;
      if (!user || user.id !== activeUserId) {
        const cached = readCachedProfile(activeUserId);
        setProfile(cached);
        setOnboarded(!!cached);
        return;
      }

      sessionProfile = {
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'User',
        avatar: user.user_metadata?.avatar_url || null,
      };
      const cached = readCachedProfile(user.id);
      if (typeof navigator !== 'undefined' && !navigator.onLine && cached) {
        setProfile(cached);
        setOnboarded(true);
        return;
      }

      const { data: { user: fetchedUser }, error: fetchError } = await supabase.auth.getUser();
      if (fetchError) throw fetchError;
      const fetchedProfile = fetchedUser
        ? {
            name:
              fetchedUser.user_metadata?.full_name ||
              fetchedUser.user_metadata?.name ||
              fetchedUser.email?.split('@')[0] ||
              'User',
            avatar: fetchedUser.user_metadata?.avatar_url || null,
          }
        : sessionProfile;
      const initialProfile = cached ?? fetchedProfile;
      if (!initialProfile) {
        throw new Error('Could not resolve a profile for the active user.');
      }
      writeCachedProfile(user.id, initialProfile);
      setProfile(initialProfile);
      setOnboarded(true);
    } catch (error) {
      console.error('Error loading profile:', error);
      const fallbackProfile = readCachedProfile(activeUserId) ?? sessionProfile;
      if (fallbackProfile) {
        if (sessionProfile) writeCachedProfile(activeUserId, fallbackProfile);
        setProfile(fallbackProfile);
        setOnboarded(true);
      } else {
        setProfile(null);
        setOnboarded(false);
      }
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const saveProfile = useCallback(async (newProfile: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    writeCachedProfile(user.id, newProfile);
    setProfile(newProfile);
    setOnboarded(true);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    setProfile((prev) => {
      const updated = prev ? { ...prev, ...updates } : { name: 'User', avatar: null, ...updates };
      writeCachedProfile(user.id, updated);
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