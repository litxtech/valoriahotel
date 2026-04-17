import { parse } from 'mrz';
import type { ParsedDocument } from './types';

function cleanMrz(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

export function parseMrzToNormalized(rawMrz: string): ParsedDocument {
  const raw = cleanMrz(rawMrz);
  const warnings: string[] = [];

  try {
    // mrz.parse expects lines array or string; keep as string
    const res: any = parse(raw);

    const docTypeRaw = String(res?.format ?? '').toLowerCase();
    const documentType: ParsedDocument['documentType'] =
      docTypeRaw.includes('td1') || docTypeRaw.includes('td2') || docTypeRaw.includes('td3')
        ? 'passport'
        : 'other';

    const firstName = res?.fields?.firstName ?? res?.fields?.givenNames ?? null;
    const lastName = res?.fields?.lastName ?? res?.fields?.surname ?? null;
    const fullName =
      res?.fields?.name
        ? String(res.fields.name)
        : [firstName, lastName].filter(Boolean).join(' ').trim() || null;

    const checksumsValid =
      typeof res?.valid === 'boolean' ? res.valid : (typeof res?.validCheckDigits === 'boolean' ? res.validCheckDigits : null);
    if (checksumsValid === false) warnings.push('MRZ checksum validation failed');

    return {
      documentType,
      fullName,
      firstName: firstName ? String(firstName) : null,
      lastName: lastName ? String(lastName) : null,
      middleName: null,
      documentNumber: res?.fields?.documentNumber ? String(res.fields.documentNumber) : null,
      nationalityCode: res?.fields?.nationality ? String(res.fields.nationality) : null,
      issuingCountryCode: res?.fields?.issuingCountry ? String(res.fields.issuingCountry) : null,
      birthDate: res?.fields?.birthDate ? String(res.fields.birthDate) : null,
      expiryDate: res?.fields?.expirationDate ? String(res.fields.expirationDate) : null,
      gender: res?.fields?.sex ? (String(res.fields.sex).toUpperCase() as any) : null,
      rawMrz: raw,
      confidence: null,
      checksumsValid,
      warnings,
    };
  } catch (e) {
    return {
      documentType: 'other',
      fullName: null,
      firstName: null,
      lastName: null,
      middleName: null,
      documentNumber: null,
      nationalityCode: null,
      issuingCountryCode: null,
      birthDate: null,
      expiryDate: null,
      gender: null,
      rawMrz: raw,
      confidence: null,
      checksumsValid: null,
      warnings: ['MRZ parse failed'],
    };
  }
}

