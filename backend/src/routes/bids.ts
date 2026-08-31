import { Router } from 'express';
import ExcelJS from 'exceljs';
import { q, q1, tx } from '../db';
import { requireAuth, requireSupplier, requireInternal, requireRole } from '../util/auth';
import { audit, notify, notifyOrg, bad, parseMoney, round4 } from '../util/helpers';

const r = Router();
r.use(requireAuth);

async function tenderOpenForBidding(tenderId: number) {
  const t = await q1(`SELECT t.*, tt.code AS type_code, tt.has_items FROM tender t JOIN tender_type tt ON tt.id=t.type_id WHERE t.id=$1`, [tenderId]);
  if (!t) return { t: null, open: false };
  const open = t.status === 'published' && (!t.close_at || new Date(t.close_at) > new Date());
  return { t, open };
}

// ---------- draft (autosave, spec 7.8/7.9) ----------
r.get('/my/:tenderId(\\d+)/draft', requireSupplier, async (req, res) => {
  const d = await q1('SELECT * FROM bid_draft WHERE tender_id=$1 AND organization_id=$2', [req.params.tenderId, req.user!.orgId]);
  res.json(d || { payload: {} });
});

r.put('/my/:tenderId(\\d+)/draft', requireSupplier, async (req, res) => {
  const { t, open } = await tenderOpenForBidding(Number(req.params.tenderId));
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!open) return bad(res, 'tender_closed');
  await q(
    `INSERT INTO bid_draft(tender_id, organization_id, payload, updated_at) VALUES ($1,$2,$3, now())
     ON CONFLICT (tender_id, organization_id) DO UPDATE SET payload=$3, updated_at=now()`,
    [t.id, req.user!.orgId, JSON.stringify(req.body?.payload || {})]);
  await q(
    `INSERT INTO bid_response(tender_id, organization_id, status) VALUES ($1,$2,'draft')
     ON CONFLICT (tender_id, organization_id) DO UPDATE SET status=CASE WHEN bid_response.status IN ('no_response') THEN 'draft' ELSE bid_response.status END`,
    [t.id, req.user!.orgId]);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

// ---------- server-side validation + submit (spec 7.9, DEF-03 control) ----------
function validateQuotes(t: any, items: any[], quotes: any[]): any[] {
  const errors: any[] = [];
  const itemById: Record<number, any> = {};
  items.forEach(i => itemById[i.id] = i);
  const seen = new Set<string>();
  for (const qt of quotes) {
    const item = itemById[qt.tender_item_id];
    const li = item ? `#${item.line_no}` : `item ${qt.tender_item_id}`;
    if (!item) { errors.push({ line: li, error: 'unknown_item' }); continue; }
    const key = `${qt.tender_item_id}:${qt.option_no || 1}`;
    if (seen.has(key)) errors.push({ line: li, error: 'duplicate_option' });
    seen.add(key);
    const price = parseMoney(qt.unit_price);
    if (price === null || price < 0) errors.push({ line: li, field: 'unit_price', error: 'invalid_price' });
    const qty = Number(qt.quantity ?? item.quantity);
    if (!isFinite(qty) || qty <= 0) errors.push({ line: li, field: 'quantity', error: 'invalid_quantity' });
    if (!qt.currency || !/^[A-Z]{3}$/.test(qt.currency)) errors.push({ line: li, field: 'currency', error: 'invalid_currency' });
    if (t.currency_policy !== 'any' && qt.currency && qt.currency !== t.currency_policy)
      errors.push({ line: li, field: 'currency', error: 'currency_policy_violation', expected: t.currency_policy });
    if (price !== null && isFinite(qty)) {
      const expected = round4(price * qty);
      const total = parseMoney(qt.total_price);
      if (total !== null && Math.abs(total - expected) > 0.01)
        errors.push({ line: li, field: 'total_price', error: 'total_mismatch', expected });
    }
    if (qt.is_alternative && !t.alternative_allowed) errors.push({ line: li, error: 'alternative_not_allowed' });
    if (item.datasheet_required && !qt.datasheet_attachment_id) errors.push({ line: li, field: 'datasheet', error: 'datasheet_required' });
    if (item.license_required && !qt.license_attachment_id) errors.push({ line: li, field: 'license', error: 'license_required' });
    if (item.certificate_required && !qt.certificate_attachment_id) errors.push({ line: li, field: 'certificate', error: 'certificate_required' });
  }
  if (!t.partial_allowed) {
    const quoted = new Set(quotes.filter(x => !x.is_alternative).map(x => x.tender_item_id));
    const missing = items.filter(i => !quoted.has(i.id));
    if (missing.length) errors.push({ error: 'partial_not_allowed', missing_lines: missing.map(m => m.line_no) });
  }
  return errors;
}

r.post('/my/:tenderId(\\d+)/validate', requireSupplier, async (req, res) => {
  const { t } = await tenderOpenForBidding(Number(req.params.tenderId));
  if (!t) return res.status(404).json({ error: 'not_found' });
  const items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [t.id]);
  const errors = validateQuotes(t, items, req.body?.quotes || []);
  res.json({ valid: errors.length === 0, errors });
});

r.post('/my/:tenderId(\\d+)/submit', requireSupplier, async (req, res) => {
  const orgId = req.user!.orgId!;
  const { t, open } = await tenderOpenForBidding(Number(req.params.tenderId));
  if (!t) return res.status(404).json({ error: 'not_found' });
  if (!open) return bad(res, 'tender_closed', 'Тендер хаагдсан тул илгээх боломжгүй');
  const org = await q1('SELECT * FROM organization WHERE id=$1', [orgId]);
  if (['suspended', 'blacklisted'].includes(org.status)) return bad(res, 'org_restricted');
  if (t.qualification_required) {
    const qual = await q1(
      `SELECT 1 FROM qual_submission qs JOIN qual_program p ON p.id=qs.program_id AND p.ptype='prequalification'
       WHERE qs.organization_id=$1 AND qs.status='approved' LIMIT 1`, [orgId]);
    if (!qual) return bad(res, 'qualification_required', 'Урьдчилсан үнэлгээ батлагдсан байх шаардлагатай');
  }
  const consent = await q1(`SELECT 1 FROM consent WHERE user_id=$1 AND consent_type='tender_disclaimer' AND ref_id=$2`, [req.user!.id, t.id]);
  if (!consent) return bad(res, 'disclaimer_not_accepted');

  const items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [t.id]);
  const requirements = await q('SELECT * FROM tender_requirement WHERE tender_id=$1 ORDER BY line_no', [t.id]);
  const quotes: any[] = req.body?.quotes || [];
  const reqAnswers: any[] = req.body?.requirementAnswers || [];
  const validity_days = req.body?.validity_days || null;

  if (t.has_items) {
    const errors = validateQuotes(t, items, quotes);
    if (errors.length) return res.status(400).json({ error: 'validation_failed', errors });
    if (!quotes.length) return bad(res, 'no_quotes');
  } else {
    const answered = new Set(reqAnswers.map(a => a.requirement_id));
    const missing = requirements.filter(rq => rq.required && !answered.has(rq.id));
    if (missing.length) return res.status(400).json({ error: 'requirements_missing', lines: missing.map(m => m.line_no) });
    const missingAtt = requirements.filter(rq => rq.attachment_required &&
      !reqAnswers.find(a => a.requirement_id === rq.id && a.attachment_id));
    if (missingAtt.length) return res.status(400).json({ error: 'attachments_missing', lines: missingAtt.map(m => m.line_no) });
  }

  const result = await tx(async c => {
    let resp = (await c.query('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2 FOR UPDATE', [t.id, orgId])).rows[0];
    if (!resp) {
      resp = (await c.query(`INSERT INTO bid_response(tender_id, organization_id, status) VALUES ($1,$2,'draft') RETURNING *`, [t.id, orgId])).rows[0];
    }
    if (resp.status === 'withdrawn') throw Object.assign(new Error('withdrawn'), { code: 'bid_withdrawn' });
    const revNo = resp.current_revision + 1;
    const rev = (await c.query(
      `INSERT INTO bid_revision(response_id, revision_no, source_type, submitted_by) VALUES ($1,$2,'manual',$3) RETURNING *`,
      [resp.id, revNo, req.user!.id])).rows[0];
    for (const qt of quotes) {
      const item = items.find(i => i.id === qt.tender_item_id);
      const qty = Number(qt.quantity ?? item.quantity);
      const price = parseMoney(qt.unit_price)!;
      await c.query(
        `INSERT INTO bid_item_quote(revision_id, tender_item_id, option_no, currency, unit_price, quantity, total_price,
           lead_time_value, lead_time_unit, incoterm, delivery_location, is_alternative, manufacturer, part_no, comment,
           datasheet_attachment_id, license_attachment_id, certificate_attachment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [rev.id, qt.tender_item_id, qt.option_no || 1, qt.currency, price, qty, round4(price * qty),
         qt.lead_time_value || null, qt.lead_time_unit || 'days', qt.incoterm || null, qt.delivery_location || null,
         !!qt.is_alternative, qt.manufacturer ? String(qt.manufacturer) : null, qt.part_no ? String(qt.part_no) : null,
         qt.comment || null, qt.datasheet_attachment_id || null, qt.license_attachment_id || null, qt.certificate_attachment_id || null]);
    }
    for (const a of reqAnswers) {
      await c.query(
        `INSERT INTO bid_requirement_answer(revision_id, requirement_id, comment, attachment_id) VALUES ($1,$2,$3,$4)
         ON CONFLICT (revision_id, requirement_id) DO NOTHING`,
        [rev.id, a.requirement_id, a.comment || null, a.attachment_id || null]);
    }
    await c.query(
      `UPDATE bid_response SET status='submitted', current_revision=$1, submitted_at=now(), validity_days=$2, payment_term_accepted=$3, payment_term_note=$4 WHERE id=$5`,
      [revNo, validity_days, req.body?.payment_term_accepted ?? true, req.body?.payment_term_note || null, resp.id]);
    await c.query(`UPDATE tender_invitation SET status='participated' WHERE tender_id=$1 AND organization_id=$2`, [t.id, orgId]);
    return { responseId: resp.id, revisionNo: revNo };
  }).catch(e => ({ error: e.code || e.message }));

  if ((result as any).error) return bad(res, (result as any).error);
  await audit(req, 'bid_submitted', 'bid', (result as any).responseId, { after: `rev ${(result as any).revisionNo}` });
  await notify(req.user!.id, orgId, 'system', 'Санал амжилттай илгээгдлээ', 'Bid submitted',
    `${t.tender_no} — хувилбар v${(result as any).revisionNo}. Баримтын дугаар: BID-${(result as any).responseId}-${(result as any).revisionNo}`,
    `${t.tender_no} — revision v${(result as any).revisionNo}. Receipt: BID-${(result as any).responseId}-${(result as any).revisionNo}`,
    `/supplier/tenders/${t.id}`);
  res.json({ ok: true, receipt: `BID-${(result as any).responseId}-${(result as any).revisionNo}`, revision: (result as any).revisionNo });
});

// my submitted bid (versions immutable)
r.get('/my/:tenderId(\\d+)', requireSupplier, async (req, res) => {
  const resp = await q1('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2', [req.params.tenderId, req.user!.orgId]);
  if (!resp) return res.json({ response: null });
  const revisions = await q('SELECT * FROM bid_revision WHERE response_id=$1 ORDER BY revision_no DESC', [resp.id]);
  for (const rev of revisions) {
    rev.quotes = await q(`SELECT bq.*, ti.line_no, ti.description, ti.uom FROM bid_item_quote bq JOIN tender_item ti ON ti.id=bq.tender_item_id WHERE bq.revision_id=$1 ORDER BY ti.line_no, bq.option_no`, [rev.id]);
    rev.requirementAnswers = await q('SELECT * FROM bid_requirement_answer WHERE revision_id=$1', [rev.id]);
  }
  res.json({ response: resp, revisions });
});

r.post('/my/:tenderId(\\d+)/withdraw', requireSupplier, async (req, res) => {
  const resp = await q1('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2', [req.params.tenderId, req.user!.orgId]);
  if (!resp || resp.status !== 'submitted') return bad(res, 'invalid_state');
  await q(`UPDATE bid_response SET status='withdrawn' WHERE id=$1`, [resp.id]);
  await audit(req, 'bid_withdrawn', 'bid', resp.id, { reason: req.body?.reason });
  res.json({ ok: true });
});

// ---------- Excel template + import (spec 7.9 import) ----------
r.get('/my/:tenderId(\\d+)/template.xlsx', requireSupplier, async (req, res) => {
  const items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [req.params.tenderId]);
  const t = await q1('SELECT tender_no FROM tender WHERE id=$1', [req.params.tenderId]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BidTemplate');
  ws.columns = [
    { header: 'Line', key: 'line_no', width: 6 }, { header: 'PR No', key: 'pr_no', width: 12 },
    { header: 'Material No', key: 'material_no', width: 14 }, { header: 'Description', key: 'description', width: 44 },
    { header: 'Qty', key: 'quantity', width: 10 }, { header: 'UOM', key: 'uom', width: 8 },
    { header: 'Currency', key: 'currency', width: 10 }, { header: 'Unit Price', key: 'unit_price', width: 14 },
    { header: 'Lead Time (days)', key: 'lead_time', width: 14 }, { header: 'Incoterm', key: 'incoterm', width: 10 },
    { header: 'Manufacturer', key: 'manufacturer', width: 18 }, { header: 'Part No', key: 'part_no', width: 14 },
    { header: 'Alternative (Y/N)', key: 'alternative', width: 14 }, { header: 'Comment', key: 'comment', width: 26 },
  ];
  ws.getRow(1).font = { bold: true };
  items.forEach(it => ws.addRow({
    line_no: it.line_no, pr_no: it.pr_no, material_no: it.material_no, description: it.description,
    quantity: Number(it.quantity), uom: it.uom, currency: '', unit_price: '', lead_time: '',
    incoterm: '', manufacturer: it.manufacturer || '', part_no: it.part_no || '', alternative: 'N', comment: '',
  }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${t?.tender_no || 'bid'}-template-v1.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

import multer from 'multer';
const upload = multer({ dest: '/tmp/oasis-uploads', limits: { fileSize: 30 * 1024 * 1024 } });

r.post('/my/:tenderId(\\d+)/import', requireSupplier, upload.single('file'), async (req, res) => {
  if (!req.file) return bad(res, 'file_required');
  const items = await q('SELECT * FROM tender_item WHERE tender_id=$1 ORDER BY line_no', [req.params.tenderId]);
  const byLine: Record<number, any> = {};
  items.forEach(i => byLine[i.line_no] = i);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(req.file.path); } catch { return bad(res, 'invalid_excel'); }
  const ws = wb.worksheets[0];
  const rows: any[] = []; const errors: any[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const c = (n: number) => { const v = row.getCell(n).value as any; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
    const lineNo = Number(c(1));
    if (!lineNo) return;
    const item = byLine[lineNo];
    if (!item) { errors.push({ row: rowNumber, error: 'unknown_line', line: lineNo }); return; }
    const priceRaw = c(8);
    if (priceRaw === null || priceRaw === undefined || priceRaw === '') return; // not quoted
    const price = parseMoney(priceRaw);
    if (price === null || price < 0) { errors.push({ row: rowNumber, error: 'invalid_price', value: String(priceRaw) }); return; }
    const currency = String(c(7) || 'MNT').toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(currency)) { errors.push({ row: rowNumber, error: 'invalid_currency', value: currency }); return; }
    // DEF-02 control: manufacturer coerced to string, never raw JSON/number
    const manufacturer = c(11) === null || c(11) === undefined ? null : String(c(11));
    rows.push({
      tender_item_id: item.id, line_no: lineNo, currency, unit_price: price,
      quantity: Number(item.quantity),
      lead_time_value: Number(c(9)) || null, incoterm: c(10) ? String(c(10)) : null,
      manufacturer, part_no: c(12) === null || c(12) === undefined ? null : String(c(12)),
      is_alternative: String(c(13) || 'N').toUpperCase().startsWith('Y'),
      comment: c(14) ? String(c(14)) : null,
    });
  });
  res.json({ imported: rows.length, errors, rows });
});

// ---------- Negotiation (spec 8.14, DEF-09/DEF-10 controls) ----------
r.post('/negotiation/:tenderId(\\d+)/rounds', requireInternal, requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const t = await q1('SELECT * FROM tender WHERE id=$1', [req.params.tenderId]);
  if (!t || !['in_evaluation', 'negotiation'].includes(t.status)) return bad(res, 'invalid_state', t?.status);
  const { orgIds, closes_at, price_increase_allowed, scope_change_reason } = req.body || {};
  if (price_increase_allowed && !scope_change_reason) return bad(res, 'scope_change_reason_required');
  if (!orgIds?.length) return bad(res, 'orgs_required');
  const rn = await q1('SELECT COALESCE(max(round_no),0)+1 AS n FROM negotiation_round WHERE tender_id=$1', [t.id]);
  const round = (await q(
    `INSERT INTO negotiation_round(tender_id, round_no, closes_at, price_increase_allowed, scope_change_reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [t.id, rn.n, closes_at || null, !!price_increase_allowed, scope_change_reason || null, req.user!.id]))[0];
  for (const oid of orgIds) {
    const resp = await q1('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2', [t.id, oid]);
    const baseRev = resp ? await q1('SELECT id FROM bid_revision WHERE response_id=$1 ORDER BY revision_no DESC LIMIT 1', [resp.id]) : null;
    await q(`INSERT INTO negotiation_participant(round_id, organization_id, baseline_revision_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [round.id, oid, baseRev?.id || null]);
    await notifyOrg(oid, 'clarification', 'Үнийн тохиролцооны урилга', 'Negotiation invitation',
      `${t.tender_no}: ${rn.n}-р шатны үнийн санал шинэчлэх боломж нээгдлээ.`,
      `${t.tender_no}: negotiation round ${rn.n} is open for revised pricing.`, `/supplier/tenders/${t.id}`);
  }
  await q(`UPDATE tender SET status='negotiation', updated_at=now() WHERE id=$1`, [t.id]);
  await audit(req, 'negotiation_round_created', 'tender', t.id, { after: `round ${rn.n}` });
  res.json(round);
});

r.get('/negotiation/:tenderId(\\d+)/rounds', requireAuth, async (req, res) => {
  const rows = await q(
    `SELECT nr.*, (SELECT json_agg(json_build_object('organization_id', np.organization_id, 'submitted', np.submitted_revision_id IS NOT NULL))
        FROM negotiation_participant np WHERE np.round_id=nr.id) AS participants
     FROM negotiation_round nr WHERE nr.tender_id=$1 ORDER BY nr.round_no`, [req.params.tenderId]);
  res.json(rows);
});

// supplier submits revised prices in a round — price increase blocked unless allowed (DEF-10)
r.post('/negotiation/round/:roundId(\\d+)/submit', requireSupplier, async (req, res) => {
  const round = await q1('SELECT * FROM negotiation_round WHERE id=$1', [req.params.roundId]);
  if (!round || round.status !== 'open') return bad(res, 'round_closed');
  if (round.closes_at && new Date(round.closes_at) < new Date()) return bad(res, 'round_closed');
  const part = await q1('SELECT * FROM negotiation_participant WHERE round_id=$1 AND organization_id=$2', [round.id, req.user!.orgId]);
  if (!part) return bad(res, 'not_invited');
  const resp = await q1('SELECT * FROM bid_response WHERE tender_id=$1 AND organization_id=$2', [round.tender_id, req.user!.orgId]);
  if (!resp) return bad(res, 'no_bid');
  const baseQuotes = part.baseline_revision_id
    ? await q('SELECT * FROM bid_item_quote WHERE revision_id=$1', [part.baseline_revision_id]) : [];
  const newQuotes: any[] = req.body?.quotes || [];
  const errors: any[] = [];
  for (const nq of newQuotes) {
    const baseline = baseQuotes.find(b => b.tender_item_id === nq.tender_item_id && b.option_no === (nq.option_no || 1));
    const price = parseMoney(nq.unit_price);
    if (price === null || price < 0) { errors.push({ item: nq.tender_item_id, error: 'invalid_price' }); continue; }
    if (baseline && !round.price_increase_allowed && price > Number(baseline.unit_price) + 1e-9) {
      errors.push({ item: nq.tender_item_id, error: 'price_increase_blocked', baseline: Number(baseline.unit_price), attempted: price });
    }
  }
  if (errors.length) return res.status(400).json({ error: 'validation_failed', errors });
  const result = await tx(async c => {
    const revNo = resp.current_revision + 1;
    const rev = (await c.query(`INSERT INTO bid_revision(response_id, revision_no, source_type, submitted_by) VALUES ($1,$2,'negotiation',$3) RETURNING *`,
      [resp.id, revNo, req.user!.id])).rows[0];
    // carry forward baseline quotes, override with new prices (original history immutable — DEF-09)
    for (const bqt of baseQuotes) {
      const override = newQuotes.find(nq => nq.tender_item_id === bqt.tender_item_id && (nq.option_no || 1) === bqt.option_no);
      const price = override ? parseMoney(override.unit_price)! : Number(bqt.unit_price);
      await c.query(
        `INSERT INTO bid_item_quote(revision_id, tender_item_id, option_no, currency, unit_price, quantity, total_price,
           lead_time_value, lead_time_unit, incoterm, delivery_location, is_alternative, manufacturer, part_no, comment,
           datasheet_attachment_id, license_attachment_id, certificate_attachment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [rev.id, bqt.tender_item_id, bqt.option_no, bqt.currency, price, Number(bqt.quantity), round4(price * Number(bqt.quantity)),
         bqt.lead_time_value, bqt.lead_time_unit, bqt.incoterm, bqt.delivery_location, bqt.is_alternative,
         bqt.manufacturer, bqt.part_no, override?.comment || bqt.comment,
         bqt.datasheet_attachment_id, bqt.license_attachment_id, bqt.certificate_attachment_id]);
    }
    await c.query('UPDATE bid_response SET current_revision=$1, submitted_at=now() WHERE id=$2', [revNo, resp.id]);
    await c.query('UPDATE negotiation_participant SET submitted_revision_id=$1 WHERE round_id=$2 AND organization_id=$3',
      [rev.id, round.id, req.user!.orgId]);
    return revNo;
  });
  await audit(req, 'negotiation_bid_submitted', 'bid', resp.id, { after: `round ${round.round_no}, rev ${result}` });
  res.json({ ok: true, revision: result });
});

r.post('/negotiation/round/:roundId(\\d+)/close', requireInternal, requireRole('Buyer', 'SystemAdmin'), async (req, res) => {
  const round = await q1('SELECT * FROM negotiation_round WHERE id=$1', [req.params.roundId]);
  if (!round || round.status !== 'open') return bad(res, 'invalid_state');
  await q(`UPDATE negotiation_round SET status='closed' WHERE id=$1`, [round.id]);
  await q(`UPDATE tender SET status='in_evaluation', updated_at=now() WHERE id=$1 AND status='negotiation'`, [round.tender_id]);
  // outcome summary: original vs current per participant (DEF-09 control)
  const parts = await q('SELECT * FROM negotiation_participant WHERE round_id=$1', [round.id]);
  const outcome: any[] = [];
  for (const p of parts) {
    const sumOf = async (revId: number | null) => revId
      ? Number((await q1(`SELECT COALESCE(sum(total_price),0) AS s FROM bid_item_quote WHERE revision_id=$1 AND is_alternative=false`, [revId]))?.s || 0) : null;
    const orig = await sumOf(p.baseline_revision_id);
    const curr = await sumOf(p.submitted_revision_id) ?? orig;
    outcome.push({ organization_id: p.organization_id, original: orig, current: curr, delta: orig !== null && curr !== null ? round4(curr - orig) : null });
  }
  await audit(req, 'negotiation_round_closed', 'tender', round.tender_id, { after: JSON.stringify(outcome).slice(0, 500) });
  res.json({ ok: true, outcome });
});

export default r;
