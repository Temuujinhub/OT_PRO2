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

export function AuthLogo() {
  return (
    <div className="logo">
      <img src="/ot-logo.png" alt="Оюу Толгой" />
      <div>Оюу Толгой<span>OASIS — Supplier System v2.0</span></div>
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
        <LangTop />
        <AuthLogo />
        <h1>{t('welcome')}</h1>
        <div className="sub">{t('login_sub')}</div>
        {!otpMode ? (
          <form onSubmit={doLogin}>
            <div className="auth-divider">{t('login_title')}</div>
            <div className="field">
              <label>{t('email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required placeholder="name@company.mn" />
              <span className="tail-ico">✉</span>
            </div>
            <div className="field">
              <label>{t('password')}</label>
              <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••••" />
              <span className="tail-ico" onClick={() => setShow(s => !s)}>{show ? '👁' : '🔒'}</span>
            </div>
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
        <p style={{ marginTop: 24, fontSize: 13.5 }}>
          <span className="mut">{t('no_account')}</span> <Link to="/register" className="bold">{t('register')}</Link>
        </p>
        <p className="mut" style={{ marginTop: 18, fontSize: 11 }}>
          Демо (нууц үг: Oasis@2026): supplier@test.mn · buyer@oasis.mn · admin@oasis.mn · approver@oasis.mn · enduser@oasis.mn
        </p>
        <div className="foot-copy">© 2026 OYU TOLGOI LLC. Зохиогчийн эрх хамгаалагдсан</div>
      </div>
    </div>
  );
}
