import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PrtgSensor {
  objid: number;
  sensor: string;
  device: string;
  status: string;
  status_raw: number;
  message_raw?: string;
}

/**
 * PrtgClient — akses PRTG HTTP API (table.json) dgn username+passhash.
 * status_raw: 3=Up, 4=Warning, 5=Down, 13=DownAck, 14=DownPartial
 */
@Injectable()
export class PrtgClient {
  private readonly logger = new Logger('PrtgClient');

  constructor(private config: ConfigService) {}

  get baseUrl(): string {
    return (this.config.get<string>('PRTG_BASE_URL') || '').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return !!this.baseUrl && !!this.config.get('PRTG_USERNAME') && !!this.config.get('PRTG_PASSHASH');
  }

  private authQs(): string {
    return `username=${encodeURIComponent(this.config.get('PRTG_USERNAME') ?? '')}&passhash=${encodeURIComponent(this.config.get('PRTG_PASSHASH') ?? '')}`;
  }

  // Semua sensor berstatus Down (5) / DownPartial (14)
  async getDownSensors(): Promise<PrtgSensor[]> {
    const url =
      `${this.baseUrl}/api/table.json?content=sensors` +
      `&columns=objid,sensor,device,status,message` +
      `&filter_status=5&filter_status=14&count=200&${this.authQs()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`PRTG API error ${res.status}`);
    const json: any = await res.json();
    return (json.sensors ?? []) as PrtgSensor[];
  }
}
