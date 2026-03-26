import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { formatDateShort } from '@/lib/date';

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  status: string;
  expense_date: string;
  created_at: string;
  staff_id: string;
  staff: { full_name: string | null; department: string | null } | null;
  category: { name: string } | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

export default function AdminExpensesScreen() {
  const router = useRouter();
  const { staff: me } = useAuthStore();
  const [pending, setPending] = useState<ExpenseRow[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    thisMonthTotal: number;
    lastMonthTotal: number;
    pendingCount: number;
    pendingAmount: number;
    approvedThisMonth: number;
  }>({ thisMonthTotal: 0, lastMonthTotal: 0, pendingCount: 0, pendingAmount: 0, approvedThisMonth: 0 });
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    const { data: pendingData } = await supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    const pendingList = (pendingData ?? []) as ExpenseRow[];
    setPending(pendingList);

    const { data: allData } = await supabase
      .from('staff_expenses')
      .select('id, amount, description, receipt_image_url, status, expense_date, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name)')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    const allList = (allData ?? []) as ExpenseRow[];
    setAllExpenses(allList);

    const thisMonthApproved = allList.filter((e) => e.expense_date >= thisMonthStart && e.status === 'approved');
    const thisMonthTotal = allList.filter((e) => e.expense_date >= thisMonthStart).reduce((s, e) => s + Number(e.amount), 0);
    const lastMonthTotal = allList
      .filter((e) => e.expense_date >= lastMonthStart && e.expense_date <= lastMonthEnd && e.status === 'approved')
      .reduce((s, e) => s + Number(e.amount), 0);
    const pendingAmount = pendingList.reduce((s, e) => s + Number(e.amount), 0);
    const approvedThisMonth = thisMonthApproved.reduce((s, e) => s + Number(e.amount), 0);
    setSummary({
      thisMonthTotal,
      lastMonthTotal,
      pendingCount: pendingList.length,
      pendingAmount,
      approvedThisMonth,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const getExpenseSummary = (e: ExpenseRow) =>
    `${fmtMoney(Number(e.amount))} · ${formatDateShort(e.expense_date)} · ${e.category?.name ?? '—'}`;

  const approve = async (e: ExpenseRow) => {
    if (!me?.id) return;
    setActingId(e.id);
    const { error } = await supabase
      .from('staff_expenses')
      .update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', e.id);
    setActingId(null);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (e.staff_id) {
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama onaylandı',
        body: `Girdiğiniz harcama onaylandı: ${getExpenseSummary(e)}`,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me.id,
      });
    }
    load();
  };

  const reject = async (id: string) => {
    Alert.alert('Harcamayı reddet', 'Personel red gerekçesini daha sonra düzenleyebilirsiniz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          if (!me?.id) return;
          setActingId(id);
          const { error } = await supabase
            .from('staff_expenses')
            .update({
              status: 'rejected',
              approved_by: me.id,
              approved_at: new Date().toISOString(),
              rejection_reason: null,
            })
            .eq('id', id);
          setActingId(null);
          if (error) Alert.alert('Hata', error.message);
          else load();
        },
      },
    ]);
  };

  const percentChange = summary.lastMonthTotal > 0
    ? ((summary.approvedThisMonth - summary.lastMonthTotal) / summary.lastMonthTotal) * 100
    : 0;

  const statusIcon = (s: string) => (s === 'approved' ? 'checkmark-circle' : s === 'rejected' ? 'close-circle' : 'time');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AdminCard>
          <Text style={styles.summaryTitle}>Genel özet</Text>
          <Text style={styles.summaryRow}>Bu ay toplam harcama: {fmtMoney(summary.thisMonthTotal)}</Text>
          <Text style={styles.summaryRow}>Geçen aya göre: {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(0)}%</Text>
          <Text style={styles.summaryRow}>Onay bekleyen: {summary.pendingCount} harcama ({fmtMoney(summary.pendingAmount)})</Text>
          <Text style={styles.summaryRow}>Bu ay onaylanan: {fmtMoney(summary.approvedThisMonth)}</Text>
        </AdminCard>

        <View style={styles.reportLinks}>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/expenses/by-category')} activeOpacity={0.8}>
            <Ionicons name="pie-chart-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.reportBtnText}>Kategori bazlı analiz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/expenses/by-staff')} activeOpacity={0.8}>
            <Ionicons name="people-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.reportBtnText}>Personel bazlı rapor</Text>
          </TouchableOpacity>
        </View>

        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Onay bekleyen harcamalar ({pending.length})</Text>
            <View style={styles.cardList}>
              {pending.map((e) => (
                <View key={e.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardStaff}>{e.staff?.full_name ?? '—'} · {formatDateShort(e.expense_date)}</Text>
                    <Text style={styles.cardAmount}>{fmtMoney(Number(e.amount))}</Text>
                  </View>
                  <Text style={styles.cardCategory}>{e.category?.name ?? '—'}</Text>
                  {e.description ? <Text style={styles.cardDesc} numberOfLines={2}>{e.description}</Text> : null}
                  <View style={styles.cardActions}>
                    {e.receipt_image_url ? (
                      <TouchableOpacity style={styles.receiptBtn} onPress={() => setReceiptModal(e.receipt_image_url!)}>
                        <Ionicons name="image-outline" size={18} color={adminTheme.colors.accent} />
                        <Text style={styles.receiptBtnText}>Fiş gör</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.approveRow}>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.approveBtnOk]}
                        onPress={() => approve(e)}
                        disabled={actingId === e.id}
                      >
                        {actingId === e.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.approveBtnText}>Onayla</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.approveBtnNo]}
                        onPress={() => reject(e.id)}
                        disabled={actingId === e.id}
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                        <Text style={styles.approveBtnText}>Reddet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Tüm harcamalar (son 50)</Text>
        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : (
          <View style={styles.table}>
            {allExpenses.slice(0, 20).map((e) => (
              <View key={e.id} style={styles.tableRow}>
                <Text style={styles.tableCellDate}>{formatDateShort(e.expense_date)}</Text>
                <Text style={styles.tableCellName} numberOfLines={1}>{e.staff?.full_name ?? '—'}</Text>
                <Text style={styles.tableCellCat} numberOfLines={1}>{e.category?.name ?? '—'}</Text>
                <Text style={styles.tableCellAmount}>{fmtMoney(Number(e.amount))}</Text>
                <View style={styles.tableCellStatus}>
                  <Ionicons name={statusIcon(e.status) as any} size={16} color={e.status === 'approved' ? adminTheme.colors.success : e.status === 'rejected' ? adminTheme.colors.error : adminTheme.colors.warning} />
                </View>
                {e.receipt_image_url ? (
                  <TouchableOpacity onPress={() => setReceiptModal(e.receipt_image_url!)}>
                    <Ionicons name="image" size={18} color={adminTheme.colors.accent} />
                  </TouchableOpacity>
                ) : <View style={{ width: 18 }} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!receiptModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReceiptModal(null)}>
          <View style={styles.modalContent}>
            {receiptModal ? (
              <CachedImage uri={receiptModal} style={styles.modalImage} contentFit="contain" />
            ) : null}
            <TouchableOpacity style={styles.modalClose} onPress={() => setReceiptModal(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  summaryRow: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  reportLinks: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  reportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  reportBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.accent },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  cardList: { gap: 12, marginBottom: 20 },
  card: { backgroundColor: adminTheme.colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: adminTheme.colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardStaff: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  cardAmount: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  cardCategory: { fontSize: 13, color: adminTheme.colors.textSecondary },
  cardDesc: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: adminTheme.colors.borderLight },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  receiptBtnText: { fontSize: 13, color: adminTheme.colors.accent, fontWeight: '600' },
  approveRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveBtnOk: { backgroundColor: adminTheme.colors.success },
  approveBtnNo: { backgroundColor: adminTheme.colors.error },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  loader: { marginVertical: 24 },
  table: { backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  tableCellDate: { width: 72, fontSize: 12, color: adminTheme.colors.textSecondary },
  tableCellName: { flex: 1, fontSize: 13, color: adminTheme.colors.text, maxWidth: 80 },
  tableCellCat: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted, maxWidth: 90 },
  tableCellAmount: { width: 72, fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  tableCellStatus: { width: 24, marginRight: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxHeight: '85%', alignItems: 'center' },
  modalImage: { width: '100%', height: 400, borderRadius: 8 },
  modalClose: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: adminTheme.colors.surface },
  modalCloseText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text },
});
