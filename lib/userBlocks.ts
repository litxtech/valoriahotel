import { supabase } from '@/lib/supabase';

type BlockRow = {
  id?: string;
  blocker_type: 'staff' | 'guest';
  blocker_staff_id: string | null;
  blocker_guest_id: string | null;
  blocked_type: 'staff' | 'guest';
  blocked_staff_id: string | null;
  blocked_guest_id: string | null;
};

export type BlockedUserItem = {
  blockId: string;
  blockedType: 'staff' | 'guest';
  blockedId: string;
  name: string;
  subtitle?: string;
};

export type HiddenUsers = {
  hiddenStaffIds: Set<string>;
  hiddenGuestIds: Set<string>;
};

function parseHidden(rows: BlockRow[], self: { type: 'staff' | 'guest'; id: string }): HiddenUsers {
  const hiddenStaffIds = new Set<string>();
  const hiddenGuestIds = new Set<string>();

  for (const row of rows) {
    const selfIsBlocker =
      (self.type === 'staff' && row.blocker_staff_id === self.id) ||
      (self.type === 'guest' && row.blocker_guest_id === self.id);
    const selfIsBlocked =
      (self.type === 'staff' && row.blocked_staff_id === self.id) ||
      (self.type === 'guest' && row.blocked_guest_id === self.id);

    if (!selfIsBlocker && !selfIsBlocked) continue;

    if (selfIsBlocker) {
      if (row.blocked_staff_id) hiddenStaffIds.add(row.blocked_staff_id);
      if (row.blocked_guest_id) hiddenGuestIds.add(row.blocked_guest_id);
    } else {
      if (row.blocker_staff_id) hiddenStaffIds.add(row.blocker_staff_id);
      if (row.blocker_guest_id) hiddenGuestIds.add(row.blocker_guest_id);
    }
  }

  return { hiddenStaffIds, hiddenGuestIds };
}

export async function getHiddenUsersForGuest(guestId: string): Promise<HiddenUsers> {
  const { data } = await supabase
    .from('user_blocks')
    .select('blocker_type, blocker_staff_id, blocker_guest_id, blocked_type, blocked_staff_id, blocked_guest_id')
    .or(`blocker_guest_id.eq.${guestId},blocked_guest_id.eq.${guestId}`);
  return parseHidden((data ?? []) as BlockRow[], { type: 'guest', id: guestId });
}

export async function getHiddenUsersForStaff(staffId: string): Promise<HiddenUsers> {
  const { data } = await supabase
    .from('user_blocks')
    .select('blocker_type, blocker_staff_id, blocker_guest_id, blocked_type, blocked_staff_id, blocked_guest_id')
    .or(`blocker_staff_id.eq.${staffId},blocked_staff_id.eq.${staffId}`);
  return parseHidden((data ?? []) as BlockRow[], { type: 'staff', id: staffId });
}

export async function blockUserForGuest(params: {
  blockerGuestId: string;
  blockedType: 'staff' | 'guest';
  blockedId: string;
}) {
  const payload =
    params.blockedType === 'staff'
      ? {
          blocker_type: 'guest',
          blocker_guest_id: params.blockerGuestId,
          blocked_type: 'staff',
          blocked_staff_id: params.blockedId,
        }
      : {
          blocker_type: 'guest',
          blocker_guest_id: params.blockerGuestId,
          blocked_type: 'guest',
          blocked_guest_id: params.blockedId,
        };
  return supabase.from('user_blocks').insert(payload);
}

export async function blockUserForStaff(params: {
  blockerStaffId: string;
  blockedType: 'staff' | 'guest';
  blockedId: string;
}) {
  const payload =
    params.blockedType === 'staff'
      ? {
          blocker_type: 'staff',
          blocker_staff_id: params.blockerStaffId,
          blocked_type: 'staff',
          blocked_staff_id: params.blockedId,
        }
      : {
          blocker_type: 'staff',
          blocker_staff_id: params.blockerStaffId,
          blocked_type: 'guest',
          blocked_guest_id: params.blockedId,
        };
  return supabase.from('user_blocks').insert(payload);
}

export async function listBlockedUsersForGuest(guestId: string): Promise<BlockedUserItem[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id, blocked_type, blocked_staff_id, blocked_guest_id')
    .eq('blocker_type', 'guest')
    .eq('blocker_guest_id', guestId)
    .order('created_at', { ascending: false });
  if (error) return [];

  const rows = (data ?? []) as {
    id: string;
    blocked_type: 'staff' | 'guest';
    blocked_staff_id: string | null;
    blocked_guest_id: string | null;
  }[];
  const staffIds = [...new Set(rows.map((r) => r.blocked_staff_id).filter(Boolean))] as string[];
  const guestIds = [...new Set(rows.map((r) => r.blocked_guest_id).filter(Boolean))] as string[];

  const [staffRes, guestRes] = await Promise.all([
    staffIds.length
      ? supabase.from('staff').select('id, full_name, department').in('id', staffIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; department: string | null }[] }),
    guestIds.length
      ? supabase.from('guests').select('id, full_name, room_id').in('id', guestIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; room_id: string | null }[] }),
  ]);

  const staffMap = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
  const guestMap = new Map((guestRes.data ?? []).map((g) => [g.id, g]));

  return rows
    .map((r) => {
      const blockedId = r.blocked_staff_id ?? r.blocked_guest_id;
      if (!blockedId) return null;
      if (r.blocked_type === 'staff') {
        const s = staffMap.get(blockedId);
        return {
          blockId: r.id,
          blockedType: 'staff' as const,
          blockedId,
          name: s?.full_name?.trim() || 'Personel',
          subtitle: s?.department?.trim() || 'Personel',
        };
      }
      const g = guestMap.get(blockedId);
      return {
        blockId: r.id,
        blockedType: 'guest' as const,
        blockedId,
        name: g?.full_name?.trim() || 'Misafir',
        subtitle: 'Misafir',
      };
    })
    .filter(Boolean) as BlockedUserItem[];
}

export async function listBlockedUsersForStaff(staffId: string): Promise<BlockedUserItem[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id, blocked_type, blocked_staff_id, blocked_guest_id')
    .eq('blocker_type', 'staff')
    .eq('blocker_staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) return [];

  const rows = (data ?? []) as {
    id: string;
    blocked_type: 'staff' | 'guest';
    blocked_staff_id: string | null;
    blocked_guest_id: string | null;
  }[];
  const staffIds = [...new Set(rows.map((r) => r.blocked_staff_id).filter(Boolean))] as string[];
  const guestIds = [...new Set(rows.map((r) => r.blocked_guest_id).filter(Boolean))] as string[];

  const [staffRes, guestRes] = await Promise.all([
    staffIds.length
      ? supabase.from('staff').select('id, full_name, department').in('id', staffIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; department: string | null }[] }),
    guestIds.length
      ? supabase.from('guests').select('id, full_name, room_id').in('id', guestIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; room_id: string | null }[] }),
  ]);

  const staffMap = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
  const guestMap = new Map((guestRes.data ?? []).map((g) => [g.id, g]));

  return rows
    .map((r) => {
      const blockedId = r.blocked_staff_id ?? r.blocked_guest_id;
      if (!blockedId) return null;
      if (r.blocked_type === 'staff') {
        const s = staffMap.get(blockedId);
        return {
          blockId: r.id,
          blockedType: 'staff' as const,
          blockedId,
          name: s?.full_name?.trim() || 'Personel',
          subtitle: s?.department?.trim() || 'Personel',
        };
      }
      const g = guestMap.get(blockedId);
      return {
        blockId: r.id,
        blockedType: 'guest' as const,
        blockedId,
        name: g?.full_name?.trim() || 'Misafir',
        subtitle: 'Misafir',
      };
    })
    .filter(Boolean) as BlockedUserItem[];
}

export async function unblockUserForGuest(params: { blockerGuestId: string; blockedType: 'staff' | 'guest'; blockedId: string }) {
  let q = supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_type', 'guest')
    .eq('blocker_guest_id', params.blockerGuestId)
    .eq('blocked_type', params.blockedType);
  if (params.blockedType === 'staff') q = q.eq('blocked_staff_id', params.blockedId);
  else q = q.eq('blocked_guest_id', params.blockedId);
  return q;
}

export async function unblockUserForStaff(params: { blockerStaffId: string; blockedType: 'staff' | 'guest'; blockedId: string }) {
  let q = supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_type', 'staff')
    .eq('blocker_staff_id', params.blockerStaffId)
    .eq('blocked_type', params.blockedType);
  if (params.blockedType === 'staff') q = q.eq('blocked_staff_id', params.blockedId);
  else q = q.eq('blocked_guest_id', params.blockedId);
  return q;
}
