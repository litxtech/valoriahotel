import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AdminDashboard() {
  const router = useRouter();
  const { staff, signOut } = useAuthStore();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {staff ? (
        <Text style={styles.welcome}>Hoş geldiniz, {staff.full_name || staff.email}</Text>
      ) : null}
      <Link href="/admin/rooms" asChild>
        <TouchableOpacity style={styles.card}>
          <Text style={styles.cardTitle}>Oda Yönetimi</Text>
          <Text style={styles.cardDesc}>Oda ekle/düzenle, QR kod, durum</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/admin/guests" asChild>
        <TouchableOpacity style={styles.card}>
          <Text style={styles.cardTitle}>Misafirler</Text>
          <Text style={styles.cardDesc}>Onay bekleyen ve kayıtlı misafirler</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/admin/checkin" asChild>
        <TouchableOpacity style={styles.card}>
          <Text style={styles.cardTitle}>Check-in / Check-out</Text>
          <Text style={styles.cardDesc}>Oda atama, giriş-çıkış</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/admin/contracts" asChild>
        <TouchableOpacity style={styles.card}>
          <Text style={styles.cardTitle}>Sözleşme Yönetimi</Text>
          <Text style={styles.cardDesc}>Şablonlar, çoklu dil</Text>
        </TouchableOpacity>
      </Link>
      <TouchableOpacity style={styles.logout} onPress={handleSignOut}>
        <Text style={styles.logoutText}>Çıkış</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  welcome: { fontSize: 16, color: '#4a5568', marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c' },
  cardDesc: { fontSize: 14, color: '#718096', marginTop: 4 },
  logout: { marginTop: 32, padding: 16, alignItems: 'center' },
  logoutText: { color: '#e53e3e', fontWeight: '600' },
});
