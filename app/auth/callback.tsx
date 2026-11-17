import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/data/supabase';
import { Button, Page, T } from '../../src/ui/components';
export default function Callback() {
  const params = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void (async () => {
      try {
        if (!supabase) throw new Error('Cloud not configured.');
        const url = Platform.OS === 'web' ? window.location.href : await Linking.getInitialURL();
        const fragment = new URLSearchParams(url?.split('#')[1] ?? '');
        let authError;
        if (fragment.get('access_token')) {
          const r = await supabase.auth.setSession({
            access_token: fragment.get('access_token')!,
            refresh_token: fragment.get('refresh_token') ?? '',
          });
          authError = r.error;
        } else if (params.code) {
          const r = await supabase.auth.exchangeCodeForSession(params.code);
          authError = r.error;
        } else
          throw new Error(
            'Open your sign-in email link again, or enter its one-time code in Profile.',
          );
        if (authError) throw authError;
        if (Platform.OS === 'web') window.history.replaceState(null, '', '/auth/callback');
        router.replace('/profile');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed.');
      }
    })();
  }, [params.code]);
  return (
    <Page title="Sign in">
      <T>{error ?? 'Completing sign-in…'}</T>
      {error ? <Button title="Back to Profile" onPress={() => router.replace('/profile')} /> : null}
    </Page>
  );
}
