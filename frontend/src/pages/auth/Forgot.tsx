import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../../api';
import { useLang } from '../../i18n';
import { useToast, Field } from '../../ui';
import { AuthLogo, LangTop } from './Login';

export default function Forgot() {
  const { t } = useLang();
  const { toast } = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    await post('/auth/forgot', { email });
    toast('Сэргээх код имэйл рүү илгээгдлээ (демо: Мэйл хайрцаг хуудаснаас харна) / Reset code sent', 'ok');
    setStep(2);
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await post('/auth/reset', { email, token, password });
      toast('Нууц үг шинэчлэгдлээ / Password updated', 'ok');
      nav('/login');
    } catch (err: any) {
      toast(err.code === 'weak_password' ? t('password_rule') : 'Код буруу / Invalid code', 'err');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-photo"><div className="caption"><h2>OASIS v2</h2></div></div>
      <div className="auth-panel">
        <LangTop />
        <AuthLogo />
        <h1>{t('forgot')}</h1>
        {step === 1 ? (
          <form onSubmit={start}>
            <Field label={t('email')} required>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </Field>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }}>{t('next')}</button>
          </form>
        ) : (
          <form onSubmit={reset}>
            <Field label="Сэргээх код / Reset code" required>
              <input value={token} onChange={e => setToken(e.target.value)} required autoFocus />
            </Field>
            <Field label={`${t('password')} (шинэ)`} required hint={t('password_rule')}>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </Field>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }}>{t('confirm')}</button>
          </form>
        )}
        <p className="mut" style={{ marginTop: 20 }}><Link to="/login">← {t('login')}</Link></p>
      </div>
    </div>
  );
}
