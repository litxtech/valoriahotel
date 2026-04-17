import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GatewayClient } from '../../integrations/gateway-client/gatewayClient.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';
import { writeAudit } from '../audit/auditService.js';
import { Errors } from '../../shared/errors/appError.js';

const CheckoutSingleSchema = z.object({
  guestDocumentId: z.string().uuid(),
  stayAssignmentId: z.string().uuid()
});

export const checkoutRoutes: FastifyPluginAsync = async (app) => {
  const gw = new GatewayClient({ baseUrl: app.env.GATEWAY_BASE_URL, sharedSecret: app.env.GATEWAY_SHARED_SECRET });

  app.post('/submissions/check-out', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const body = CheckoutSingleSchema.parse(req.body);

    const allowed = auth.role === 'admin'
      ? true
      : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.checkout.single' });
    assertHasPermission(allowed, 'kbs.checkout.single', auth);

    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id')
      .eq('id', body.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const idempotencyKey = `${body.guestDocumentId}:${body.stayAssignmentId}:check_out`;

    const { data: tx, error: txErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .insert({
        hotel_id: auth.hotelId,
        guest_id: doc.guest_id,
        guest_document_id: body.guestDocumentId,
        stay_assignment_id: body.stayAssignmentId,
        transaction_type: 'check_out',
        provider: 'gateway',
        status: 'processing',
        idempotency_key: idempotencyKey,
        created_by: auth.authUserId
      })
      .select('id')
      .single();
    if (txErr) throw Errors.conflict('Transaction already exists or cannot be created');

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.checkout.single',
      entityType: 'stay_assignment',
      entityId: body.stayAssignmentId,
      metadata: { transactionId: tx.id }
    });

    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>('/gateway/check-out', {
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      stayAssignmentId: body.stayAssignmentId,
      transactionId: tx.id
      // TODO(real provider mapping required)
    });

    if (!gwRes.ok) {
      await app.supabase.schema('ops').from('official_submission_transactions').update({ status: 'failed', error_message: gwRes.error.message }).eq('id', tx.id);
      return { ok: false, error: gwRes.error };
    }

    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({ status: 'submitted', external_reference: gwRes.data.externalReference ?? null, submitted_at: new Date().toISOString() })
      .eq('id', tx.id);

    await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_out', check_out_at: new Date().toISOString() }).eq('id', body.stayAssignmentId);
    await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'checked_out', checked_out_at: new Date().toISOString() }).eq('id', body.guestDocumentId);

    return { ok: true, data: { transactionId: tx.id, ...gwRes.data } };
  });
};

