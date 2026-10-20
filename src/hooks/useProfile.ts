import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { compressAvatarToDataUrl, validateAvatarFile } from '@/lib/avatar';

export interface UserProfile {
  name: string;
  avatar: string | null;
}

const CACHED_PROFILE_KEY = 'rozana_cached_profile';

function extractProfile(user: User): UserProfile {
  const metadata = user.user_metadata ?? {};
  const name =
    [metadata.full_name, metadata.name, user.email?.split('@')[0]].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ) ?? 'User';

  const avatar =
    (typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim().length > 0)
      ? metadata.avatar_url
      : (typeof metadata.picture === 'string' && metadata.picture.trim().length > 0)
        ? metadata.picture
        : null;

  return { name, avatar };
}

function readCachedProfile(userId?: string): UserProfile | null {
  try {
    if (userId) {
      const userCached = localStorage.getItem(`rozana_profile_${userId}`);
      if (userCached) return JSON.parse(userCached) as UserProfile;
    }
    const genericCached = localStorage.getItem(CACHED_PROFILE_KEY);
    if (genericCached) return JSON.parse(genericCached) as UserProfile;
  } catch (e) {
    console.error('Error reading profile cache:', e);
  }
  return null;
}

function writeCachedProfile(userId: string, profile: UserProfile): boolean {
  try {
    localStorage.setItem(`rozana_profile_${userId}`, JSON.stringify(profile));
  } catch (e) {
    console.error('Error writing profile cache:', e);
    return false;
  }
  try {
    localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('Could not update the generic profile cache:', e);
  }
  return true;
}

export function useProfile(activeUserId?: string) {
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile(activeUserId));
  const [onboarded, setOnboarded] = useState<boolean>(() => !!readCachedProfile(activeUserId));
  const [loading, setLoading] = useState(true);

  const syncProfile = useCallback(async () => {
    if (!navigator.onLine) return;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return;
      if (activeUserId && user.id !== activeUserId) return;

      const cachedProfile = readCachedProfile(user.id);
      const remoteProfile = extractProfile(user);
      const cachedAvatar = cachedProfile?.avatar?.startsWith('data:image/')
        ? cachedProfile.avatar
        : null;
      const latestProfile = cachedAvatar
        ? { ...remoteProfile, avatar: cachedAvatar }
        : remoteProfile.avatar
          ? remoteProfile
          : { ...remoteProfile, avatar: cachedProfile?.avatar ?? null };
      writeCachedProfile(user.id, latestProfile);
      setProfile(latestProfile);
      setOnboarded(true);
    } catch (err) {
      console.warn('Background profile sync skipped:', err);
    }
  }, [activeUserId]);

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

      // 1. Initial render from cache or session
      const cached = readCachedProfile(user.id);
      const sessionProfile = extractProfile(user);
      const initialProfile = cached?.avatar ? cached : sessionProfile;

      setProfile(initialProfile);
      setOnboarded(true);
      writeCachedProfile(user.id, initialProfile);

      // 2. Fetch fresh metadata from server when online
      if (navigator.onLine) {
        void syncProfile();
      }
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
  }, [activeUserId, syncProfile]);

  useEffect(() => {
    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const remoteProfile = extractProfile(session.user);
        const cachedProfile = readCachedProfile(session.user.id);
        const cachedAvatar = cachedProfile?.avatar?.startsWith('data:image/')
          ? cachedProfile.avatar
          : null;
        const metadataProfile = cachedAvatar
          ? { ...remoteProfile, avatar: cachedAvatar }
          : remoteProfile.avatar
            ? remoteProfile
            : { ...remoteProfile, avatar: cachedProfile?.avatar ?? null };
        writeCachedProfile(session.user.id, metadataProfile);
        setProfile(metadataProfile);
        setOnboarded(true);
      } else {
        localStorage.removeItem(CACHED_PROFILE_KEY);
        setProfile(null);
        setOnboarded(false);
      }
      setLoading(false);
    });

    const handleOnline = () => {
      void syncProfile();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, [loadProfile, syncProfile]);

  const saveProfile = useCallback(async (newProfile: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      writeCachedProfile(user.id, newProfile);
    }
    setProfile(newProfile);
    setOnboarded(true);
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    const validationError = validateAvatarFile(file);
    if (validationError) throw new Error(validationError);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = session?.user;
    if (!user) {
      throw new Error('Could not confirm the active user. Please sign in again.');
    }

    const avatarDataUrl = await compressAvatarToDataUrl(file);
    const updated = { ...(profile ?? { name: 'User', avatar: null }), avatar: avatarDataUrl };
    if (!writeCachedProfile(user.id, updated)) {
      throw new Error('Could not persist the profile photo on this device.');
    }
    setProfile(updated);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: avatarDataUrl },
      });
      if (updateError) {
        console.warn('Profile photo is saved locally but could not sync to the account:', updateError);
      }
    }

    return avatarDataUrl;
  }, [profile]);

  return {
    profile,
    onboarded,
    loading,
    saveProfile,
    uploadAvatar,
    refetchProfile: loadProfile,
    syncProfile,
  };
}