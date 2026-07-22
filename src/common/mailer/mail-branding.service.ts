import { Injectable } from '@nestjs/common';

export interface BrandedEmail {
  html: string;
  logoAttachment?: { filename: string; content: Buffer; cid: string; contentType: string };
}

/**
 * MailBrandingService — membungkus isi email dengan header (logo + nama
 * perusahaan) dan footer (alamat, kontak, disclaimer) otomatis berdasarkan
 * AppSetting. Diekstrak dari EmailService supaya dipakai bersama oleh email
 * per-user (menu Email) DAN MailerService sistem (noreply) — satu sumber
 * kebenaran untuk tampilan email keluar.
 */
@Injectable()
export class MailBrandingService {
  private parseLogoDataUrl(dataUrl?: string): { buffer: Buffer; contentType: string } | null {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
  }

  /** Settings (company_name dkk) diisi lewat form admin biasa, bukan input
   * tepercaya — kalau mengandung "<"/'"' harus lolos sebagai teks apa adanya,
   * bukan ikut jadi HTML/atribut, di setiap email yang keluar. */
  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  build(bodyHtml: string, settingsRaw: Record<string, string>): BrandedEmail {
    const settings = Object.fromEntries(
      Object.entries(settingsRaw).map(([k, v]) => [k, this.escapeHtml(String(v ?? ''))]),
    );
    const name = settings.company_name || 'Next1';
    const tagline = settings.company_tagline || '';
    const address = [settings.company_address, settings.company_city].filter(Boolean).join(', ');
    const contactParts = [
      settings.company_phone && `📞 ${settings.company_phone}`,
      settings.company_email && `✉️ ${settings.company_email}`,
      settings.company_website && `🌐 ${settings.company_website}`,
    ].filter(Boolean);
    const logo = this.parseLogoDataUrl(settingsRaw.company_logo_url);

    const headerRow = logo
      ? `<td style="padding:14px 16px;vertical-align:middle;width:60px;"><img src="cid:company-logo" alt="${name}" width="44" style="display:block;max-height:44px;height:auto;"/></td>
         <td style="padding:14px 20px 14px 0;vertical-align:middle;"><div style="font-size:16px;font-weight:700;color:#0f172a;">${name}</div>${tagline ? `<div style="font-size:12px;color:#64748b;">${tagline}</div>` : ''}</td>`
      : `<td style="padding:14px 20px;vertical-align:middle;"><div style="font-size:16px;font-weight:700;color:#0f172a;">${name}</div>${tagline ? `<div style="font-size:12px;color:#64748b;">${tagline}</div>` : ''}</td>`;

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid #1e40af;"><tr>${headerRow}</tr></table>
  <div style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.6;">${bodyHtml || ''}</div>
  <div style="padding:16px 20px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
    <div style="font-weight:600;color:#334155;margin-bottom:2px;">${name}</div>
    ${address ? `<div>${address}</div>` : ''}
    ${contactParts.length ? `<div>${contactParts.join(' &nbsp;&middot;&nbsp; ')}</div>` : ''}
    <div style="margin-top:10px;color:#94a3b8;font-size:11px;">Email ini beserta lampirannya bersifat rahasia dan hanya diperuntukkan bagi penerima yang dituju. Jika Anda menerima email ini secara tidak sengaja, mohon segera hapus dan beri tahu pengirim.</div>
  </div>
</div>`.trim();

    const logoAttachment = logo
      ? { filename: 'logo', content: logo.buffer, cid: 'company-logo', contentType: logo.contentType }
      : undefined;
    return { html, logoAttachment };
  }
}
