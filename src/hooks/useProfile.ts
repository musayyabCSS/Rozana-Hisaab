import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { compressAvatarToDataUrl, validateAvatarFile } from '@/lib/avatar';

export interface UserProfile {
  name: string;
  avatar: string | null;
}

const CACHED_PROFILE_KEY = 'rozana_cached_profile';

function isRemoteImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

// Older builds stored the custom photo as a data URL in user_metadata. That
// metadata is embedded in every access token, so a ~100 KB photo made request
// headers too large. Custom photos now stay on the device only.
function hasEmbeddedAvatar(user: User): boolean {
  const avatarUrl: unknown = user.user_metadata?.avatar_url;
  return typeof avatarUrl === 'string' && avatarUrl.startsWith('data:');
}

async function removeEmbeddedAvatar(user: User): Promise<void> {
  if (!hasEmbeddedAvatar(user)) return;
  const picture: unknown = user.user_metadata?.picture;
  const { error } = await supabase.auth.updateUser({
    data: { avatar_url: isRemoteImageUrl(picture) ? picture : null },
  });
  if (error) {
    console.warn('Could not remove the embedded profile photo from the account:', error);
    return;
  }
  // Issue a new, smaller access token without the embedded photo.
  await supabase.auth.refreshSession();
}

function extractProfile(user: User): UserProfile {
  const metadata = user.user_metadata ?? {};
  const name =
    [metadata.full_name, metadata.name, user.email?.split('@')[0]].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ) ?? 'User';

  // Google sign-in provides the photo as `avatar_url` and `picture`.
  const avatar = [metadata.avatar_url, metadata.picture].find(isRemoteImageUrl) ?? null;

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
      // Check the locally stored session first: an oversized token can make
      // the getUser() request below fail before the cleanup could run.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && (!activeUserId || session.user.id === activeUserId)) {
        await removeEmbeddedAvatar(session.user);
      }

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
    // Kept on this device only; see removeEmbeddedAvatar for why it is not
    // written to user_metadata.
    setProfile(updated);

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