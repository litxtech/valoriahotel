import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GatewayClient } from '../../integrations/gateway-client/gatewayClient.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';
import { writeAudit } from '../audit/auditService.js';
import { Errors } from '../../shared/errors/appError.js';

const CheckoutSingleSchema = z.object({
  guestDocumentId: z.string().uuid(),
  stayAssignmentId: z.string().uuid().optional()
});

export const checkoutRoutes: FastifyPluginAsync = async (app) => {
  const gw = new GatewayClient({ baseUrl: app.env.GATEWAY_BASE_URL, sharedSecret: app.env.GATEWAY_SHARED_SECRET });

  async function loadGatewayCheckoutContext(args: { hotelId: string; guestDocumentId: string; stayAssignmentId: string }) {
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, hotel_id, guest_id, document_number')
      .eq('id', args.guestDocumentId)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');

    const { data: stay, error: stayErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id, hotel_id, room_id, check_out_at')
      .eq('id', args.stayAssignmentId)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (stayErr || !stay) throw Errors.notFound('Stay assignment not found');

    const { data: room, error: roomErr } = await app.supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number')
      .eq('id', stay.room_id)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (roomErr || !room) throw Errors.notFound('Room not found');

    return {
      documentNumber: doc.document_number ?? null,
      roomNumber: room.room_number ?? null,
      checkOutAt: stay.check_out_at ? String(stay.check_out_at) : null
    };
  }

  async function resolveStayAssignmentId(args: { hotelId: string; guestDocumentId: string; stayAssignmentId?: string }): Promise<string> {
    if (args.stayAssignmentId) return args.stayAssignmentId;
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id')
      .eq('id', args.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== args.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const { data: stay, error: stayErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id')
      .eq('hotel_id', args.hotelId)
      .eq('guest_id', doc.guest_id)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stayErr || !stay) throw Errors.conflict('Active stay assignment not found');
    return stay.id as string;
  }

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

    const stayAssignmentId = await resolveStayAssignmentId({
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      ...(body.stayAssignmentId ? { stayAssignmentId: body.stayAssignmentId } : {})
    });
    const idempotencyKey = `${body.guestDocumentId}:${stayAssignmentId}:check_out`;

    const { data: tx, error: txErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .insert({
        hotel_id: auth.hotelId,
        guest_id: doc.guest_id,
        guest_document_id: body.guestDocumentId,
        stay_assignment_id: stayAssignmentId,
        transaction_type: 'check_out',
        provider: 'gateway',
        status: 'processing',
        idempotency_key: idempotencyKey,
        created_by: auth.authUserId
      })
      .select('id')
      .single();
    if (txErr || !tx) {
      const { data: existing, error: exErr } = await app.supabase
        .schema('ops')
        .from('official_submission_transactions')
        .select('id')
        .eq('hotel_id', auth.hotelId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (exErr || !existing) throw Errors.conflict('Transaction already exists or cannot be created');
      return { ok: true, data: { transactionId: existing.id, idempotent: true } };
    }

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.checkout.single',
      entityType: 'stay_assignment',
      entityId: stayAssignmentId,
      metadata: { transactionId: tx.id }
    });

    const ctx = await loadGatewayCheckoutContext({ hotelId: auth.hotelId, guestDocumentId: body.guestDocumentId, stayAssignmentId });
    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>('/gateway/check-out', {
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      stayAssignmentId,
      transactionId: tx.id,
      ...ctx,
      checkOutAt: new Date().toISOString()
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

    await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_out', check_out_at: new Date().toISOString() }).eq('id', stayAssignmentId);
    await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'checked_out', checked_out_at: new Date().toISOString() }).eq('id', body.guestDocumentId);

    return { ok: true, data: { transactionId: tx.id, ...gwRes.data } };
  });
};

