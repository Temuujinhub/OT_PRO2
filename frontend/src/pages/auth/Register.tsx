import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post, get } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { useToast, Field } from '../../ui';

export default function Register() {
  const { t } = useLang();
  const { toast } = useToast();
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({
    email: '', token: '', devToken: '', password: '', confirmPassword: '', displayName: '', phone: '',
    orgType: 'company', residency: 'national', registryNo: '', companyNameMn: '', companyNameEn: '',
    khurResult: null as any, terms: false, language: 'mn',
  });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const start = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const d = await post('/auth/register/start', { email: f.email });
      set('devToken', d.devToken);
      toast(t('verification_sent'), 'ok');
      setStep(2);
    } catch (err: any) {
      toast(err.code === 'email_taken' ? 'Энэ имэйл бүртгэлтэй байна / Email already registered' : t('error'), 'err');
    } finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await post('/auth/register/verify', { email: f.email, token: f.token }); setStep(3); }
    catch { toast('Код буруу байна / Invalid code', 'err'); }
    finally { setBusy(false); }
  };

  const checkKhur = async () => {
    if (!f.registryNo) return;
    try {
      const d = await get(`/auth/khur/${f.registryNo}`);
      set('khurResult', d);
      set('companyNameMn', d.name_mn); set('companyNameEn', d.name_en || '');
      toast(t('khur_found'), 'ok');
    } catch { set('khurResult', false); toast(t('khur_not_found'), 'err'); }
  };

  const complete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.terms) return toast(t('terms_agree'), 'err');
    if (f.password !== f.confirmPassword) return toast('Нууц үг таарахгүй байна / Passwords do not match', 'err');
    setBusy(true);
    try {
      const d = await post('/auth/register/complete', {
        email: f.email, token: f.token, password: f.password, confirmPassword: f.confirmPassword,
        displayName: f.displayName, phone: f.phone, language: f.language,
        orgType: f.orgType, residency: f.residency, registryNo: f.registryNo || undefined,
        companyNameMn: f.companyNameMn, companyNameEn: f.companyNameEn,
      });
      setSession(d.user, null, d.token);
      toast(t('welcome'), 'ok');
      nav('/supplier/profile');
    } catch (err: any) {
      const map: any = {
        weak_password: t('password_rule'),
        registry_already_registered: 'Энэ регистрийн дугаар аль хэдийн бүртгэлтэй / Registry number already registered',
        company_info_required: 'Байгууллагын мэдээлэл дутуу / Company info required',
      };
      toast(map[err.code] || t('error'), 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-photo">
        <div className="caption"><h2>OASIS v2</h2><p>Нийлүүлэгчээр бүртгүүлж Оюу Толгойн тендерт оролцоорой.</p></div>
      </div>
      <div className="auth-panel">
        <div className="logo"><img src="/ot-logo.svg" alt="OT" /><div>Оюу Толгой</div></div>
        <h1>{t('register')}</h1>
        <div className="sub">{step}/3 — {step === 1 ? t('reg_step1') : step === 2 ? t('verify_code') : t('reg_step3')}</div>

        {step === 1 && (
          <form onSubmit={start}>
            <Field label={t('email')} required>
              <input type="email" value={f.email} onChange={e => set('email', e.target.value)} required autoFocus />
            </Field>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('next')}</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verify}>
            <Field label={t('verify_code')} hint={`Демо код: ${f.devToken}`}>
              <input value={f.token} onChange={e => set('token', e.target.value)} required autoFocus />
            </Field>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('confirm')}</button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={complete}>
            <Field label={t('your_name')} required>
              <input value={f.displayName} onChange={e => set('displayName', e.target.value)} required />
            </Field>
            <div className="grid g2">
              <Field label={t('password')} required hint={t('password_rule')}>
                <input type="password" value={f.password} onChange={e => set('password', e.target.value)} required />
              </Field>
              <Field label={t('confirm_password')} required>
                <input type="password" value={f.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required />
              </Field>
            </div>
            <Field label={t('phone')}>
              <input value={f.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <div className="grid g2">
              <Field label={t('type')}>
                <select value={f.orgType} onChange={e => set('orgType', e.target.value)}>
                  <option value="company">{t('org_company')}</option>
                  <option value="individual">{t('org_individual')}</option>
                </select>
              </Field>
              {f.orgType === 'company' && (
                <Field label="Харьяалал / Residency">
                  <select value={f.residency} onChange={e => set('residency', e.target.value)}>
                    <option value="national">{t('res_national')}</option>
                    <option value="international">{t('res_international')}</option>
                  </select>
                </Field>
              )}
            </div>
            {f.orgType === 'company' && f.residency === 'national' && (
              <Field label={t('registry_no')} required hint="Демо: 3341190, 1112223, 7208856">
                <div className="row">
                  <input style={{ flex: 1 }} value={f.registryNo} onChange={e => set('registryNo', e.target.value)} />
                  <button type="button" className="btn teal sm" onClick={checkKhur}>{t('khur_check')}</button>
                </div>
                {f.khurResult && <div className="chip green" style={{ marginTop: 6 }}>✓ {t('khur_found')}: {f.khurResult.name_mn}</div>}
              </Field>
            )}
            {(f.orgType === 'individual' || f.residency === 'international' || f.khurResult === false) && (
              <>
                <Field label={t('company_name_mn')} required>
                  <input value={f.companyNameMn} onChange={e => set('companyNameMn', e.target.value)} required />
                </Field>
                <Field label={t('company_name_en')}>
                  <input value={f.companyNameEn} onChange={e => set('companyNameEn', e.target.value)} />
                </Field>
              </>
            )}
            <label className="checkbox field">
              <input type="checkbox" checked={f.terms} onChange={e => set('terms', e.target.checked)} /> {t('terms_agree')}
            </label>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('register')}</button>
          </form>
        )}

        <p className="mut" style={{ marginTop: 20 }}>{t('have_account')} <Link to="/login" className="bold">{t('login')}</Link></p>
      </div>
    </div>
  );
}
