import { Router } from 'express';
import { q, q1 } from '../db';
import { requireAuth, requireSupplier, requireInternal, requireRole } from '../util/auth';
import { audit, notify, notifyOrg, bad } from '../util/helpers';

const r = Router();
r.use(requireAuth);

async function loadProgram(programId: number) {
  const program = await q1('SELECT * FROM qual_program WHERE id=$1', [programId]);
  if (!program) return null;
  const sections = await q('SELECT * FROM qual_section WHERE program_id=$1 ORDER BY order_no', [programId]);
  for (const s of sections) {
    s.questions = await q('SELECT * FROM qual_question WHERE section_id=$1 ORDER BY order_no', [s.id]);
  }
  return { program, sections };
}

// list programs
r.get('/programs', async (_req, res) => {
  res.json(await q('SELECT * FROM qual_program WHERE active=true ORDER BY id'));
});

r.get('/programs/:id', async (req, res) => {
  const data = await loadProgram(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(data);
});

// ============ SUPPLIER SIDE ============
r.get('/my', requireSupplier, async (req, res) => {
  const rows = await q(
    `SELECT qs.*, p.code, p.name_mn AS program_name_mn, p.name_en AS program_name_en, p.ptype
     FROM qual_submission qs JOIN qual_program p ON p.id=qs.program_id
     WHERE qs.organization_id=$1 ORDER BY qs.id DESC`, [req.user!.orgId]);
  res.json(rows);
});

// start or resume a submission (draft)
r.post('/my/start/:programId', requireSupplier, async (req, res) => {
  const programId = Number(req.params.programId);
  const existing = await q1(
    `SELECT * FROM qual_submission WHERE organization_id=$1 AND program_id=$2 AND status IN ('draft','needs_improvement') ORDER BY id DESC LIMIT 1`,
    [req.user!.orgId, programId]);
  if (existing) return res.json(existing);
  const inflight = await q1(
    `SELECT * FROM qual_submission WHERE organization_id=$1 AND program_id=$2 AND status IN ('submitted','screening') LIMIT 1`,
    [req.user!.orgId, programId]);
  if (inflight) return bad(res, 'already_in_review');
  const ver = await q1('SELECT COALESCE(max(version_no),0)+1 AS v FROM qual_submission WHERE organization_id=$1 AND program_id=$2',
    [req.user!.orgId, programId]);
  const row = (await q(`INSERT INTO qual_submission(organization_id, program_id, version_no) VALUES ($1,$2,$3) RETURNING *`,
    [req.user!.orgId, programId, ver.v]))[0];
  res.json(row);
});

r.get('/my/submission/:id', requireSupplier, async (req, res) => {
  const sub = await q1('SELECT * FROM qual_submission WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const answers = await q('SELECT * FROM qual_answer WHERE submission_id=$1', [sub.id]);
  const reviews = ['needs_improvement', 'approved', 'rejected'].includes(sub.status)
    ? await q('SELECT * FROM qual_question_review WHERE submission_id=$1', [sub.id]) : [];
  const data = await loadProgram(sub.program_id);
  res.json({ submission: sub, answers, reviews, ...data });
});

// autosave answers (draft only)
r.put('/my/submission/:id/answers', requireSupplier, async (req, res) => {
  const sub = await q1('SELECT * FROM qual_submission WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'needs_improvement'].includes(sub.status)) return bad(res, 'immutable_after_submit');
  const answers: any[] = req.body?.answers || [];
  if (!Array.isArray(answers)) return bad(res, 'invalid_answers', 'answers must be an array');
  for (const a of answers) {
    await q(
      `INSERT INTO qual_answer(submission_id, question_id, value_text, value_number, value_date, value_bool, value_options, attachment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (submission_id, question_id) DO UPDATE SET value_text=$3, value_number=$4, value_date=$5, value_bool=$6, value_options=$7, attachment_id=COALESCE($8, qual_answer.attachment_id)`,
      [sub.id, a.question_id, a.value_text ?? null, a.value_number ?? null, a.value_date || null,
       a.value_bool ?? null, a.value_options ? JSON.stringify(a.value_options) : null, a.attachment_id || null]);
  }
  res.json({ ok: true, saved: answers.length });
});

r.post('/my/submission/:id/submit', requireSupplier, async (req, res) => {
  const sub = await q1('SELECT * FROM qual_submission WHERE id=$1 AND organization_id=$2', [req.params.id, req.user!.orgId]);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  if (!['draft', 'needs_improvement'].includes(sub.status)) return bad(res, 'invalid_state', sub.status);
  // server-side required validation (spec DEF-03 class of control)
  const missing = await q(
    `SELECT qq.id, qq.code, qq.label_mn FROM qual_question qq
       JOIN qual_section s ON s.id=qq.section_id
      WHERE s.program_id=$1 AND qq.required=true
        AND NOT EXISTS (SELECT 1 FROM qual_answer a WHERE a.submission_id=$2 AND a.question_id=qq.id
          AND (a.value_text IS NOT NULL OR a.value_number IS NOT NULL OR a.value_date IS NOT NULL OR a.value_bool IS NOT NULL OR a.value_options IS NOT NULL OR a.attachment_id IS NOT NULL))`,
    [sub.program_id, sub.id]);
  if (missing.length) return res.status(400).json({ error: 'required_missing', questions: missing });
  const missingEvidence = await q(
    `SELECT qq.id, qq.code, qq.label_mn FROM qual_question qq
       JOIN qual_section s ON s.id=qq.section_id
       JOIN qual_answer a ON a.submission_id=$2 AND a.question_id=qq.id
      WHERE s.program_id=$1 AND qq.evidence_required=true AND a.attachment_id IS NULL`,
    [sub.program_id, sub.id]);
  if (missingEvidence.length) return res.status(400).json({ error: 'evidence_missing', questions: missingEvidence });
  await q(`UPDATE qual_submission SET status='submitted', submitted_at=now() WHERE id=$1`, [sub.id]);
  await audit(req, 'qualification_submitted', 'qualification', sub.id);
  const reviewers = await q(`SELECT id FROM app_user WHERE user_type='internal' AND role IN ('Screening','SystemAdmin')`);
  const org = await q1('SELECT name_mn FROM organization WHERE id=$1', [sub.organization_id]);
  for (const rv of reviewers) {
    await notify(rv.id, null, 'qualification', 'Шинэ qualification илгээгдлээ', 'New qualification submitted',
      `${org.name_mn}`, `${org.name_mn}`, `/admin/qualification/${sub.id}`);
  }
  res.json({ ok: true, status: 'submitted' });
});

// ============ ADMIN SIDE (spec 8.5) ============
r.get('/queue', requireInternal, async (req, res) => {
  const { status } = req.query as any;
  const cond = status ? `qs.status='${String(status).replace(/'/g, '')}'` : `qs.status IN ('submitted','screening')`;
  const rows = await q(
    `SELECT qs.*, o.name_mn AS org_name, o.registry_no, p.name_mn AS program_name, p.ptype
     FROM qual_submission qs JOIN organization o ON o.id=qs.organization_id JOIN qual_program p ON p.id=qs.program_id
     WHERE ${cond} ORDER BY qs.submitted_at NULLS LAST`);
  res.json(rows);
});

r.get('/review/:id', requireInternal, async (req, res) => {
  const sub = await q1(
    `SELECT qs.*, o.name_mn AS org_name, o.registry_no, o.khur_verified FROM qual_submission qs JOIN organization o ON o.id=qs.organization_id WHERE qs.id=$1`,
    [req.params.id]);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  const answers = await q('SELECT * FROM qual_answer WHERE submission_id=$1', [sub.id]);
  const reviews = await q('SELECT * FROM qual_question_review WHERE submission_id=$1', [sub.id]);
  const prev = await q(
    `SELECT * FROM qual_submission WHERE organization_id=$1 AND program_id=$2 AND id<>$3 ORDER BY version_no DESC LIMIT 3`,
    [sub.organization_id, sub.program_id, sub.id]);
  const data = await loadProgram(sub.program_id);
  res.json({ submission: sub, answers, reviews, previous: prev, ...data });
});

r.post('/review/:id/start', requireInternal, requireRole('Screening', 'Compliance', 'SystemAdmin'), async (req, res) => {
  await q(`UPDATE qual_submission SET status='screening', reviewer_id=$1 WHERE id=$2 AND status='submitted'`, [req.user!.id, req.params.id]);
  await audit(req, 'qualification_screening_started', 'qualification', req.params.id);
  res.json({ ok: true });
});

r.put('/review/:id/question/:qid', requireInternal, async (req, res) => {
  const { result, comment } = req.body || {};
  await q(
    `INSERT INTO qual_question_review(submission_id, question_id, result, comment, reviewer_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (submission_id, question_id) DO UPDATE SET result=$3, comment=$4, reviewer_id=$5`,
    [req.params.id, req.params.qid, result || null, comment || null, req.user!.id]);
  res.json({ ok: true });
});

r.post('/review/:id/decide', requireInternal, requireRole('Screening', 'Compliance', 'SystemAdmin'), async (req, res) => {
  const { decision, comment, risk_score, expires_on } = req.body || {}; // approve | needs_improvement | reject
  const sub = await q1('SELECT * FROM qual_submission WHERE id=$1', [req.params.id]);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  if (!['submitted', 'screening'].includes(sub.status)) return bad(res, 'invalid_state', sub.status);
  // decision requires no unresolved failed questions (spec 8.5 review workspace rule)
  const failed = await q(`SELECT count(*)::int AS c FROM qual_question_review WHERE submission_id=$1 AND result='fail'`, [sub.id]);
  if (decision === 'approve' && failed[0].c > 0) return bad(res, 'unresolved_failures', failed[0].c);
  if (decision !== 'approve' && !comment) return bad(res, 'reason_required');
  const newStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_improvement';
  await q(`UPDATE qual_submission SET status=$1, decided_at=now(), decision_comment=$2, risk_score=$3, expires_on=$4, reviewer_id=$5 WHERE id=$6`,
    [newStatus, comment || null, risk_score || null, expires_on || (decision === 'approve' ? new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) : null), req.user!.id, sub.id]);
  await audit(req, 'qualification_decision', 'qualification', sub.id, { reason: comment, before: sub.status, after: newStatus });
  const msgs: any = {
    approved: ['Урьдчилсан үнэлгээ батлагдлаа', 'Pre-qualification approved', 'Таны урьдчилсан үнэлгээ амжилттай батлагдлаа.', 'Your pre-qualification has been approved.'],
    needs_improvement: ['Үнэлгээ сайжруулах шаардлагатай', 'Qualification needs improvement', `Тайлбар: ${comment}`, `Comment: ${comment}`],
    rejected: ['Үнэлгээ татгалзагдлаа', 'Qualification rejected', `Шалтгаан: ${comment}`, `Reason: ${comment}`],
  };
  const m = msgs[newStatus];
  await notifyOrg(sub.organization_id, 'qualification', m[0], m[1], m[2], m[3], '/supplier/qualification');
  res.json({ ok: true, status: newStatus });
});

export default r;
