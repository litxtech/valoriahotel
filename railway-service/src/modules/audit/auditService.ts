import type { SupabaseClient } from '@supabase/supabase-js';

export async function writeAudit(args: {
  supabase: SupabaseClient;
  hotelId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, hotelId, actorUserId, action, entityType, entityId, metadata } = args;
  await supabase.schema('ops').from('audit_logs').insert({
    hotel_id: hotelId,
    actor_user_id: actorUserId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    metadata: metadata ?? null
  });
}

