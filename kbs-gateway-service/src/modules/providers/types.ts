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
  // TODO(real provider mapping required): include normalized fields
};

export type SubmitCheckOutPayload = {
  hotelId: string;
  guestDocumentId: string;
  stayAssignmentId: string;
  transactionId: string;
  // TODO(real provider mapping required)
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

