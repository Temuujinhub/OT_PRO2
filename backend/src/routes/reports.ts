import { Router } from 'express';
import ExcelJS from 'exceljs';
import { q, q1 } from '../db';
import { requireAuth, requireInternal } from '../util/auth';
import { audit, bad } from '../util/helpers';
import { reportSummary } from '../services/ai';

const r = Router();
r.use(requireAuth, requireInternal);

// -------- Report definitions (spec 8.23) --------
const REPORTS: Record<string, { name_mn: string; name_en: string; sql: string }> = {
  supplier_master: {
    name_mn: 'Нийлүүлэгчийн мастер тайлан', name_en: 'Supplier master report',
    sql: `SELECT o.id, o.name_mn, o.name_en, o.registry_no, o.vendor_no, o.org_type, o.residency, o.status,
                 o.risk_level, o.completion_percent, o.khur_verified, o.created_at::date AS registered
          FROM organization o ORDER BY o.id`,
  },
  registration_monthly: {
    name_mn: 'Сарын бүртгэлийн тайлан', name_en: 'Monthly registration report',
    sql: `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS registrations,
                 count(*) FILTER (WHERE residency='national')::int AS national,
                 count(*) FILTER (WHERE residency='international')::int AS international
          FROM organization GROUP BY 1 ORDER BY 1`,
  },
  qualification_status: {
    name_mn: 'Урьдчилсан үнэлгээний тайлан', name_en: 'Qualification status report',
    sql: `SELECT qs.id, o.name_mn AS supplier, p.name_mn AS program, qs.status, qs.risk_score,
                 qs.submitted_at::date AS submitted, qs.decided_at::date AS decided, qs.expires_on
          FROM qual_submission qs JOIN organization o ON o.id=qs.organization_id JOIN qual_program p ON p.id=qs.program_id
          ORDER BY qs.id DESC`,
  },
  tender_pipeline: {
    name_mn: 'Тендерийн pipeline тайлан', name_en: 'Tender pipeline report',
    sql: `SELECT t.tender_no, t.title_mn, tt.code AS type, t.status, t.department,
                 t.publish_at::date AS published, t.close_at::date AS closes,
                 (SELECT count(*)::int FROM tender_invitation i WHERE i.tender_id=t.id) AS invited,
                 (SELECT count(*)::int FROM bid_response b WHERE b.tender_id=t.id AND b.status NOT IN ('draft','no_response')) AS responded
          FROM tender t JOIN tender_type tt ON tt.id=t.type_id ORDER BY t.id DESC`,
  },
  participation: {
    name_mn: 'Оролцооны тайлан', name_en: 'Participation report',
    sql: `SELECT o.name_mn AS supplier,
                 count(*) FILTER (WHERE i.status IS NOT NULL)::int AS invited,
                 count(*) FILTER (WHERE br.status NOT IN ('draft','no_response'))::int AS responded,
                 count(*) FILTER (WHERE br.status='awarded')::int AS awarded
          FROM organization o
          LEFT JOIN tender_invitation i ON i.organization_id=o.id
          LEFT JOIN bid_response br ON br.organization_id=o.id AND br.tender_id=i.tender_id
          GROUP BY o.id, o.name_mn ORDER BY responded DESC`,
  },
  approval_aging: {
    name_mn: 'Зөвшөөрлийн saatal тайлан', name_en: 'Approval aging report',
    sql: `SELECT ai.id, ai.entity_type, ai.entity_id, ai.status, s.stage_no, s.stage_name,
                 u.display_name AS current_approver, s.due_at,
                 round(extract(epoch FROM (now() - ai.created_at))/3600)::int AS age_hours,
                 (s.due_at < now() AND s.status='pending') AS overdue
          FROM approval_instance ai
          LEFT JOIN approval_stage s ON s.approval_id=ai.id AND s.status='pending'
          LEFT JOIN app_user u ON u.id=s.assignee_id
          ORDER BY ai.created_at DESC`,
  },
  award_report: {
    name_mn: 'Award тайлан', name_en: 'Award report',
    sql: `SELECT a.id, t.tender_no, t.title_mn, a.version_no, a.status, a.total_amount, a.currency,
                 a.issued_at::date AS issued, u.display_name AS issued_by_name,
                 (SELECT count(DISTINCT organization_id)::int FROM award_allocation al WHERE al.award_id=a.id) AS suppliers
          FROM award a JOIN tender t ON t.id=a.tender_id LEFT JOIN app_user u ON u.id=a.issued_by ORDER BY a.id DESC`,
  },
  negotiation_savings: {
    name_mn: 'Тохиролцооны хэмнэлтийн тайлан', name_en: 'Negotiation savings report',
    sql: `SELECT t.tender_no, nr.round_no, o.name_mn AS supplier,
                 (SELECT COALESCE(sum(total_price),0) FROM bid_item_quote WHERE revision_id=np.baseline_revision_id AND is_alternative=false) AS original_total,
                 (SELECT COALESCE(sum(total_price),0) FROM bid_item_quote WHERE revision_id=COALESCE(np.submitted_revision_id, np.baseline_revision_id) AND is_alternative=false) AS negotiated_total
          FROM negotiation_participant np
          JOIN negotiation_round nr ON nr.id=np.round_id
          JOIN tender t ON t.id=nr.tender_id
          JOIN organization o ON o.id=np.organization_id
          ORDER BY t.tender_no, nr.round_no`,
  },
  support_sla: {
    name_mn: 'Дэмжлэгийн SLA тайлан', name_en: 'Support SLA report',
    sql: `SELECT st.ticket_no, st.subject, st.severity, st.status, o.name_mn AS supplier,
                 st.created_at, st.sla_due_at, st.resolved_at,
                 (st.resolved_at IS NOT NULL AND st.resolved_at <= st.sla_due_at) AS within_sla,
                 (st.sla_due_at < now() AND st.status NOT IN ('resolved','closed')) AS breached
          FROM support_ticket st LEFT JOIN organization o ON o.id=st.organization_id ORDER BY st.id DESC`,
  },
  kpi_difot: {
    name_mn: 'KPI/DIFOT тайлан', name_en: 'KPI/DIFOT report',
    sql: `SELECT o.name_mn AS supplier, s.period, s.difot, s.quality_score, s.overall, s.comment
          FROM supplier_score s JOIN organization o ON o.id=s.organization_id ORDER BY s.period DESC, o.name_mn`,
  },
  audit_security: {
    name_mn: 'Аудит/аюулгүй байдлын тайлан', name_en: 'Audit/security report',
    sql: `SELECT action, count(*)::int AS events, min(occurred_at) AS first_seen, max(occurred_at) AS last_seen
          FROM audit_event GROUP BY action ORDER BY events DESC`,
  },
  dd_coi: {
    name_mn: 'DD/COI тайлан', name_en: 'DD/COI report',
    sql: `SELECT dc.id, o.name_mn AS supplier, dc.source, dc.risk_tier, dc.status, dc.decision, dc.opened_at::date AS opened, dc.decided_at::date AS decided
          FROM dd_case dc JOIN organization o ON o.id=dc.organization_id ORDER BY dc.id DESC`,
  },
};

r.get('/definitions', (_req, res) => {
  res.json(Object.entries(REPORTS).map(([code, v]) => ({ code, name_mn: v.name_mn, name_en: v.name_en })));
});

r.get('/run/:code', async (req, res) => {
  const def = REPORTS[req.params.code];
  if (!def) return res.status(404).json({ error: 'unknown_report' });
  const rows = await q(def.sql);
  await audit(req, 'report_run', 'report', req.params.code, { after: `${rows.length} rows` });
  res.json({ code: req.params.code, name_mn: def.name_mn, name_en: def.name_en, rows, generated_at: new Date().toISOString(), generated_by: req.user!.name });
});

r.get('/run/:code/export.xlsx', async (req, res) => {
  const def = REPORTS[req.params.code];
  if (!def) return res.status(404).json({ error: 'unknown_report' });
  const rows = await q(def.sql);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(def.name_en.slice(0, 30));
  if (rows.length) {
    ws.columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: Math.min(40, Math.max(10, k.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    rows.forEach(row => ws.addRow(row));
  }
  // classification watermark row (spec 8.23)
  const meta = wb.addWorksheet('Info');
  meta.addRow(['Report', def.name_en]);
  meta.addRow(['Classification', 'Internal — Oyu Tolgoi/OASIS v2']);
  meta.addRow(['Generated by', req.user!.name]);
  meta.addRow(['Generated at', new Date().toISOString()]);
  await audit(req, 'report_exported', 'report', req.params.code);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.code}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// -------- AI summary (Table C5 item 4 — Report AI) --------
r.post('/run/:code/ai-summary', async (req, res) => {
  const def = REPORTS[req.params.code];
  if (!def) return res.status(404).json({ error: 'unknown_report' });
  const rows = await q(def.sql);
  const lang = req.body?.lang || req.user!.lang || 'mn';
  const result = await reportSummary(lang === 'mn' ? def.name_mn : def.name_en, lang, rows);
  await audit(req, 'report_ai_summary', 'report', req.params.code, { after: result.source });
  res.json(result);
});

// -------- Audit log browser (spec 8.24) --------
r.get('/audit', async (req, res) => {
  const { entity_type, action, actor, from, to } = req.query as any;
  const cond: string[] = ['1=1']; const params: any[] = [];
  if (entity_type) { params.push(entity_type); cond.push(`entity_type=$${params.length}`); }
  if (action) { params.push(`%${action}%`); cond.push(`action ILIKE $${params.length}`); }
  if (actor) { params.push(`%${actor}%`); cond.push(`actor_name ILIKE $${params.length}`); }
  if (from) { params.push(from); cond.push(`occurred_at >= $${params.length}`); }
  if (to) { params.push(to); cond.push(`occurred_at <= $${params.length}::date + 1`); }
  const rows = await q(`SELECT * FROM audit_event WHERE ${cond.join(' AND ')} ORDER BY occurred_at DESC LIMIT 300`, params);
  res.json(rows);
});

export default r;
