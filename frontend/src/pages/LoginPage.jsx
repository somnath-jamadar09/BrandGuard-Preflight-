import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import './LoginPage.css';

const DEMO_LOGINS = [
  { email: 'priya@acme.com',  password: 'creator123', name: 'Priya Sharma',  role: 'Content Creator',     roleClass: 'r-creator' },
  { email: 'elena@acme.com',  password: 'manager123', name: 'Elena Rostova', role: 'Brand Manager',        roleClass: 'r-manager' },
  { email: 'marcus@acme.com', password: 'owner123',   name: 'Marcus Lee',    role: 'Knowledge Owner',      roleClass: 'r-owner' },
  { email: 'admin@acme.com',  password: 'admin123',   name: 'Ava Admin',     role: 'System Administrator', roleClass: 'r-admin' },
  { email: 'audit@acme.com',  password: 'viewer123',  name: 'Sam Auditor',   role: 'Auditor',              roleClass: 'r-viewer' },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function validate() {
    const errs = {};
    if (!email.trim()) {
      errs.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address.';
    }
    if (!password) {
      errs.password = 'Password is required.';
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Login failed. Check your credentials and try again.';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    setOrgDomain('acme-global');
    setApiError('');
    setErrors({});
  }

  const canSubmit = email.trim() !== '' && password !== '';

  return (
    <div className="login-page" role="main">
      <div className="login-blob login-blob-a" aria-hidden="true" />
      <div className="login-blob login-blob-b" aria-hidden="true" />

      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {apiError}
      </div>

      <section className="login-left" aria-label="Product introduction">
        <div className="login-brand">
          <span className="login-shield" aria-hidden="true">✓</span>
          BrandGuard Preflight
        </div>
        <h1 className="login-hero">Brand compliance, with proof.</h1>
        <p className="login-lead">
          Every finding cites your own approved sources. Your role decides what you can see and do.
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

      <section className="login-right">
        <div className="login-card card" role="group" aria-labelledby="login-heading">
          <div className="login-card-head">
            <h2 id="login-heading">Log in to workspace</h2>
            <button
              type="button"
              className="btn btn-sm"
              onClick={toggleTheme}
              aria-label="Switch theme"
            >
              Theme
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group login-field">
              <label className="form-label" htmlFor="login-email">
                Workplace email
              </label>
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
                <span id="login-email-error" className="form-error" role="alert">
                  {errors.email}
                </span>
              )}
            </div>

            <div className="form-group login-field">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                className={`form-input${errors.password ? ' error' : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <span id="login-password-error" className="form-error" role="alert">
                  {errors.password}
                </span>
              )}
            </div>

            <div className="form-group login-field">
              <label className="form-label" htmlFor="login-org">
                Organization domain
              </label>
              <input
                id="login-org"
                type="text"
                className="form-input"
                value={orgDomain}
                onChange={(e) => setOrgDomain(e.target.value)}
                autoComplete="organization"
                placeholder="acme-global"
              />
            </div>

            <p className="login-api-error" role="alert">
              {apiError}
            </p>

            <button
              type="submit"
              id="login-submit"
              className="btn btn-primary login-submit"
              disabled={!canSubmit || submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Log in to workspace'
              )}
            </button>
          </form>

          <p className="login-quick-label">Demo quick logins (click to fill)</p>
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

          <p className="login-disclaimer">
            Demo only. Sign-in is checked in your browser. A real build needs server-side login, tokens and tenant isolation.
          </p>
        </div>
      </section>
    </div>
  );
}
