import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GatewayClient } from '../../integrations/gateway-client/gatewayClient.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';
import { writeAudit } from '../audit/auditService.js';
import { Errors } from '../../shared/errors/appError.js';

const SubmitSingleSchema = z.object({
  guestDocumentId: z.string().uuid(),
  stayAssignmentId: z.string().uuid()
});

export const submissionsRoutes: FastifyPluginAsync = async (app) => {
  const gw = new GatewayClient({ baseUrl: app.env.GATEWAY_BASE_URL, sharedSecret: app.env.GATEWAY_SHARED_SECRET });

  app.post('/submissions/check-in', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const body = SubmitSingleSchema.parse(req.body);
    const allowed = auth.role === 'admin'
      ? true
      : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.submit.single' });
    assertHasPermission(allowed, 'kbs.submit.single', auth);

    // Resolve guest_id from guest_documents and ensure same hotel.
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id, scan_status')
      .eq('id', body.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    // Create transaction first (idempotency handled by unique index in ops.official_submission_transactions)
    const idempotencyKey = `${body.guestDocumentId}:${body.stayAssignmentId}:check_in`;

    const { data: tx, error: txErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .insert({
        hotel_id: auth.hotelId,
        guest_id: doc.guest_id,
        guest_document_id: body.guestDocumentId,
        stay_assignment_id: body.stayAssignmentId,
        transaction_type: 'check_in',
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
      action: 'kbs.submit.single',
      entityType: 'guest_document',
      entityId: body.guestDocumentId,
      metadata: { transactionId: tx.id }
    });

    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>('/gateway/check-in', {
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      stayAssignmentId: body.stayAssignmentId,
      transactionId: tx.id
      // TODO(real provider mapping required): include normalized payload fields
    });

    if (!gwRes.ok) {
      await app.supabase
        .schema('ops')
        .from('official_submission_transactions')
        .update({ status: 'failed', error_message: gwRes.error.message, updated_at: new Date().toISOString() })
        .eq('id', tx.id);
      return { ok: false, error: gwRes.error };
    }

    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({ status: 'submitted', external_reference: gwRes.data.externalReference ?? null, submitted_at: new Date().toISOString() })
      .eq('id', tx.id);

    // Best-effort status update (authoritative status is still ops tables).
    await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', body.guestDocumentId);
    await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_in' }).eq('id', body.stayAssignmentId);
    return { ok: true, data: { transactionId: tx.id, ...gwRes.data } };
  });
};

