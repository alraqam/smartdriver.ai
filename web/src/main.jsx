import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { I18nProvider } from './i18n/index.jsx';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './styles.css';

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
