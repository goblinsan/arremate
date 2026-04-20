import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// ─── Sentry initialisation (optional – only active when VITE_SENTRY_DSN is set) ─
// To enable: install @sentry/react, set VITE_SENTRY_DSN in your env, and
// uncomment the block below.
//
// import * as Sentry from '@sentry/react';
// if (import.meta.env.VITE_SENTRY_DSN) {
//   Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN as string, environment: import.meta.env.MODE });
//   import('@arremate/observability').then(({ setErrorReporter }) => {
//     setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }));
//   });
// }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
