import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderCredentials } from '../providers/types.js';
import { decrypt } from '../../shared/security/crypto.js';

export async function loadHotelCredentials(args: {
  supabase: SupabaseClient;
  hotelId: string;
  secret: string;
}): Promise<ProviderCredentials> {
  const { supabase, hotelId, secret } = args;
  const { data, error } = await supabase
    .schema('ops')
    .from('hotel_kbs_credentials')
    .select('facility_code, username, password_encrypted, api_key_encrypted, provider_type, is_active')
    .eq('hotel_id', hotelId)
    .maybeSingle();
  if (error || !data) throw new Error('CREDENTIALS_NOT_FOUND');
  if (data.is_active === false) throw new Error('CREDENTIALS_INACTIVE');

  const password = decrypt(data.password_encrypted, secret);
  const apiKey = data.api_key_encrypted ? decrypt(data.api_key_encrypted, secret) : null;

  return {
    facilityCode: data.facility_code,
    username: data.username,
    password,
    apiKey,
    providerType: data.provider_type
  };
}

