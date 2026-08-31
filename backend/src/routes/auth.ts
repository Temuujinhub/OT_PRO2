import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { q, q1 } from '../db';
import { signToken, requireAuth, AuthUser } from '../util/auth';
import { audit, sendEmail, bad, notify } from '../util/helpers';

const r = Router();

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function toAuthUser(u: any): AuthUser {
  return { id: u.id, email: u.email, name: u.display_name, userType: u.user_type, role: u.role, orgId: u.organization_id, lang: u.language };
}

// ---- Registration (spec 7.2) ----
r.post('/register/start', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'invalid_email');
  const existing = await q1('SELECT id, status FROM app_user WHERE email=$1', [email.toLowerCase()]);
  if (existing && existing.status !== 'pending_email') return bad(res, 'email_taken');
  const token = crypto.randomBytes(16).toString('hex');
  if (existing) {
    await q('UPDATE app_user SET email_verify_token=$1 WHERE id=$2', [token, existing.id]);
  } else {
    await q(`INSERT INTO app_user(email, password_hash, display_name, user_type, role, status, email_verify_token)
             VALUES ($1,'','','supplier','SupplierPrimary','pending_email',$2)`, [email.toLowerCase(), token]);
  }
  await sendEmail(email, 'OASIS - Registration verification / Бүртгэл баталгаажуулах',
    `Сайн байна уу,\n\nOASIS системд бүртгүүлэх хүсэлтээ баталгаажуулна уу.\nБаталгаажуулах код: ${token}\n\nVerify your OASIS registration with code: ${token}`);
  await audit(null, 'register_start', 'user', email);
  res.json({ ok: true, message: 'verification_sent', devToken: token });
});

r.post('/register/verify', async (req, res) => {
  const { email, token } = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE email=$1 AND email_verify_token=$2', [String(email || '').toLowerCase(), token]);
  if (!u) return bad(res, 'invalid_token');
  res.json({ ok: true });
});

r.post('/register/complete', async (req, res) => {
  const { email, token, password, confirmPassword, displayName, phone, language,
    orgType, residency, registryNo, companyNameMn, companyNameEn } = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE email=$1 AND email_verify_token=$2', [String(email || '').toLowerCase(), token]);
  if (!u) return bad(res, 'invalid_token');
  if (!password || !PASSWORD_RULE.test(password)) return bad(res, 'weak_password');
  if (password !== confirmPassword) return bad(res, 'password_mismatch');
  if (!orgType || !['company', 'individual'].includes(orgType)) return bad(res, 'invalid_org_type');
  if (orgType === 'company' && !companyNameMn && !registryNo) return bad(res, 'company_info_required');

  let khurVerified = false; let nameMn = companyNameMn || displayName; let nameEn = companyNameEn || '';
  let stateRegNo = null;
  if (orgType === 'company' && residency === 'national' && registryNo) {
    const reg = await q1('SELECT * FROM khur_registry WHERE registry_no=$1', [registryNo]);
    if (reg) { khurVerified = true; nameMn = reg.name_mn; nameEn = reg.name_en || nameEn; stateRegNo = reg.state_reg_no; }
  }
  const dup = registryNo ? await q1(`SELECT id FROM organization WHERE registry_no=$1 AND status NOT IN ('rejected')`, [registryNo]) : null;
  if (dup) return bad(res, 'registry_already_registered');

  const org = (await q(
    `INSERT INTO organization(org_type, residency, registry_no, state_reg_no, name_mn, name_en, khur_verified, khur_verified_at, country)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN now() ELSE NULL END, $8) RETURNING *`,
    [orgType, residency || 'national', registryNo || null, stateRegNo, nameMn || email, nameEn, khurVerified, residency === 'international' ? 'INT' : 'MN']))[0];
  await q(`INSERT INTO org_profile(organization_id, phone) VALUES ($1,$2)`, [org.id, phone || null]);
  await q(`INSERT INTO org_contact(organization_id, contact_type, full_name, email, phone1, receives_email) VALUES ($1,'primary',$2,$3,$4,true)`,
    [org.id, displayName || email, email.toLowerCase(), phone || null]);

  const hash = await bcrypt.hash(password, 10);
  await q(`UPDATE app_user SET password_hash=$1, display_name=$2, status='active', organization_id=$3, language=$4, email_verify_token=NULL WHERE id=$5`,
    [hash, displayName || email, org.id, language || 'mn', u.id]);
  await q(`INSERT INTO consent(user_id, consent_type, doc_version) VALUES ($1,'terms','1.0'),($1,'privacy','1.0')`, [u.id]);
  await audit(null, 'register_complete', 'organization', org.id, { after: nameMn });
  await notify(u.id, org.id, 'system', 'Тавтай морил!', 'Welcome!',
    'OASIS системд амжилттай бүртгэгдлээ. Профайлаа бөглөж илгээснээр тендерт оролцох боломжтой болно.',
    'Registration successful. Complete and submit your profile to participate in tenders.', '/supplier/profile');
  const authUser = toAuthUser({ ...u, display_name: displayName || email, user_type: 'supplier', role: 'SupplierPrimary', organization_id: org.id, language: language || 'mn' });
  res.json({ ok: true, token: signToken(authUser), user: authUser, khurVerified });
});

// ХУР/ДАН mock lookup (spec 12.3)
r.get('/khur/:registryNo', async (req, res) => {
  const reg = await q1('SELECT * FROM khur_registry WHERE registry_no=$1', [req.params.registryNo]);
  if (!reg) return res.status(404).json({ error: 'not_found', message: 'ХУР системд бүртгэл олдсонгүй' });
  res.json(reg);
});

// ---- Login (spec 7.1) ----
r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE email=$1', [String(email || '').toLowerCase()]);
  // do not reveal whether the account exists
  if (!u || u.status === 'pending_email') return res.status(401).json({ error: 'invalid_credentials' });
  if (u.status === 'locked') return res.status(423).json({ error: 'account_locked' });
  if (u.status === 'disabled') return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password || '', u.password_hash);
  if (!ok) {
    const fails = u.failed_logins + 1;
    await q('UPDATE app_user SET failed_logins=$1, status=CASE WHEN $1>=5 THEN \'locked\' ELSE status END WHERE id=$2', [fails, u.id]);
    await q(`INSERT INTO audit_event(actor_name, action, entity_type, entity_id) VALUES ($1,'login_failed','user',$2)`, [email, String(u.id)]);
    return res.status(401).json({ error: 'invalid_credentials', remaining: Math.max(0, 5 - fails) });
  }
  if (u.mfa_enabled) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await q(`UPDATE app_user SET otp_code=$1, otp_expires_at=now() + interval '5 minutes' WHERE id=$2`, [otp, u.id]);
    await sendEmail(u.email, 'OASIS - Login OTP', `Таны нэвтрэх нэг удаагийн код: ${otp}\nYour one-time login code: ${otp}`);
    return res.json({ mfa: true, message: 'otp_sent' });
  }
  await q('UPDATE app_user SET failed_logins=0, last_login_at=now() WHERE id=$1', [u.id]);
  const au = toAuthUser(u);
  await q(`INSERT INTO user_session(user_id, token_hash, device, ip, expires_at) VALUES ($1,$2,$3,$4, now() + interval '15 minutes')`,
    [u.id, 'jwt', req.headers['user-agent'] || '', req.ip]);
  await audit(null, 'login', 'user', u.id, { after: u.email });
  res.json({ token: signToken(au), user: au });
});

r.post('/login/otp', async (req, res) => {
  const { email, otp } = req.body || {};
  const u = await q1(`SELECT * FROM app_user WHERE email=$1 AND otp_code=$2 AND otp_expires_at > now()`, [String(email || '').toLowerCase(), otp]);
  if (!u) return res.status(401).json({ error: 'invalid_otp' });
  await q('UPDATE app_user SET otp_code=NULL, failed_logins=0, last_login_at=now() WHERE id=$1', [u.id]);
  const au = toAuthUser(u);
  await audit(null, 'login_mfa', 'user', u.id);
  res.json({ token: signToken(au), user: au });
});

// ---- Forgot / reset password ----
r.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE email=$1', [String(email || '').toLowerCase()]);
  if (u) {
    const token = crypto.randomBytes(16).toString('hex');
    await q('UPDATE app_user SET reset_token=$1 WHERE id=$2', [token, u.id]);
    await sendEmail(u.email, 'OASIS - Password reset / Нууц үг сэргээх',
      `Нууц үг сэргээх код: ${token}\nPassword reset code: ${token}`);
  }
  // Always the same answer — do not reveal account existence
  res.json({ ok: true, message: 'if_account_exists_email_sent' });
});

r.post('/reset', async (req, res) => {
  const { email, token, password } = req.body || {};
  if (!password || !PASSWORD_RULE.test(password)) return bad(res, 'weak_password');
  const u = await q1('SELECT * FROM app_user WHERE email=$1 AND reset_token=$2', [String(email || '').toLowerCase(), token]);
  if (!u) return bad(res, 'invalid_token');
  const hash = await bcrypt.hash(password, 10);
  await q(`UPDATE app_user SET password_hash=$1, reset_token=NULL, failed_logins=0, status=CASE WHEN status='locked' THEN 'active' ELSE status END WHERE id=$2`, [hash, u.id]);
  await audit(null, 'password_reset', 'user', u.id);
  res.json({ ok: true });
});

// ---- Me / session ----
r.get('/me', requireAuth, async (req, res) => {
  const u = await q1('SELECT id, email, display_name, user_type, role, organization_id, language, mfa_enabled, department, position, last_login_at FROM app_user WHERE id=$1', [req.user!.id]);
  let org = null;
  if (u?.organization_id) org = await q1('SELECT id, name_mn, name_en, status, completion_percent, org_type, residency, registry_no, vendor_no, khur_verified FROM organization WHERE id=$1', [u.organization_id]);
  res.json({ user: u, org, freshToken: signToken(req.user!) });
});

r.post('/me/language', requireAuth, async (req, res) => {
  const lang = req.body?.lang === 'en' ? 'en' : 'mn';
  await q('UPDATE app_user SET language=$1 WHERE id=$2', [lang, req.user!.id]);
  res.json({ ok: true });
});

r.post('/me/mfa', requireAuth, async (req, res) => {
  await q('UPDATE app_user SET mfa_enabled=$1 WHERE id=$2', [!!req.body?.enabled, req.user!.id]);
  await audit(req, 'mfa_changed', 'user', req.user!.id, { after: String(!!req.body?.enabled) });
  res.json({ ok: true });
});

r.post('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, password } = req.body || {};
  const u = await q1('SELECT * FROM app_user WHERE id=$1', [req.user!.id]);
  if (!(await bcrypt.compare(currentPassword || '', u.password_hash))) return bad(res, 'wrong_password');
  if (!PASSWORD_RULE.test(password || '')) return bad(res, 'weak_password');
  await q('UPDATE app_user SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(password, 10), u.id]);
  await audit(req, 'password_changed', 'user', u.id);
  res.json({ ok: true });
});

r.post('/logout', requireAuth, async (req, res) => {
  await q(`UPDATE user_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [req.user!.id]);
  await audit(req, 'logout', 'user', req.user!.id);
  res.json({ ok: true });
});

export default r;
