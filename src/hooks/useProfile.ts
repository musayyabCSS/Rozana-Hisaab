import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface UserProfile {
  name: string;
  avatar: string | null;
}

const CACHED_PROFILE_KEY = 'rozana_cached_profile';

function readCachedAvatar(userId: string): { found: boolean; avatar: string | null } {
  try {
    const avatar = localStorage.getItem(`profile_avatar_${userId}`);
    return { found: avatar !== null, avatar: avatar || null };
  } catch (error) {
    console.warn('Could not read cached profile photo:', error);
    return { found: false, avatar: null };
  }
}

function writeCachedAvatar(userId: string, avatar: string | null) {
  try {
    localStorage.setItem(`profile_avatar_${userId}`, avatar ?? '');
  } catch (error) {
    console.warn('Could not cache profile photo on this device:', error);
  }
}

function extractProfile(user: User): UserProfile {
  const metadata: Record<string, unknown> = user.user_metadata;
  const name =
    [metadata.full_name, metadata.name, user.email?.split('@')[0]].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ) ?? 'User';

  return {
    name,
    avatar: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
  };
}

function readCachedProfile(userId?: string): UserProfile | null {
  try {
    if (userId) {
      const userCached = localStorage.getItem(`rozana_profile_${userId}`);
      if (userCached) {
        const profile = JSON.parse(userCached) as UserProfile;
        const cachedAvatar = readCachedAvatar(userId);
        return cachedAvatar.found ? { ...profile, avatar: cachedAvatar.avatar } : profile;
      }
    }
    const genericCached = localStorage.getItem(CACHED_PROFILE_KEY);
    if (genericCached) return JSON.parse(genericCached);
  } catch (e) {
    console.error('Error reading profile cache:', e);
  }
  return null;
}

function writeCachedProfile(userId: string, profile: UserProfile) {
  try {
    localStorage.setItem(`rozana_profile_${userId}`, JSON.stringify(profile));
    localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
    writeCachedAvatar(userId, profile.avatar);
  } catch (e) {
    console.error('Error writing profile cache:', e);
  }
}

export function useProfile(activeUserId?: string) {
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile(activeUserId));
  const [onboarded, setOnboarded] = useState<boolean>(() => !!readCachedProfile(activeUserId));
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        const cached = readCachedProfile(activeUserId);
        setProfile(cached);
        setOnboarded(!!cached);
        return;
      }

      // Read local cache first, fallback to user metadata
      const cached = readCachedProfile(user.id);
      const userProfile = cached ?? extractProfile(user);
      const cachedAvatar = readCachedAvatar(user.id);
      if (cachedAvatar.found) {
        userProfile.avatar = cachedAvatar.avatar;
      }

      writeCachedProfile(user.id, userProfile);
      setProfile(userProfile);
      setOnboarded(true);
    } catch (err) {
      console.error('Error loading profile:', err);
      const fallback = readCachedProfile(activeUserId);
      if (fallback) {
        setProfile(fallback);
        setOnboarded(true);
      }
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const userProfile = readCachedProfile(session.user.id) ?? extractProfile(session.user);
        const cachedAvatar = readCachedAvatar(session.user.id);
        if (cachedAvatar.found) {
          userProfile.avatar = cachedAvatar.avatar;
        }
        writeCachedProfile(session.user.id, userProfile);
        setProfile(userProfile);
        setOnboarded(true);
      } else {
        localStorage.removeItem(CACHED_PROFILE_KEY);
        setProfile(null);
        setOnboarded(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const saveProfile = useCallback(async (newProfile: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      writeCachedProfile(user.id, newProfile);
    }
    setProfile(newProfile);
    setOnboarded(true);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const updated = profile ? { ...profile, ...updates } : { name: 'User', avatar: null, ...updates };
    setProfile(updated);
    if (activeUserId) {
      writeCachedProfile(activeUserId, updated);
    }

    if (updates.avatar !== undefined) {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const user = session?.user;
        if (!user || (activeUserId && user.id !== activeUserId)) {
          console.warn('Could not confirm the active user; profile photo remains cached on this device.');
          return;
        }
        if (!activeUserId) writeCachedProfile(user.id, updated);

        const { error } = await supabase.auth.updateUser({
          data: { avatar_url: updates.avatar },
        });
        if (error) throw error;
      } catch (error) {
        console.warn(
          'Could not save profile photo to Supabase; the photo remains cached on this device.',
          error,
        );
      }
    }
  }, [activeUserId, profile]);

  return {
    profile,
    onboarded,
    loading,
    saveProfile,
    updateProfile,
    refetchProfile: loadProfile,
  };
}