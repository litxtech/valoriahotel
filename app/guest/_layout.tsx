import { Stack } from 'expo-router';

export default function GuestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="contract" />
      <Stack.Screen name="form" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="sign" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
