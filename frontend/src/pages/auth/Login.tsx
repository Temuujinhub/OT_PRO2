import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../../api';
import { useLang } from '../../i18n';
import { useAuth } from '../../App';
import { useToast, Field } from '../../ui';

export function LangTop() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-top lang-select">
      <select value={lang} onChange={e => setLang(e.target.value)} aria-label="Language">
        <option value="mn">🇲🇳 Монгол</option>
        <option value="en">🇬🇧 English</option>
      </select>
    </div>
  );
}

const IcoMail = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="m3 6 7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcoEye = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M1.7 10S4.7 4.6 10 4.6 18.3 10 18.3 10 15.3 15.4 10 15.4 1.7 10 1.7 10Z" strokeLinejoin="round" />
    <circle cx="10" cy="10" r="2.6" />
  </svg>
);
const IcoEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8.1 5a7.8 7.8 0 0 1 1.9-.2c5.3 0 8.3 5.2 8.3 5.2a15 15 0 0 1-2.3 3M5 6.3A14.7 14.7 0 0 0 1.7 10S4.7 15.2 10 15.2c1.3 0 2.4-.3 3.4-.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m3 3 14 14" strokeLinecap="round" />
  </svg>
);
const IcoAlert = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flexShrink: 0 }}>
    <circle cx="10" cy="10" r="7.5" /><path d="M10 6.2v4.4M10 13.4h.01" strokeLinecap="round" />
  </svg>
);

export function AuthLogo() {
  return (
    <div className="logo">
      <img src="/ot-logo.svg" alt="Оюу Толгой" width={48} height={48} />
      <div>Оюу Толгой<span>Supplier System · OASIS v2</span></div>
    </div>
  );
}

export default function Login() {
  const { t } = useLang();
  const { setSession } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const finish = (d: any) => {
    setSession(d.user, null, d.token);
    nav(d.user.userType === 'internal' ? '/admin' : '/supplier');
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const d = await post('/auth/login', { email, password });
      if (d.mfa) { setOtpMode(true); toast(t('otp_prompt')); }
      else finish(d);
    } catch (e2: any) {
      const msg = e2.status === 423 ? t('account_locked') : t('invalid_credentials');
      setErr(msg); toast(msg, 'err');
    } finally { setBusy(false); }
  };

  const doOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    setErr('');
    try { finish(await post('/auth/login/otp', { email, otp })); }
    catch { setErr(t('invalid_credentials')); toast(t('invalid_credentials'), 'err'); }
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
        <LangTop />
        <AuthLogo />
        <h1>{t('welcome')}</h1>
        <div className="sub">{t('login_sub')}</div>
        {!otpMode ? (
          <form onSubmit={doLogin}>
            <div className="auth-divider">{t('login_title')}</div>
            <div className="field">
              <label htmlFor="lg-email">{t('email')}</label>
              <input id="lg-email" name="email" type="email" value={email} autoComplete="username"
                onChange={e => { setEmail(e.target.value); setErr(''); }} autoFocus required
                aria-invalid={!!err} placeholder="name@company.mn" />
              <span className="tail-ico" aria-hidden="true"><IcoMail /></span>
            </div>
            <div className="field">
              <label htmlFor="lg-pass">{t('password')}</label>
              <input id="lg-pass" name="password" type={show ? 'text' : 'password'} value={password}
                autoComplete="current-password" onChange={e => { setPassword(e.target.value); setErr(''); }}
                required aria-invalid={!!err} placeholder="••••••••••" />
              <button type="button" className="tail-ico" onClick={() => setShow(s => !s)}
                aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харах'} aria-pressed={show}>
                {show ? <IcoEyeOff /> : <IcoEye />}
              </button>
            </div>
            {err && <div className="auth-error" role="alert"><IcoAlert />{err}</div>}
            <div className="row between mb16" style={{ marginTop: 4 }}>
              <label className="checkbox"><input type="checkbox" defaultChecked /> {t('remember')}</label>
              <Link to="/forgot" style={{ fontSize: 13 }}>{t('forgot')}</Link>
            </div>
            <button className="btn btn-login" disabled={busy}>{busy ? '…' : t('login')}</button>
          </form>
        ) : (
          <form onSubmit={doOtp}>
            <div className="auth-divider">OTP</div>
            <div className="field">
              <label>{t('otp_prompt')}</label>
              <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} autoFocus
                style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
            </div>
            <button className="btn btn-login" disabled={busy}>{t('confirm')}</button>
          </form>
        )}
        <p style={{ marginTop: 24, fontSize: 13 }}>
          <span className="mut">{t('no_account')}</span> <Link to="/register" className="bold">{t('register')}</Link>
        </p>
        <details className="demo-box">
          <summary>Демо хандалт</summary>
          <div className="demo-body">
            <div><span className="k">Нууц үг</span><code>Oasis@2026</code></div>
            <div><span className="k">Нийлүүлэгч</span><code>supplier@test.mn</code></div>
            <div><span className="k">Худалдан авагч</span><code>buyer@oasis.mn</code></div>
            <div><span className="k">Админ</span><code>admin@oasis.mn</code></div>
          </div>
        </details>
        <div className="foot-copy">© 2026 OYU TOLGOI LLC. Зохиогчийн эрх хамгаалагдсан</div>
      </div>
    </div>
  );
}
