import { Router } from 'express';
import ExcelJS from 'exceljs';
import { q, q1 } from '../db';
import { requireAuth, requireInternal, requireRole } from '../util/auth';
import { audit, notify, bad } from '../util/helpers';

const r = Router();
r.use(requireAuth);

// ---- COI declarations (internal users declare per tender) ----
r.post('/coi', requireInternal, async (req, res) => {
  const { tender_id, organization_id, has_conflict, conflict_type, details, mitigation } = req.body || {};
  if (has_conflict && (!conflict_type || !details)) return bad(res, 'details_required');
  const row = (await q(
    `INSERT INTO coi_declaration(user_id, tender_id, organization_id, has_conflict, conflict_type, details, mitigation)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.id, tender_id || null, organization_id || null, !!has_conflict, conflict_type || null, details || null, mitigation || null]))[0];
  await audit(req, 'coi_declared', 'coi', row.id, { after: has_conflict ? 'CONFLICT' : 'no conflict' });
  if (has_conflict) {
    const analysts = await q(`SELECT id FROM app_user WHERE user_type='internal' AND role IN ('DDAnalyst','Compliance','SystemAdmin')`);
    for (const a of analysts) {
      await notify(a.id, null, 'system', 'COI мэдүүлэг ирлээ', 'COI declaration flagged',
        `${req.user!.name}: ${conflict_type}`, `${req.user!.name}: ${conflict_type}`, '/admin/dd');
    }
  }
  res.json(row);
});

r.get('/coi', requireInternal, async (req, res) => {
  const rows = await q(
    `SELECT c.*, u.display_name AS declarer, t.tender_no, o.name_mn AS org_name
     FROM coi_declaration c JOIN app_user u ON u.id=c.user_id
     LEFT JOIN tender t ON t.id=c.tender_id LEFT JOIN organization o ON o.id=c.organization_id
     ORDER BY c.id DESC LIMIT 200`);
  res.json(rows);
});

r.post('/coi/:id(\\d+)/review', requireInternal, requireRole('DDAnalyst', 'Compliance', 'SystemAdmin'), async (req, res) => {
  const { decision } = req.body || {}; // cleared | blocked
  if (!['cleared', 'blocked'].includes(decision)) return bad(res, 'invalid_decision');
  await q(`UPDATE coi_declaration SET status=$1, reviewed_by=$2 WHERE id=$3`, [decision, req.user!.id, req.params.id]);
  await audit(req, 'coi_reviewed', 'coi', req.params.id, { after: decision });
  res.json({ ok: true });
});

// ---- DD cases (spec 8.16) ----
r.get('/cases', requireInternal, async (req, res) => {
  const { status } = req.query as any;
  const cond = status ? `WHERE dc.status='${String(status).replace(/'/g, '')}'` : '';
  const rows = await q(
    `SELECT dc.*, o.name_mn AS org_name, o.registry_no, o.risk_level AS org_risk, u.display_name AS analyst_name
     FROM dd_case dc JOIN organization o ON o.id=dc.organization_id LEFT JOIN app_user u ON u.id=dc.analyst_id
     ${cond} ORDER BY dc.id DESC LIMIT 300`);
  res.json(rows);
});

r.post('/cases', requireInternal, requireRole('DDAnalyst', 'Compliance', 'Buyer', 'SystemAdmin'), async (req, res) => {
  const { organization_id, source, source_id, risk_tier } = req.body || {};
  if (!organization_id) return bad(res, 'org_required');
  const row = (await q(
    `INSERT INTO dd_case(organization_id, source, source_id, risk_tier, analyst_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [organization_id, source || 'supplier', source_id || null, risk_tier || 'medium', req.user!.id]))[0];
  await audit(req, 'dd_case_opened', 'dd_case', row.id);
  res.json(row);
});

r.get('/cases/:id(\\d+)', requireInternal, async (req, res) => {
  const c = await q1(
    `SELECT dc.*, o.name_mn AS org_name, o.registry_no, o.khur_verified FROM dd_case dc JOIN organization o ON o.id=dc.organization_id WHERE dc.id=$1`,
    [req.params.id]);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const shareholders = await q('SELECT * FROM org_shareholder WHERE organization_id=$1', [c.organization_id]);
  const restrictions = await q('SELECT * FROM org_restriction WHERE organization_id=$1 AND active=true', [c.organization_id]);
  const cois = await q(
    `SELECT c2.*, u.display_name AS declarer FROM coi_declaration c2 JOIN app_user u ON u.id=c2.user_id WHERE c2.organization_id=$1 ORDER BY c2.id DESC`,
    [c.organization_id]);
  const priorCases = await q('SELECT * FROM dd_case WHERE organization_id=$1 AND id<>$2 ORDER BY id DESC LIMIT 5', [c.organization_id, c.id]);
  res.json({ case: c, shareholders, restrictions, cois, priorCases });
});

r.post('/cases/:id(\\d+)/screen', requireInternal, requireRole('DDAnalyst', 'Compliance', 'SystemAdmin'), async (req, res) => {
  const { notes } = req.body || {};
  await q(`UPDATE dd_case SET status='screening', screening_notes=$1, analyst_id=$2 WHERE id=$3`, [notes || null, req.user!.id, req.params.id]);
  await audit(req, 'dd_screening', 'dd_case', req.params.id);
  res.json({ ok: true });
});

r.post('/cases/:id(\\d+)/decide', requireInternal, requireRole('DDAnalyst', 'Compliance', 'SystemAdmin'), async (req, res) => {
  const { decision, reason, expires_on } = req.body || {}; // cleared | conditional | blocked
  if (!['cleared', 'conditional', 'blocked'].includes(decision)) return bad(res, 'invalid_decision');
  if (!reason) return bad(res, 'reason_required');
  const c = await q1('SELECT * FROM dd_case WHERE id=$1', [req.params.id]);
  if (!c || c.status === 'decided') return bad(res, 'invalid_state');
  await q(`UPDATE dd_case SET status='decided', decision=$1, decision_reason=$2, decided_at=now(), expires_on=$3, analyst_id=$4 WHERE id=$5`,
    [decision, reason, expires_on || new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10), req.user!.id, c.id]);
  if (decision === 'blocked') {
    await q(`INSERT INTO org_restriction(organization_id, rtype, reason_code, reason, approved_by) VALUES ($1,'blacklist','DD_BLOCK',$2,$3)`,
      [c.organization_id, reason, req.user!.id]);
    await q(`UPDATE organization SET status='blacklisted', risk_level='high', updated_at=now() WHERE id=$1`, [c.organization_id]);
  }
  await audit(req, 'dd_decision', 'dd_case', c.id, { reason, after: decision });
  res.json({ ok: true });
});

// DD/COI report export (Table C5 item 3)
r.get('/report.xlsx', requireInternal, async (_req, res) => {
  const cases = await q(
    `SELECT dc.id, o.name_mn, o.registry_no, dc.source, dc.risk_tier, dc.status, dc.decision, dc.decision_reason,
            dc.opened_at, dc.decided_at, dc.expires_on
     FROM dd_case dc JOIN organization o ON o.id=dc.organization_id ORDER BY dc.id DESC`);
  const cois = await q(
    `SELECT c.id, u.display_name, t.tender_no, o.name_mn AS org, c.has_conflict, c.conflict_type, c.status, c.created_at
     FROM coi_declaration c JOIN app_user u ON u.id=c.user_id LEFT JOIN tender t ON t.id=c.tender_id LEFT JOIN organization o ON o.id=c.organization_id
     ORDER BY c.id DESC`);
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('DD Cases');
  ws1.columns = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Organization', key: 'name_mn', width: 30 },
    { header: 'Registry', key: 'registry_no', width: 12 }, { header: 'Source', key: 'source', width: 10 },
    { header: 'Risk', key: 'risk_tier', width: 8 }, { header: 'Status', key: 'status', width: 10 },
    { header: 'Decision', key: 'decision', width: 12 }, { header: 'Reason', key: 'decision_reason', width: 34 },
    { header: 'Opened', key: 'opened_at', width: 20 }, { header: 'Decided', key: 'decided_at', width: 20 },
    { header: 'Expires', key: 'expires_on', width: 12 }];
  ws1.getRow(1).font = { bold: true };
  cases.forEach(c => ws1.addRow(c));
  const ws2 = wb.addWorksheet('COI Declarations');
  ws2.columns = [
    { header: 'ID', key: 'id', width: 6 }, { header: 'Declarer', key: 'display_name', width: 22 },
    { header: 'Tender', key: 'tender_no', width: 16 }, { header: 'Organization', key: 'org', width: 30 },
    { header: 'Conflict', key: 'has_conflict', width: 10 }, { header: 'Type', key: 'conflict_type', width: 16 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Date', key: 'created_at', width: 20 }];
  ws2.getRow(1).font = { bold: true };
  cois.forEach(c => ws2.addRow(c));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="dd-coi-report.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

export default r;
