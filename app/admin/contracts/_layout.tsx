import { TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ContractsLayout() {
  const router = useRouter();
  const headerLeft = () => (
    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, padding: 8 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Ionicons name="arrow-back" size={24} color="#1a202c" />
    </TouchableOpacity>
  );
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1a202c',
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerLeft,
      }}
    >
      <Stack.Screen name="form-fields" options={{ title: 'Hangi bilgi alınacak' }} />
      <Stack.Screen name="all" options={{ title: 'Tüm Sözleşmelerim' }} />
    </Stack>
  );
}
