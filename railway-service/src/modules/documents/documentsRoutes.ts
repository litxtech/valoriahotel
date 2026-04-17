import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { writeAudit } from '../audit/auditService.js';

const ParsedDocumentSchema = z.object({
  documentType: z.enum(['passport', 'id_card', 'residence_permit', 'other']),
  fullName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  middleName: z.string().nullable(),
  documentNumber: z.string().nullable(),
  nationalityCode: z.string().nullable(),
  issuingCountryCode: z.string().nullable(),
  birthDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  gender: z.enum(['M', 'F', 'X']).nullable(),
  rawMrz: z.string().nullable(),
  confidence: z.number().nullable(),
  checksumsValid: z.boolean().nullable(),
  warnings: z.array(z.string())
});

const UpsertSchema = z.object({
  arrivalGroupId: z.string().uuid().nullable().optional(),
  parsed: ParsedDocumentSchema,
  scanConfidence: z.number().nullable().optional(),
  rawMrz: z.string().nullable().optional()
});

export const documentsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/documents/upsert', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const body = UpsertSchema.parse(req.body);
    const fullName =
      body.parsed.fullName ??
      (([body.parsed.firstName, body.parsed.lastName].filter(Boolean).join(' ').trim() || null) as string | null);
    const birthDate = body.parsed.birthDate && body.parsed.birthDate.length >= 10 ? body.parsed.birthDate.slice(0, 10) : null;
    const expiryDate = body.parsed.expiryDate && body.parsed.expiryDate.length >= 10 ? body.parsed.expiryDate.slice(0, 10) : null;

    // Create guest
    const { data: guest, error: gErr } = await app.supabase
      .schema('ops')
      .from('guests')
      .insert({
        hotel_id: auth.hotelId,
        arrival_group_id: body.arrivalGroupId ?? null,
        full_name: fullName ?? 'UNKNOWN',
        first_name: body.parsed.firstName,
        last_name: body.parsed.lastName,
        middle_name: body.parsed.middleName,
        nationality_code: body.parsed.nationalityCode,
        gender: body.parsed.gender,
        birth_date: birthDate
      })
      .select('id')
      .single();
    if (gErr || !guest) throw Errors.internal('Failed to create guest');

    // Create document (unique constraint may conflict)
    const scanStatus =
      body.parsed.documentNumber && fullName ? 'ready_to_submit' : body.parsed.rawMrz ? 'scanned' : 'draft';

    const { data: doc, error: dErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .insert({
        guest_id: guest.id,
        hotel_id: auth.hotelId,
        document_type: body.parsed.documentType,
        document_number: body.parsed.documentNumber,
        issuing_country_code: body.parsed.issuingCountryCode,
        nationality_code: body.parsed.nationalityCode,
        expiry_date: expiryDate,
        raw_mrz: body.parsed.rawMrz ?? body.rawMrz ?? null,
        parsed_payload: body.parsed,
        scan_confidence: body.scanConfidence ?? body.parsed.confidence ?? null,
        scan_status: scanStatus
      })
      .select('id, scan_status')
      .single();

    if (dErr || !doc) {
      // If unique constraint hits, return conflict instead of creating duplicates.
      throw Errors.conflict('Document already exists for this hotel');
    }

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'document.upsert',
      entityType: 'guest_document',
      entityId: doc.id,
      metadata: { scan_status: doc.scan_status }
    });

    return { ok: true, data: { guestId: guest.id, guestDocumentId: doc.id, scanStatus: doc.scan_status } };
  });
};

