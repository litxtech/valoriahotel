import type { SupabaseClient } from '@supabase/supabase-js';

export async function hasPermission(args: {
  supabase: SupabaseClient;
  hotelId: string;
  userId: string;
  code: string;
}): Promise<boolean> {
  const { supabase, hotelId, userId, code } = args;
  const { data, error } = await supabase
    .schema('ops')
    .from('user_permissions')
    .select('is_allowed')
    .eq('hotel_id', hotelId)
    .eq('user_id', userId)
    .eq('permission_code', code)
    .maybeSingle();

  if (error) return false;
  return data?.is_allowed === true;
}

