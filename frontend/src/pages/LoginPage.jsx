import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl, setApiBaseUrl } from '../api/client';
import './LoginPage.css';

/**
 * Demo quick-login accounts.
 * Passwords match the seeds set in backend/src/utils/seed.js
 */
const DEMO_LOGINS = [
  { email: 'priya@acme.com',   password: 'creator123', name: 'Priya Sharma',  role: 'Content Creator',     roleClass: 'r-creator' },
  { email: 'elena@acme.com',   password: 'manager123', name: 'Elena Rostova', role: 'Brand Manager',        roleClass: 'r-manager' },
  { email: 'marcus@acme.com',  password: 'owner123',   name: 'Marcus Lee',    role: 'Knowledge Owner',      roleClass: 'r-owner' },
  { email: 'admin@acme.com',   password: 'admin1234',  name: 'Ava Admin',     role: 'System Administrator', roleClass: 'r-admin' },
  { email: 'audit@acme.com',   password: 'viewer123',  name: 'Sam Auditor',   role: 'Auditor / Viewer',     roleClass: 'r-viewer' },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const { toggleTheme }  = useTheme();
  const navigate         = useNavigate();
  const location         = useLocation();
  const emailRef         = useRef(null);

  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [errors,         setErrors]         = useState({});
  const [apiError,       setApiError]       = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  // API Server configuration & status
  const [apiUrl,         setApiUrl]         = useState(getApiBaseUrl);
  const [apiStatus,      setApiStatus]      = useState('checking'); // 'online' | 'offline' | 'checking'
  const [showConfig,     setShowConfig]     = useState(false);
  const [customInput,    setCustomInput]    = useState(getApiBaseUrl);

  const isLocalHost = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');
  const isCloudHost = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const showLocalWarning = isCloudHost && isLocalHost;

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => { emailRef.current?.focus(); }, []);

  // Check backend server health
  useEffect(() => {
    let active = true;
    setApiStatus('checking');
    fetch(`${apiUrl}/health`, { method: 'GET' })
      .then((res) => {
        if (!active) return;
        setApiStatus(res.ok ? 'online' : 'offline');
      })
      .catch(() => {
        if (!active) return;
        setApiStatus('offline');
      });

    return () => { active = false; };
  }, [apiUrl]);

  function validate() {
    const errs = {};
    if (!email.trim()) {
      errs.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address.';
    }
    if (!password) {
      errs.password = 'Password is required.';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters.';
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      let msg = err.response?.data?.error || err.response?.data?.message;
      if (!msg) {
        if (!err.response) {
          if (showLocalWarning) {
            msg = `Cannot reach server at ${apiUrl}. Since your frontend is hosted on Vercel, it cannot connect to "localhost". Click "Change" below to set your live backend URL (e.g. https://your-backend.onrender.com).`;
          } else {
            msg = `Cannot reach server at ${apiUrl}. If on Render free tier, the service may be asleep (takes 30–50s to wake up on first launch). Please wait 30 seconds and click again.`;
          }
        } else {
          msg = 'Login failed. Check your email and password.';
        }
      }
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    setApiError('');
    setErrors({});
  }

  function handleSaveApiUrl() {
    if (!customInput.trim()) return;
    setApiBaseUrl(customInput);
    setApiUrl(getApiBaseUrl());
    setShowConfig(false);
    setApiError('');
  }

  function handleResetApiUrl() {
    setApiBaseUrl(null);
    const def = getApiBaseUrl();
    setCustomInput(def);
    setApiUrl(def);
    setShowConfig(false);
    setApiError('');
  }

  const canSubmit = email.trim() !== '' && password !== '';

  return (
    <div className="login-page" role="main">
      <div className="login-blob login-blob-a" aria-hidden="true" />
      <div className="login-blob login-blob-b" aria-hidden="true" />

      <div aria-live="assertive" aria-atomic="true" className="sr-only">{apiError}</div>

      {/* ── Left panel ── */}
      <section className="login-left" aria-label="Product introduction">
        <div className="login-brand">
          <span className="login-shield" aria-hidden="true">✓</span>
          BrandGuard Preflight
        </div>
        <h1 className="login-hero">Brand compliance, with proof.</h1>
        <p className="login-lead">
          Every finding cites your own approved sources.<br />
          Your role decides what you can see and do.
        </p>
        <div className="login-scene" aria-hidden="true">
          <div className="login-cube-wrap">
            <div className="login-cube">
              <div className="login-face login-face-1">Truth</div>
              <div className="login-face login-face-2">Risk</div>
              <div className="login-face login-face-3">Intent</div>
              <div className="login-face login-face-4">Proof</div>
              <div className="login-face login-face-5">Owner</div>
              <div className="login-face login-face-6">Audit</div>
            </div>
          </div>
          <span className="login-float login-float-1">Supported</span>
          <span className="login-float login-float-2">Contradicted</span>
          <span className="login-float login-float-3">Outdated</span>
        </div>
      </section>

      {/* ── Right panel ── */}
      <section className="login-right">
        <div className="login-card card" role="group" aria-labelledby="login-heading">
          <div className="login-card-head">
            <h2 id="login-heading">Log in to workspace</h2>
            <button type="button" className="btn btn-sm" onClick={toggleTheme} aria-label="Switch theme">
              Theme
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="login-email">Workplace email</label>
              <input
                ref={emailRef}
                id="login-email"
                type="email"
                className={`form-input${errors.email ? ' error' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                aria-invalid={!!errors.email}
                placeholder="priya@acme.com"
              />
              {errors.email && (
                <span id="login-email-error" className="form-error" role="alert">{errors.email}</span>
              )}
            </div>

            {/* Password */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className={`form-input${errors.password ? ' error' : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                aria-invalid={!!errors.password}
                placeholder="••••••••"
              />
              {errors.password && (
                <span id="login-password-error" className="form-error" role="alert">{errors.password}</span>
              )}
            </div>

            {/* API error */}
            {apiError && <p className="login-api-error" role="alert">{apiError}</p>}

            <button
              type="submit"
              id="login-submit"
              className="btn btn-primary login-submit"
              disabled={!canSubmit || submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <><span className="spinner" aria-hidden="true" />Signing in…</>
              ) : (
                'Log in to workspace'
              )}
            </button>
          </form>

          {/* Register link */}
          <p className="login-register-link">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="login-link">Create one for free</Link>
          </p>

          {/* Demo quick-fills */}
          <p className="login-quick-label">Demo quick logins (click to fill &amp; submit)</p>
          <div className="login-quick-demo">
            {DEMO_LOGINS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className="login-demo"
                onClick={() => fillDemo(demo)}
              >
                <span className="login-demo-name">{demo.name}</span>
                <span className={`pill ${demo.roleClass}`}>{demo.role}</span>
              </button>
            ))}
          </div>

          {/* Server Connection Bar */}
          <div className="login-api-config">
            <div className="api-config-summary">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                <span className={`api-status-dot ${apiStatus}`} title={`Backend status: ${apiStatus}`} />
                <span>Backend: <code>{apiUrl}</code></span>
              </div>
              <button
                type="button"
                className="btn-link-sm"
                onClick={() => setShowConfig((v) => !v)}
              >
                {showConfig ? 'Close' : 'Change'}
              </button>
            </div>

            {showLocalWarning && (
              <span className="api-warning-badge">
                ⚠️ Frontend is on Vercel but API points to localhost. Click &quot;Change&quot; to paste your live backend URL (e.g. from Render).
              </span>
            )}

            {showConfig && (
              <div className="api-config-inputs">
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="https://brandguard-api.onrender.com"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                />
                <div className="api-config-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleSaveApiUrl}
                  >
                    Save &amp; Connect
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleResetApiUrl}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="login-disclaimer">
            Preflight Demo — authenticates against the live BrandGuard API.
          </p>
        </div>
      </section>
    </div>
  );
}
