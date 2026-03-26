/**
 * Sözleşme PDF oluşturma – misafir verisi ile HTML üretip expo-print ile PDF, paylaşım.
 * İmza yoksa da PDF üretilir (web onayı vb.). Web'de yazdır penceresi fallback.
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDateTime } from '@/lib/date';

export type GuestForPdf = {
  full_name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  verified_at: string | null;
  created_at: string;
  signature_data?: string | null;
  rooms: { room_number: string } | null;
  contract_templates: { title: string; content: string } | null;
  total_amount_net?: number | null;
  nights_count?: number | null;
  vat_amount?: number | null;
  accommodation_tax_amount?: number | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function buildContractHtml(guest: GuestForPdf): string {
  const name = escapeHtml(guest.full_name);
  const phone = guest.phone ? escapeHtml(guest.phone) : '—';
  const email = guest.email ? escapeHtml(guest.email) : '—';
  const idNo = guest.id_number ? escapeHtml(guest.id_number) : '—';
  const room = guest.rooms?.room_number ? escapeHtml(String(guest.rooms.room_number)) : '—';
  const date = formatDateTime(guest.verified_at ?? guest.created_at);
  const title = guest.contract_templates?.title
    ? escapeHtml(guest.contract_templates.title)
    : 'Konaklama Sözleşmesi';
  const content = guest.contract_templates?.content
    ? escapeHtml(guest.contract_templates.content).replace(/\n/g, '<br/>')
    : '';
  const sigImg = guest.signature_data
    ? `<img src="${guest.signature_data}" alt="İmza" style="max-width:280px;height:auto;margin-top:16px;" />`
    : '<p style="color:#64748b;font-style:italic;">Onay web veya uygulama üzerinden alındı; dijital imza görseli kayıtlı değil.</p>';

  const nightsLine =
    guest.nights_count != null && guest.nights_count > 0
      ? `<p><strong>Konaklama süresi:</strong> ${guest.nights_count} gece</p>`
      : '';
  const totalNet = guest.total_amount_net != null ? Number(guest.total_amount_net) : null;
  const priceLine =
    totalNet != null && totalNet >= 0
      ? `<p><strong>Toplam konaklama bedeli (net):</strong> ${fmtMoney(totalNet)} ₺</p>`
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #1a202c; font-size: 14px; line-height: 1.5; }
    h1 { font-size: 18px; margin-bottom: 16px; color: #1a365d; }
    .info { background: #f7fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
    .info p { margin: 4px 0; }
    .contract { white-space: pre-wrap; margin: 16px 0; }
    .signature { margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Valoria Hotel – ${title}</h1>
  <div class="info">
    <p><strong>Misafir:</strong> ${name}</p>
    <p><strong>Telefon:</strong> ${phone}</p>
    <p><strong>E-posta:</strong> ${email}</p>
    <p><strong>Kimlik No:</strong> ${idNo}</p>
    <p><strong>Oda:</strong> ${room}</p>
    <p><strong>Onay Tarihi:</strong> ${date}</p>
    ${nightsLine}
    ${priceLine}
  </div>
  <div class="contract">${content}</div>
  <div class="signature">
    <p><strong>Dijital imza:</strong></p>
    ${sigImg}
  </div>
</body>
</html>`;
}

/** Web'de HTML'i yeni pencerede açar; kullanıcı Ctrl+P ile PDF'e yazdırabilir. */
export function openContractPrintWindow(guest: GuestForPdf): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const html = buildContractHtml(guest);
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export async function exportContractPdf(guest: GuestForPdf): Promise<string> {
  const html = buildContractHtml(guest);
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
  });
  return uri;
}

export async function shareContractPdf(guest: GuestForPdf): Promise<void> {
  if (Platform.OS === 'web') {
    openContractPrintWindow(guest);
    return;
  }
  try {
    const uri = await exportContractPdf(guest);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Sözleşmeyi Kaydet' });
    } else {
      throw new Error(`PDF hazır: ${uri}`);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('PDF hazır')) {
      openContractPrintWindow(guest);
      return;
    }
    throw e;
  }
}
