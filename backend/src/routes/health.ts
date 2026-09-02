import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { q, q1, pool } from '../db';
import { requireAuth, requireRole } from '../util/auth';

const r = Router();

type Status = 'ok' | 'warn' | 'fail';
type Check = { key: string; label_mn: string; label_en: string; status: Status; value?: string; detail_mn?: string; detail_en?: string };
type Group = { key: string; title_mn: string; title_en: string; checks: Check[] };

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const fmtBytes = (n: number) => {
  if (!isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
};
const fmtDur = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const num = (x: any) => Number(x ?? 0);

/**
 * GET /admin/health — full system health report.
 * Read-only. Every check reports ok | warn | fail with a human explanation,
 * so an operator can tell "degraded but running" from "broken".
 */
r.get('/', requireAuth, requireRole('SystemAdmin', 'Auditor'), async (_req, res) => {
  const groups: Group[] = [];
  const started = Date.now();

  // ---------------------------------------------------------------- database
  const dbChecks: Check[] = [];
  let dbUp = false;
  try {
    const t0 = Date.now();
    const v = await q1('SELECT version() AS v, current_database() AS db');
    const latency = Date.now() - t0;
    dbUp = true;
    dbChecks.push({
      key: 'db_conn', label_mn: 'Холболт', label_en: 'Connection',
      status: latency < 250 ? 'ok' : 'warn', value: `${latency} ms`,
      detail_mn: String(v.v).split(',')[0], detail_en: String(v.v).split(',')[0],
    });
    const size = await q1(`SELECT pg_database_size(current_database()) AS b`);
    dbChecks.push({ key: 'db_size', label_mn: 'Өгөгдлийн сангийн хэмжээ', label_en: 'Database size',
      status: 'ok', value: fmtBytes(num(size.b)) });
    const conns = await q1(`SELECT count(*)::int AS used,
        (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max
      FROM pg_stat_activity WHERE datname=current_database()`);
    const pct = num(conns.used) / Math.max(1, num(conns.max));
    dbChecks.push({ key: 'db_conns', label_mn: 'Идэвхтэй холболт', label_en: 'Active connections',
      status: pct > 0.8 ? 'fail' : pct > 0.5 ? 'warn' : 'ok', value: `${conns.used} / ${conns.max}` });
    const longest = await q1(`SELECT COALESCE(EXTRACT(EPOCH FROM max(now()-query_start)),0)::int AS s
      FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND pid<>pg_backend_pid()`);
    dbChecks.push({ key: 'db_longq', label_mn: 'Хамгийн урт query', label_en: 'Longest running query',
      status: num(longest.s) > 30 ? 'warn' : 'ok', value: `${num(longest.s)} s` });
  } catch (e: any) {
    dbChecks.push({ key: 'db_conn', label_mn: 'Холболт', label_en: 'Connection', status: 'fail',
      value: 'offline', detail_mn: e.message, detail_en: e.message });
  }
  groups.push({ key: 'database', title_mn: 'Өгөгдлийн сан', title_en: 'Database', checks: dbChecks });

  // ------------------------------------------------------------------ schema
  const schemaChecks: Check[] = [];
  if (dbUp) {
    const need = ['organization', 'app_user', 'tender', 'tender_item', 'bid_response', 'bid_item_quote',
      'evaluation', 'item_selection', 'approval_instance', 'approval_stage', 'award', 'qual_program',
      'qual_submission', 'dd_case', 'coi_declaration', 'attachment', 'audit_event', 'catalogue_item',
      'support_ticket', 'support_article', 'msg_thread', 'msg_message', 'notification', 'translation',
      'integration_config', 'integration_log'];
    const have = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`))
      .map((x: any) => x.table_name);
    const missing = need.filter(t => !have.includes(t));
    schemaChecks.push({ key: 'tables', label_mn: 'Шаардлагатай хүснэгтүүд', label_en: 'Required tables',
      status: missing.length ? 'fail' : 'ok', value: `${need.length - missing.length} / ${need.length}`,
      detail_mn: missing.length ? `Дутуу: ${missing.join(', ')}` : undefined,
      detail_en: missing.length ? `Missing: ${missing.join(', ')}` : undefined });

    const col = await q1(`SELECT 1 AS ok FROM information_schema.columns
      WHERE table_name='catalogue_item' AND column_name='image_attachment_id'`);
    schemaChecks.push({ key: 'migrations', label_mn: 'Нэмэлт баганууд (migration)', label_en: 'In-place migrations',
      status: col ? 'ok' : 'fail', value: col ? 'applied' : 'pending',
      detail_mn: col ? undefined : 'catalogue_item.image_attachment_id алга — schema.sql дахин ажиллуулна уу',
      detail_en: col ? undefined : 'catalogue_item.image_attachment_id is missing — re-run schema.sql' });

    const idx = await q1(`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`);
    schemaChecks.push({ key: 'indexes', label_mn: 'Индексүүд', label_en: 'Indexes', status: 'ok', value: String(idx.n) });
  }
  groups.push({ key: 'schema', title_mn: 'Схем', title_en: 'Schema', checks: schemaChecks });

  // ---------------------------------------------------------------- storage
  const storeChecks: Check[] = [];
  let writable = false;
  try {
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK); writable = true;
  } catch { /* not writable */ }
  storeChecks.push({ key: 'upload_dir', label_mn: 'Файлын сан бичигдэх эсэх', label_en: 'Upload directory writable',
    status: writable ? 'ok' : 'fail', value: writable ? 'writable' : 'not writable',
    detail_mn: UPLOAD_DIR, detail_en: UPLOAD_DIR });
  try {
    const names = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
    let bytes = 0;
    for (const n of names) { try { bytes += fs.statSync(path.join(UPLOAD_DIR, n)).size; } catch {} }
    storeChecks.push({ key: 'files_on_disk', label_mn: 'Дискэн дэх файл', label_en: 'Files on disk',
      status: 'ok', value: `${names.length} · ${fmtBytes(bytes)}` });

    if (dbUp) {
      const rows = await q('SELECT id, stored_name FROM attachment');
      const set = new Set(names);
      const orphans = rows.filter((x: any) => !set.has(x.stored_name));
      storeChecks.push({ key: 'orphans', label_mn: 'Дискэн дээр байхгүй хавсралт', label_en: 'Attachments missing on disk',
        status: orphans.length ? 'warn' : 'ok', value: `${orphans.length} / ${rows.length}`,
        detail_mn: orphans.length ? `ID: ${orphans.slice(0, 8).map((o: any) => o.id).join(', ')}` : undefined,
        detail_en: orphans.length ? `IDs: ${orphans.slice(0, 8).map((o: any) => o.id).join(', ')}` : undefined });
    }
  } catch (e: any) {
    storeChecks.push({ key: 'files_on_disk', label_mn: 'Дискэн дэх файл', label_en: 'Files on disk',
      status: 'warn', value: 'unreadable', detail_mn: e.message, detail_en: e.message });
  }
  groups.push({ key: 'storage', title_mn: 'Файлын сан', title_en: 'Storage', checks: storeChecks });

  // ------------------------------------------------------------- application
  const mem = process.memoryUsage();
  const appChecks: Check[] = [
    { key: 'version', label_mn: 'Хувилбар', label_en: 'Version', status: 'ok',
      value: `v${process.env.npm_package_version || '2.0.0'} · node ${process.version}` },
    { key: 'uptime', label_mn: 'Ажилласан хугацаа', label_en: 'Uptime', status: 'ok', value: fmtDur(process.uptime()) },
    { key: 'memory', label_mn: 'Санах ой', label_en: 'Memory', status: mem.rss > 900e6 ? 'warn' : 'ok',
      value: `${fmtBytes(mem.rss)} RSS · ${fmtBytes(mem.heapUsed)} heap` },
    { key: 'load', label_mn: 'Системийн ачаалал', label_en: 'Host load', status: 'ok',
      value: os.loadavg().map(x => x.toFixed(2)).join(' / ') },
    { key: 'node_env', label_mn: 'Орчин', label_en: 'Environment',
      status: process.env.NODE_ENV === 'production' ? 'ok' : 'warn',
      value: process.env.NODE_ENV || 'development',
      detail_mn: process.env.NODE_ENV === 'production' ? undefined : 'NODE_ENV=production биш байна',
      detail_en: process.env.NODE_ENV === 'production' ? undefined : 'NODE_ENV is not set to production' },
  ];
  const weakSecret = !process.env.JWT_SECRET || ['change-me', 'dev', 'secret'].includes(process.env.JWT_SECRET);
  appChecks.push({ key: 'jwt', label_mn: 'JWT нууц түлхүүр', label_en: 'JWT secret',
    status: weakSecret ? 'fail' : 'ok', value: weakSecret ? 'default / weak' : 'configured',
    detail_mn: weakSecret ? 'JWT_SECRET-ийг заавал өөрчилнө үү' : undefined,
    detail_en: weakSecret ? 'JWT_SECRET must be set to a strong value' : undefined });
  const aiKey = !!process.env.ANTHROPIC_API_KEY;
  appChecks.push({ key: 'ai', label_mn: 'AI үйлчилгээ', label_en: 'AI service',
    status: aiKey ? 'ok' : 'warn', value: aiKey ? 'Claude connected' : 'deterministic fallback',
    detail_mn: aiKey ? undefined : 'ANTHROPIC_API_KEY тохируулаагүй — тайлангийн хураангуй, туслах дүрэмд суурилан ажиллана',
    detail_en: aiKey ? undefined : 'ANTHROPIC_API_KEY is not set — summaries and the assistant fall back to rule-based output' });
  groups.push({ key: 'application', title_mn: 'Программ', title_en: 'Application', checks: appChecks });

  // ------------------------------------------------------------ integrations
  const intChecks: Check[] = [];
  if (dbUp) {
    try {
      const ints = await q('SELECT code, name_mn, enabled, last_test_at, last_test_status FROM integration_config ORDER BY code');
      for (const i of ints) {
        let last = await q1(`SELECT status, created_at, detail FROM integration_log
          WHERE code=$1 ORDER BY created_at DESC LIMIT 1`, [i.code]);
        if (!last && i.last_test_at)
          last = { status: i.last_test_status || 'unknown', created_at: i.last_test_at, detail: null };
        const stale = last ? (Date.now() - new Date(last.created_at).getTime()) / 86400000 : null;
        intChecks.push({
          key: `int_${i.code}`, label_mn: i.name_mn || i.code, label_en: i.code,
          // a failing external dependency is degraded service, not a broken system
          status: !i.enabled ? 'warn' : !last ? 'warn' : last.status === 'success' ? 'ok' : 'warn',
          value: !i.enabled ? 'disabled' : last ? `${last.status}${stale !== null ? ` · ${stale.toFixed(0)}d ago` : ''}` : 'never called',
          detail_mn: last?.detail || undefined, detail_en: last?.detail || undefined,
        });
      }
    } catch (e: any) {
      intChecks.push({ key: 'int_err', label_mn: 'Интеграц', label_en: 'Integrations', status: 'warn',
        value: 'unreadable', detail_en: e.message });
    }
  }
  groups.push({ key: 'integrations', title_mn: 'Интеграц', title_en: 'Integrations', checks: intChecks });

  // ---------------------------------------------------------- data integrity
  const dataChecks: Check[] = [];
  if (dbUp) {
    const counts = await q1(`SELECT
        (SELECT count(*)::int FROM organization) AS orgs,
        (SELECT count(*)::int FROM app_user)     AS users,
        (SELECT count(*)::int FROM tender)       AS tenders,
        (SELECT count(*)::int FROM bid_response) AS bids,
        (SELECT count(*)::int FROM award)        AS awards,
        (SELECT count(*)::int FROM audit_event)  AS audits`);
    dataChecks.push({ key: 'counts', label_mn: 'Бүртгэлийн тоо', label_en: 'Record counts', status: 'ok',
      value: `${counts.orgs} orgs · ${counts.users} users · ${counts.tenders} tenders · ${counts.bids} bids · ${counts.awards} awards` });

    const audit24 = await q1(`SELECT count(*)::int AS n FROM audit_event WHERE occurred_at > now() - interval '24 hours'`);
    dataChecks.push({ key: 'audit_active', label_mn: 'Аудит бичлэг (24ц)', label_en: 'Audit events (24h)',
      status: num(counts.audits) === 0 ? 'fail' : 'ok', value: `${audit24.n} / ${counts.audits} total`,
      detail_mn: num(counts.audits) === 0 ? 'Аудит огт бичигдэхгүй байна' : undefined,
      detail_en: num(counts.audits) === 0 ? 'Nothing is being written to the audit trail' : undefined });

    const orphanBids = await q1(`SELECT count(*)::int AS n FROM bid_response b
      LEFT JOIN tender t ON t.id=b.tender_id WHERE t.id IS NULL`);
    dataChecks.push({ key: 'orphan_bids', label_mn: 'Тендергүй үлдсэн санал', label_en: 'Bids without a tender',
      status: num(orphanBids.n) ? 'fail' : 'ok', value: String(orphanBids.n) });

    const awardNoAppr = await q1(`SELECT count(*)::int AS n FROM award a
      LEFT JOIN approval_instance ai ON ai.id=a.approval_id WHERE ai.id IS NULL`);
    dataChecks.push({ key: 'award_no_approval', label_mn: 'Зөвшөөрөлгүй award', label_en: 'Awards without an approval',
      status: num(awardNoAppr.n) ? 'fail' : 'ok', value: String(awardNoAppr.n),
      detail_mn: num(awardNoAppr.n) ? 'Хяналтгүй award үүссэн байна' : undefined,
      detail_en: num(awardNoAppr.n) ? 'An award exists that never went through an approval' : undefined });

    const overdue = await q1(`SELECT count(*)::int AS n FROM tender
      WHERE status='published' AND close_at < now()`);
    dataChecks.push({ key: 'overdue_tenders', label_mn: 'Хугацаа хэтэрсэн нээлттэй тендер', label_en: 'Published tenders past their deadline',
      status: num(overdue.n) ? 'warn' : 'ok', value: String(overdue.n),
      detail_mn: num(overdue.n) ? 'Хаах эсвэл хугацааг сунгах шаардлагатай' : undefined,
      detail_en: num(overdue.n) ? 'These need closing or a deadline extension' : undefined });

    const stuckApprovals = await q1(`SELECT count(*)::int AS n FROM approval_stage s
      JOIN approval_instance ai ON ai.id=s.approval_id
      WHERE s.status='pending' AND ai.created_at < now() - interval '7 days'`);
    dataChecks.push({ key: 'stuck_approvals', label_mn: '7+ хоног хүлээж буй зөвшөөрөл', label_en: 'Approvals pending over 7 days',
      status: num(stuckApprovals.n) > 3 ? 'warn' : 'ok', value: String(stuckApprovals.n) });

    const expiredQual = await q1(`SELECT count(*)::int AS n FROM qual_submission
      WHERE status='approved' AND expires_on IS NOT NULL AND expires_on < CURRENT_DATE`);
    dataChecks.push({ key: 'expired_qual', label_mn: 'Хугацаа дууссан үнэлгээ', label_en: 'Expired qualifications still marked approved',
      status: num(expiredQual.n) ? 'warn' : 'ok', value: String(expiredQual.n) });

    const noDd = await q1(`SELECT count(*)::int AS n FROM organization o
      WHERE o.status='approved' AND NOT EXISTS (
        SELECT 1 FROM dd_case d WHERE d.organization_id=o.id AND d.status='decided' AND d.decision='cleared')`);
    dataChecks.push({ key: 'no_dd', label_mn: 'DD цэвэрлэгээгүй батлагдсан нийлүүлэгч', label_en: 'Approved suppliers without a cleared DD case',
      status: num(noDd.n) ? 'warn' : 'ok', value: String(noDd.n),
      detail_mn: num(noDd.n) ? 'Award хийх үед DD хаалт ажиллаж, гүйлгээг зогсооно' : undefined,
      detail_en: num(noDd.n) ? 'The award gate will block these suppliers until DD is cleared' : undefined });
  }
  groups.push({ key: 'data', title_mn: 'Өгөгдлийн бүрэн бүтэн байдал', title_en: 'Data integrity', checks: dataChecks });

  // ---------------------------------------------------------------- security
  const secChecks: Check[] = [];
  if (dbUp) {
    const locked = await q1(`SELECT count(*)::int AS n FROM app_user WHERE status='locked'`);
    secChecks.push({ key: 'locked', label_mn: 'Түгжигдсэн хэрэглэгч', label_en: 'Locked accounts',
      status: num(locked.n) > 5 ? 'warn' : 'ok', value: String(locked.n) });

    const failed = await q1(`SELECT count(*)::int AS n FROM audit_event
      WHERE action='login_failed' AND occurred_at > now() - interval '24 hours'`);
    secChecks.push({ key: 'failed_logins', label_mn: 'Амжилтгүй нэвтрэлт (24ц)', label_en: 'Failed logins (24h)',
      status: num(failed.n) > 50 ? 'fail' : num(failed.n) > 20 ? 'warn' : 'ok', value: String(failed.n) });

    const noMfa = await q1(`SELECT count(*)::int AS n FROM app_user
      WHERE user_type='internal' AND role IN ('SystemAdmin','Approver') AND COALESCE(mfa_enabled,false)=false`);
    secChecks.push({ key: 'mfa', label_mn: 'MFA-гүй эрх бүхий хэрэглэгч', label_en: 'Privileged accounts without MFA',
      status: num(noMfa.n) ? 'warn' : 'ok', value: String(noMfa.n),
      detail_mn: num(noMfa.n) ? 'Админ болон зөвшөөрөгчид MFA идэвхжүүлэхийг зөвлөж байна' : undefined,
      detail_en: num(noMfa.n) ? 'Enable MFA for administrators and approvers' : undefined });

    const inactive = await q1(`SELECT count(*)::int AS n FROM app_user
      WHERE status='active' AND (last_login_at IS NULL OR last_login_at < now() - interval '90 days')`);
    secChecks.push({ key: 'dormant', label_mn: '90+ хоног нэвтрээгүй идэвхтэй хаяг', label_en: 'Active accounts dormant over 90 days',
      status: 'ok', value: String(inactive.n) });
  }
  groups.push({ key: 'security', title_mn: 'Аюулгүй байдал', title_en: 'Security', checks: secChecks });

  // ----------------------------------------------------------------- summary
  const all = groups.flatMap(g => g.checks);
  const counts = { ok: 0, warn: 0, fail: 0 } as Record<Status, number>;
  all.forEach(c => counts[c.status]++);
  const overall: Status = counts.fail ? 'fail' : counts.warn ? 'warn' : 'ok';

  res.json({
    overall, counts, total: all.length,
    generated_at: new Date().toISOString(),
    took_ms: Date.now() - started,
    groups,
  });
});

export default r;
