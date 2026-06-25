import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { I18nProvider } from './i18n';
import { applyTheme, getInitialTheme } from './theme';
import { ToastProvider } from './toast';
import './styles.css';

// Apply theme before first paint to avoid a flash.
applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
