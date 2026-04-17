import type {
  OfficialSubmissionProvider,
  ProviderCredentials,
  ProviderResponse,
  ProviderTestResponse,
  SubmitCheckInPayload,
  SubmitCheckOutPayload
} from './types.js';

export class MockOfficialProvider implements OfficialSubmissionProvider {
  constructor(private readonly mode: { failCheckIn?: boolean; failCheckOut?: boolean } = {}) {}

  async submitCheckIn(payload: SubmitCheckInPayload, _credentials: ProviderCredentials): Promise<ProviderResponse> {
    if (this.mode.failCheckIn) {
      throw new Error('MOCK_FAIL_CHECKIN');
    }
    return {
      externalReference: `mock-checkin-${payload.transactionId}`,
      summary: { message: 'Mock check-in accepted' }
    };
  }

  async submitCheckOut(payload: SubmitCheckOutPayload, _credentials: ProviderCredentials): Promise<ProviderResponse> {
    if (this.mode.failCheckOut) {
      throw new Error('MOCK_FAIL_CHECKOUT');
    }
    return {
      externalReference: `mock-checkout-${payload.transactionId}`,
      summary: { message: 'Mock check-out accepted' }
    };
  }

  async testConnection(_credentials: ProviderCredentials): Promise<ProviderTestResponse> {
    return { ok: true, message: 'Mock provider connection ok' };
  }
}

