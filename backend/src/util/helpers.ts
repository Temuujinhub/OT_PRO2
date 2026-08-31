import { q, q1 } from '../db';
import { Request } from 'express';

export async function audit(req: Request | null, action: string, entityType: string, entityId: any, opts: { reason?: string; before?: string; after?: string } = {}) {
  await q(
    `INSERT INTO audit_event(actor_id, actor_name, action, entity_type, entity_id, reason, before_summary, after_summary, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [req?.user?.id || null, req?.user?.name || 'system', action, entityType, String(entityId ?? ''),
     opts.reason || null, opts.before || null, opts.after || null, req?.ip || null]
  );
}

export async function notify(userId: number | null, orgId: number | null, ntype: string,
  titleMn: string, titleEn: string, bodyMn: string, bodyEn: string, link?: string) {
  await q(
    `INSERT INTO notification(user_id, organization_id, ntype, title_mn, title_en, body_mn, body_en, link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, orgId, ntype, titleMn, titleEn, bodyMn, bodyEn, link || null]
  );
}

/** Notify every active user of an organization (in-app) + simulated email to primary contact */
export async function notifyOrg(orgId: number, ntype: string, titleMn: string, titleEn: string, bodyMn: string, bodyEn: string, link?: string) {
  const users = await q(`SELECT id, email FROM app_user WHERE organization_id=$1 AND status='active'`, [orgId]);
  for (const u of users) {
    await notify(u.id, orgId, ntype, titleMn, titleEn, bodyMn, bodyEn, link);
  }
  if (users.length) {
    await sendEmail(users[0].email, titleMn + ' / ' + titleEn, bodyMn + '\n\n' + bodyEn);
  }
}

export async function sendEmail(to: string, subject: string, body: string) {
  // Simulated email delivery — stored in email_outbox (dev mailbox).
  await q(`INSERT INTO email_outbox(to_email, subject, body) VALUES ($1,$2,$3)`, [to, subject, body]);
}

export async function nextNumber(prefix: string, table: string, column: string): Promise<string> {
  const year = new Date().getFullYear();
  const row = await q1(`SELECT count(*)::int AS c FROM ${table}`);
  const seq = (row?.c || 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

export async function getSetting(key: string, dflt: string): Promise<string> {
  const r = await q1('SELECT value FROM app_setting WHERE key=$1', [key]);
  return r ? r.value : dflt;
}

/** currency conversion using latest seeded exchange rate snapshot */
export async function convert(amount: number, from: string, to: string): Promise<{ amount: number; rate: number; rateDate: string } | null> {
  if (from === to) return { amount, rate: 1, rateDate: new Date().toISOString().slice(0, 10) };
  let r = await q1(
    `SELECT rate, rate_date FROM exchange_rate WHERE base_currency=$1 AND quote_currency=$2 ORDER BY rate_date DESC LIMIT 1`,
    [from, to]);
  if (r) return { amount: round4(amount * Number(r.rate)), rate: Number(r.rate), rateDate: r.rate_date };
  r = await q1(
    `SELECT rate, rate_date FROM exchange_rate WHERE base_currency=$1 AND quote_currency=$2 ORDER BY rate_date DESC LIMIT 1`,
    [to, from]);
  if (r) return { amount: round4(amount / Number(r.rate)), rate: round8(1 / Number(r.rate)), rateDate: r.rate_date };
  return null;
}

export function round4(n: number): number { return Math.round(n * 10000) / 10000; }
export function round8(n: number): number { return Math.round(n * 1e8) / 1e8; }

export function bad(res: any, code: string, detail?: any) {
  return res.status(400).json({ error: code, detail });
}

export function parseMoney(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v).replace(/[, ]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function fmtAmount(n: any): string {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export async function orgActiveRestriction(orgId: number): Promise<any | null> {
  return q1(`SELECT * FROM org_restriction WHERE organization_id=$1 AND active=true AND (end_at IS NULL OR end_at > now()) LIMIT 1`, [orgId]);
}
