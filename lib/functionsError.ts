import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * Edge function 4xx/5xx döndüğünde Supabase client sadece generic mesaj veriyor.
 * Gerçek hata mesajını FunctionsHttpError.context'ten çıkarır.
 */
export async function getEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const ctx = error.context as { json?: () => Promise<unknown> };
      if (typeof ctx?.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string') {
          return (body as { error: string }).error;
        }
      }
    } catch {
      // fallback
    }
  }
  return (error as Error)?.message ?? 'Bilinmeyen hata';
}
