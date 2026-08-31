import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { useToast, Field } from '../../ui';

export default function Login() {
  const { t, lang, setLang } = useLang();
  const { setSession } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (d: any) => {
    setSession(d.user, null, d.token);
    nav(d.user.userType === 'internal' ? '/admin' : '/supplier');
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const d = await post('/auth/login', { email, password });
      if (d.mfa) { setOtpMode(true); toast(t('otp_prompt')); }
      else finish(d);
    } catch (err: any) {
      if (err.status === 423) toast(t('account_locked'), 'err');
      else toast(t('invalid_credentials'), 'err');
    } finally { setBusy(false); }
  };

  const doOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { finish(await post('/auth/login/otp', { email, otp })); }
    catch { toast(t('invalid_credentials'), 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-photo">
        <div className="caption">
          <h2>OASIS v2</h2>
          <p>Oyu Advanced Supplier Integrated System — нийлүүлэгчийн бүртгэл, тендер, үнэлгээ, гэрээний нэгдсэн систем.</p>
        </div>
      </div>
      <div className="auth-panel">
        <div className="logo">
          <img src="/ot-logo.svg" alt="OT" />
          <div>Оюу Толгой<br /><span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 400 }}>OASIS v2.0</span></div>
        </div>
        <h1>{t('welcome')}</h1>
        <div className="sub">{t('login_sub')}</div>
        {!otpMode ? (
          <form onSubmit={doLogin}>
            <Field label={t('email')} required>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required placeholder="name@company.mn" />
            </Field>
            <Field label={t('password')} required>
              <div style={{ position: 'relative' }}>
                <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required />
                <span style={{ position: 'absolute', right: 10, top: 9, cursor: 'pointer' }} onClick={() => setShow(s => !s)}>{show ? '🙈' : '👁'}</span>
              </div>
            </Field>
            <div className="row between mb16">
              <label className="checkbox"><input type="checkbox" /> {t('remember')}</label>
              <Link to="/forgot">{t('forgot')}</Link>
            </div>
            <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12 }} disabled={busy}>{t('login_title')}</button>
          </form>
        ) : (
          <form onSubmit={doOtp}>
            <Field label="OTP" hint={t('otp_prompt')}>
              <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} autoFocus style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }} />
            </Field>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('confirm')}</button>
          </form>
        )}
        <p className="mut" style={{ marginTop: 22 }}>
          {t('no_account')} <Link to="/register" className="bold">{t('register')}</Link>
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost sm" onClick={() => setLang(lang === 'mn' ? 'en' : 'mn')}>🌐 {lang === 'mn' ? 'English' : 'Монгол'}</button>
        </div>
        <p className="mut" style={{ marginTop: 26, fontSize: 11 }}>
          Демо хэрэглэгчид (нууц үг: Oasis@2026): supplier@test.mn · buyer@oasis.mn · admin@oasis.mn · approver@oasis.mn · enduser@oasis.mn
        </p>
      </div>
    </div>
  );
}
