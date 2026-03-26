import { supabase } from '@/lib/supabase';

/** Edge Function çağrısına güncel access_token ekler (RN'de invoke bazen header göndermeyebiliyor). */
export async function invokeEdgeWithAuth(functionName: string, body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return {
      data: null,
      error: Object.assign(new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.'), { name: 'AuthError' }),
    };
  }
  return supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
}
