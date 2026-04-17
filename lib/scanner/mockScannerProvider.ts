import type { ScannerProvider, ScanResult } from './types';
import { parseMrzToNormalized } from './mrzParser';

export class MockScannerProvider implements ScannerProvider {
  constructor(private readonly getMrz: () => Promise<string>) {}

  async scanOnce(): Promise<ScanResult> {
    const rawMrz = await this.getMrz();
    return { rawMrz, parsed: parseMrzToNormalized(rawMrz) };
  }
}

