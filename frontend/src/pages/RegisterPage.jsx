import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import './LoginPage.css';   // reuse the same card / form styles
import './RegisterPage.css';

const ROLES_INFO = [
  { label: 'Content Creator', desc: 'Submit drafts for brand-compliance review.' },
  { label: 'Brand Manager',   desc: 'Review findings and approve/reject drafts.' },
  { label: 'Knowledge Owner', desc: 'Manage brand facts and approved sources.' },
  { label: 'Auditor',         desc: 'Read-only access to audit trails and reports.' },
];

export default function RegisterPage() {
  const { register, user } = useAuth();
  const { toggleTheme }    = useTheme();
  const navigate           = useNavigate();
  const nameRef            = useRef(null);

  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [orgName,     setOrgName]     = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [errors,      setErrors]      = useState({});
  const [apiError,    setApiError]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function validate() {
    const errs = {};
    if (!name.trim() || name.trim().length < 2)
      errs.name = 'Full name must be at least 2 characters.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Enter a valid email address.';
    if (!password || password.length < 6)
      errs.password = 'Password must be at least 6 characters.';
    if (password !== confirm)
      errs.confirm = 'Passwords do not match.';
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
      await register(name.trim(), email.trim().toLowerCase(), password, orgName.trim() || undefined);
      // AuthProvider sets the user → useEffect above fires → navigate to dashboard
    } catch (err) {
      let msg = err.response?.data?.error || err.response?.data?.message;
      if (!msg) {
        if (!err.response) {
          msg = 'Cannot reach the server. Please wait a moment and retry.';
        } else {
          msg = 'Registration failed. Please try again.';
        }
      }
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim() && email.trim() && password && confirm;

  return (
    <div className="login-page register-page" role="main">
      <div className="login-blob login-blob-a" aria-hidden="true" />
      <div className="login-blob login-blob-b" aria-hidden="true" />

      <div aria-live="assertive" aria-atomic="true" className="sr-only">{apiError}</div>

      {/* ── Left panel ── */}
      <section className="login-left" aria-label="About BrandGuard">
        <div className="login-brand">
          <span className="login-shield" aria-hidden="true">✓</span>
          BrandGuard Preflight
        </div>
        <h1 className="login-hero">Create your workspace</h1>
        <p className="login-lead">
          Sign up to review brand-compliance findings, manage approved facts, and keep every draft on-message.
        </p>

        <ul className="register-role-list" aria-label="Available roles">
          {ROLES_INFO.map((r) => (
            <li key={r.label} className="register-role-item">
              <span className="register-role-label">{r.label}</span>
              <span className="register-role-desc">{r.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Right panel ── */}
      <section className="login-right">
        <div className="login-card card" role="group" aria-labelledby="reg-heading">
          <div className="login-card-head">
            <h2 id="reg-heading">Create account</h2>
            <button type="button" className="btn btn-sm" onClick={toggleTheme} aria-label="Switch theme">
              Theme
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>

            {/* Full name */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="reg-name">Full name</label>
              <input
                ref={nameRef}
                id="reg-name"
                type="text"
                className={`form-input${errors.name ? ' error' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Priya Sharma"
                aria-describedby={errors.name ? 'reg-name-error' : undefined}
                aria-invalid={!!errors.name}
              />
              {errors.name && <span id="reg-name-error" className="form-error" role="alert">{errors.name}</span>}
            </div>

            {/* Email */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="reg-email">Work email</label>
              <input
                id="reg-email"
                type="email"
                className={`form-input${errors.email ? ' error' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="you@company.com"
                aria-describedby={errors.email ? 'reg-email-error' : undefined}
                aria-invalid={!!errors.email}
              />
              {errors.email && <span id="reg-email-error" className="form-error" role="alert">{errors.email}</span>}
            </div>

            {/* Password */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="reg-password">
                Password
                <button
                  type="button"
                  className="register-toggle-pass"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </label>
              <input
                id="reg-password"
                type={showPass ? 'text' : 'password'}
                className={`form-input${errors.password ? ' error' : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Min 6 characters"
                aria-describedby={errors.password ? 'reg-password-error' : undefined}
                aria-invalid={!!errors.password}
              />
              {errors.password && <span id="reg-password-error" className="form-error" role="alert">{errors.password}</span>}
            </div>

            {/* Confirm password */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
                type={showPass ? 'text' : 'password'}
                className={`form-input${errors.confirm ? ' error' : ''}`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
                aria-describedby={errors.confirm ? 'reg-confirm-error' : undefined}
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm && <span id="reg-confirm-error" className="form-error" role="alert">{errors.confirm}</span>}
            </div>

            {/* Organisation (optional) */}
            <div className="form-group login-field">
              <label className="form-label" htmlFor="reg-org">
                Organisation <span className="register-optional">(optional)</span>
              </label>
              <input
                id="reg-org"
                type="text"
                className="form-input"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                autoComplete="organization"
                placeholder="Acme Inc (leave blank for demo org)"
              />
              <span className="register-hint">Leave blank to join the Stellara Brands demo workspace.</span>
            </div>

            {/* API error */}
            {apiError && <p className="login-api-error" role="alert">{apiError}</p>}

            <button
              type="submit"
              className="btn btn-primary login-submit"
              disabled={!canSubmit || submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <><span className="spinner" aria-hidden="true" />Creating account…</>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="login-register-link">
            Already have an account?{' '}
            <Link to="/login" className="login-link">Log in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

