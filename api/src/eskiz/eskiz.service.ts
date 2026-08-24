import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { fetchWithTimeout } from '../common/http';

// Client for the Eskiz.uz SMS gateway (https://notify.eskiz.uz/api).
//
// Auth flow: POST /auth/login (email+password) returns a JWT good for ~30 days.
// It is cached in memory and refreshed transparently on 401 or when it ages
// out.
//
// With no credentials configured the service runs in MOCK mode: nothing is
// sent, and the message (OTP included) is written to the log. That is what
// lets the entire sign-in flow be developed and tested without spending money
// on SMS or depending on a third party being reachable.
@Injectable()
export class EskizService {
  private readonly logger = new Logger('EskizService');
  private readonly base = process.env.ESKIZ_BASE_URL || 'https://notify.eskiz.uz/api';
  private readonly email = process.env.ESKIZ_EMAIL || '';
  private readonly password = process.env.ESKIZ_PASSWORD || '';
  private readonly from = process.env.ESKIZ_FROM || '4546'; // 4546 = Eskiz test sender
  private token: string | null = null;
  private tokenAt = 0;
  private loginPromise: Promise<string> | null = null;

  get configured(): boolean {
    return !!(this.email && this.password);
  }
  get isMock(): boolean {
    return !this.configured;
  }

  // ── auth ──────────────────────────────────────────────────
  private async login(): Promise<string> {
    const fd = new FormData();
    fd.append('email', this.email);
    fd.append('password', this.password);
    const res = await fetchWithTimeout(`${this.base}/auth/login`, { method: 'POST', body: fd });
    const data: any = await res.json().catch(() => ({}));
    const token = data?.data?.token;
    if (!res.ok || !token) {
      throw new ServiceUnavailableException(
        'Eskiz login failed: ' + (data?.message || `HTTP ${res.status}`),
      );
    }
    this.token = token;
    this.tokenAt = Date.now();
    this.logger.log('Eskiz token obtained');
    return token;
  }

  private async ensureToken(force = false): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException('Eskiz not configured (ESKIZ_EMAIL/ESKIZ_PASSWORD)');
    }
    const stale = Date.now() - this.tokenAt > 25 * 24 * 60 * 60 * 1000; // well before 30d expiry
    if (!force && this.token && !stale) return this.token;
    // de-dupe concurrent logins
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  private async authedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await this.ensureToken();
    const res = await fetchWithTimeout(this.base + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && retry) {
      await this.ensureToken(true);
      return this.authedFetch(path, init, false);
    }
    return res;
  }

  // ── public API ────────────────────────────────────────────

  /// `phone` must already be normalised E.164 (+998…). Eskiz wants it without
  /// the plus sign.
  async sendSms(phone: string, message: string) {
    const mobile = phone.replace(/\D/g, '');

    if (this.isMock) {
      // Deliberately at warn level and un-truncated: in development this line
      // IS the SMS, and a developer signing in needs to find it in the noise.
      this.logger.warn(`[MOCK SMS] ${phone} :: ${message}`);
      return { mode: 'mock' as const, ok: true, id: 'mock-' + Date.now(), to: phone };
    }

    const fd = new FormData();
    fd.append('mobile_phone', mobile);
    fd.append('message', message);
    fd.append('from', this.from);
    const res = await this.authedFetch('/message/sms/send', { method: 'POST', body: fd });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.status === 'error') {
      throw new ServiceUnavailableException(
        'Eskiz send failed: ' + (data?.message || `HTTP ${res.status}`),
      );
    }
    return { mode: 'live' as const, ok: true, id: data?.id ?? data?.data?.id, to: phone };
  }

  async getBalance(): Promise<number | null> {
    try {
      const res = await this.authedFetch('/user/get-limit');
      const data: any = await res.json().catch(() => ({}));
      const bal = data?.data?.balance;
      return typeof bal === 'number' ? bal : bal != null ? Number(bal) : null;
    } catch {
      return null;
    }
  }

  async status() {
    if (this.isMock) {
      return { service: 'eskiz', configured: false, mode: 'mock' as const, sender: this.from };
    }
    try {
      const balance = await this.getBalance();
      return { service: 'eskiz', configured: true, mode: 'live' as const, sender: this.from, balance };
    } catch (e: any) {
      return {
        service: 'eskiz',
        configured: true,
        mode: 'live' as const,
        sender: this.from,
        error: e?.message || 'connection failed',
      };
    }
  }
}
