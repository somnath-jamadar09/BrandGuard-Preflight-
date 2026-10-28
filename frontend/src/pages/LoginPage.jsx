import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import './LoginPage.css';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState({});
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
        err.response?.data?.message ||
        'Login failed. Check your credentials and try again.';
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.trim() !== '' && password !== '';

  return (
    <div className="login-page" role="main">
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {apiError}
      </div>

      <div className="login-card card">
        <div className="login-logo-row">
          <span className="login-logo-mark" aria-hidden="true">BG</span>
          <div>
            <div className="login-brand-name">BrandGuard Preflight</div>
            <div className="login-tagline">Brand compliance, with proof.</div>
          </div>
        </div>

        <h1 className="login-heading">Sign in to your account</h1>

        {apiError && (
          <div className="login-api-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group login-field">
            <label className="form-label" htmlFor="login-email">
              Email address
            </label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              className={`form-input${errors.email ? ' error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={!!errors.email}
              placeholder="you@example.com"
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
              placeholder="••••••••"
            />
            {errors.password && (
              <span id="login-password-error" className="form-error" role="alert">
                {errors.password}
              </span>
            )}
          </div>

          <div className="login-quick-demo">
            <span className="login-quick-label">Demo Quick Logins:</span>
            <div className="login-quick-buttons">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setEmail('priya@stellara.com'); setPassword('password123'); }}
              >
                Priya (Creator)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setEmail('marcus@stellara.com'); setPassword('password123'); }}
              >
                Marcus (Manager)
              </button>
            </div>
          </div>

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
              'Sign in'
            )}
          </button>
        </form>

        <p className="login-register">
          Don&apos;t have an account?{' '}
          <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}
