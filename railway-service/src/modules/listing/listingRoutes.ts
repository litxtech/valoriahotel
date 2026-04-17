import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ready-to-submit', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.submitted' });
    assertHasPermission(allowed, 'kbs.view.submitted', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, document_type, document_number, nationality_code, scan_status, updated_at, created_at, image_thumb_path')
      .eq('hotel_id', auth.hotelId)
      .eq('scan_status', 'ready_to_submit')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/submitted-passports', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.submitted' });
    assertHasPermission(allowed, 'kbs.view.submitted', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, document_type, document_number, nationality_code, scan_status, submitted_at, checked_out_at, last_error, image_thumb_path')
      .eq('hotel_id', auth.hotelId)
      .in('scan_status', ['submitted', 'checkout_pending', 'checked_out', 'failed'])
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/failed-transactions', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.failed' });
    assertHasPermission(allowed, 'kbs.view.failed', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id, transaction_type, status, retry_count, error_message, created_at, updated_at, guest_document_id, stay_assignment_id')
      .eq('hotel_id', auth.hotelId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/submissions/status/:transactionId', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const transactionId = z.string().uuid().parse((req.params as any).transactionId);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id, status, transaction_type, retry_count, error_message, external_reference, created_at, updated_at, submitted_at')
      .eq('id', transactionId)
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (error || !data) throw Errors.notFound('Transaction not found');
    return { ok: true, data };
  });
};

