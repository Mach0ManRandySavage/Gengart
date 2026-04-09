import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { Readable } from 'stream';
import type { Settings } from '../../types';

export interface OtpResult {
  code:   string;
  from:   string;
  subject: string;
}

export class ImapClient {
  private imap:     Imap | null = null;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user:     this.settings.imap_user,
        password: this.settings.imap_password,
        host:     this.settings.imap_host,
        port:     this.settings.imap_port,
        tls:      this.settings.imap_tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15_000,
        authTimeout: 15_000,
      });

      this.imap.once('ready',  resolve);
      this.imap.once('error',  reject);
      this.imap.once('end',    () => { this.imap = null; });
      this.imap.connect();
    });
  }

  private openInbox(): Promise<Imap.Box> {
    return new Promise((resolve, reject) => {
      this.imap!.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);
        else     resolve(box);
      });
    });
  }

  /**
   * Poll for OTP/verification emails matching `fromPattern`.
   * Searches unseen messages from the last `withinSeconds` seconds.
   */
  async pollForOtp(fromPattern: string, withinSeconds = 120): Promise<OtpResult | null> {
    try {
      if (!this.imap) await this.connect();
      await this.openInbox();

      const since = new Date(Date.now() - withinSeconds * 1000);
      const sinceStr = since.toLocaleDateString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric',
      });

      const uids: number[] = await new Promise((resolve, reject) => {
        this.imap!.search(['UNSEEN', ['SINCE', sinceStr]], (err, results) => {
          if (err) reject(err);
          else     resolve(results ?? []);
        });
      });

      if (uids.length === 0) return null;

      // Fetch and parse each message
      for (const uid of uids.reverse()) {
        const mail = await this.fetchMessage(uid);
        if (!mail) continue;

        const from = mail.from?.text ?? '';
        if (!from.toLowerCase().includes(fromPattern.toLowerCase())) continue;

        const otp = this.extractOtp(mail.text ?? mail.html ?? '');
        if (otp) {
          await this.markSeen(uid);
          return { code: otp, from, subject: mail.subject ?? '' };
        }
      }

      return null;
    } catch (err) {
      console.error('IMAP error:', err);
      return null;
    }
  }

  /**
   * Wait for an OTP email with polling, up to `timeoutMs`.
   */
  async waitForOtp(
    fromPattern: string,
    timeoutMs  = 120_000,
    pollInterval = 5_000,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.pollForOtp(fromPattern);
      if (result) return result.code;
      await this.sleep(pollInterval);
    }

    return null;
  }

  private fetchMessage(uid: number): Promise<ParsedMail | null> {
    return new Promise((resolve) => {
      const fetch = this.imap!.fetch(uid, { bodies: '' });
      let parsed: ParsedMail | null = null;

      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          const chunks: Buffer[] = [];
          stream.on('data',  (c) => chunks.push(c));
          stream.on('end',   async () => {
            try {
              const readable = Readable.from(Buffer.concat(chunks));
              parsed = await simpleParser(readable);
            } catch { /* ignore */ }
          });
        });
      });

      fetch.once('error', () => resolve(null));
      fetch.once('end',   () => resolve(parsed));
    });
  }

  private markSeen(uid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap!.addFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  /**
   * Extract a 4–8 digit OTP from email body text.
   */
  private extractOtp(text: string): string | null {
    // Common OTP patterns
    const patterns = [
      /\b(\d{6})\b/,          // 6-digit code (most common)
      /\b(\d{4})\b/,          // 4-digit PIN
      /\b(\d{8})\b/,          // 8-digit code
      /code[:\s]+(\d{4,8})/i, // "code: 123456"
      /OTP[:\s]+(\d{4,8})/i,  // "OTP: 123456"
      /verification[:\s]+(\d{4,8})/i,
      /one.time[:\s]+(\d{4,8})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  disconnect(): void {
    try { this.imap?.end(); } catch { /* ignore */ }
    this.imap = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
