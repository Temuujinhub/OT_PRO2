import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LangProvider } from './i18n';
import { ToastProvider } from './ui';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>
);
