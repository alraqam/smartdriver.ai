import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { I18nProvider } from './i18n/index.jsx';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './styles.css';

// Offline shell and home-screen install. Production only: in development Vite
// serves unhashed modules over HMR, and a worker caching them turns every edit
// into a mystery. See public/sw.js for what it does and does not touch.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unregistrable worker (private mode, an http:// origin, a browser
      // that refuses) costs the offline shell and nothing else. The app has to
      // keep working, so this is deliberately silent.
    });
  });
}

// HashRouter, not BrowserRouter: the app is served as static files by nginx,
// and hash routing means a deep link or a refresh works without a rewrite rule.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
);
