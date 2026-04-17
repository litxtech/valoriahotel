export type ProviderCredentials = {
  facilityCode: string;
  username: string;
  password: string;
  apiKey?: string | null;
  providerType: string;
};

export type SubmitCheckInPayload = {
  hotelId: string;
  guestDocumentId: string;
  stayAssignmentId: string;
  transactionId: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  documentNumber?: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
  birthDate?: string | null; // ISO yyyy-mm-dd preferred
  gender?: 'M' | 'F' | 'X' | null;
  roomNumber?: string | null;
  checkInAt?: string | null; // ISO datetime preferred
};

export type SubmitCheckOutPayload = {
  hotelId: string;
  guestDocumentId: string;
  stayAssignmentId: string;
  transactionId: string;
  documentNumber?: string | null;
  roomNumber?: string | null;
  checkOutAt?: string | null; // ISO datetime preferred
};

export type ProviderResponse = {
  externalReference?: string;
  summary?: unknown;
};

export type ProviderTestResponse = {
  ok: boolean;
  message: string;
  details?: unknown;
};

export interface OfficialSubmissionProvider {
  submitCheckIn(payload: SubmitCheckInPayload, credentials: ProviderCredentials): Promise<ProviderResponse>;
  submitCheckOut(payload: SubmitCheckOutPayload, credentials: ProviderCredentials): Promise<ProviderResponse>;
  submitUpdate?(payload: unknown, credentials: ProviderCredentials): Promise<ProviderResponse>;
  testConnection(credentials: ProviderCredentials): Promise<ProviderTestResponse>;
}

