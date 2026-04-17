export type RoomStayHistoryGuest = {
  id?: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  id_number?: string | null;
  id_type?: string | null;
  status?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  nights_count?: number | null;
  room_type?: string | null;
  adults?: number | null;
  children?: number | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  photo_url?: string | null;
  created_at?: string | null;
  total_amount_net?: number | string | null;
  vat_amount?: number | string | null;
  accommodation_tax_amount?: number | string | null;
};

export type RoomStayHistoryStaff = {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
};

export type RoomStayHistoryRow = {
  acceptance_id: string;
  accepted_at: string;
  contract_lang: string;
  contract_version: number;
  source: string;
  token: string;
  assigned_at: string | null;
  contract_title: string | null;
  guest: RoomStayHistoryGuest | null;
  assigned_staff: RoomStayHistoryStaff | null;
};

export function parseRoomStayHistoryRpc(data: unknown): RoomStayHistoryRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as RoomStayHistoryRow[];
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data) as unknown;
      return Array.isArray(p) ? (p as RoomStayHistoryRow[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Çıkış > giriş > sözleşme onayı — en güncel üstte (RPC ile aynı mantık, yedek sıralama). */
export function sortRoomStayHistoryRows(rows: RoomStayHistoryRow[]): RoomStayHistoryRow[] {
  const ts = (r: RoomStayHistoryRow) => {
    const raw = r.guest?.check_out_at ?? r.guest?.check_in_at ?? r.accepted_at;
    const n = raw ? Date.parse(String(raw)) : 0;
    return Number.isFinite(n) ? n : 0;
  };
  return [...rows].sort((a, b) => ts(b) - ts(a));
}
