import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, usePathname } from 'expo-router';

const GUEST_BG = '#1a365d';
const SIGN_ONE_BG = '#ffffff';

export default function GuestLayout() {
  const pathname = usePathname();
  const isSignOne = pathname?.includes('sign-one') ?? false;
  const pageBg = isSignOne ? SIGN_ONE_BG : GUEST_BG;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = pageBg;
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [pageBg]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: isSignOne ? { backgroundColor: SIGN_ONE_BG } : undefined,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="contract" />
      <Stack.Screen name="form" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="sign" />
      <Stack.Screen name="sign-one" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
