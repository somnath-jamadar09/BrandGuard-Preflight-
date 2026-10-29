import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import './LoginPage.css';   // reuse the same card / form styles
import './RegisterPage.css';

const ROLES = [
  {
    id: 'creator',
    label: 'Content Creator',
    badge: 'Creator',
    desc: 'Submit drafts for brand-compliance review, fix rule violations, and track draft versions.',
    icon: '✍️',
  },
  {
    id: 'brand_manager',
    label: 'Brand Manager',
    badge: 'Brand Manager',
    desc: 'Review findings, approve or request changes on drafts, and monitor executive compliance metrics.',
    icon: '🛡️',
  },
  {
    id: 'knowledge_owner',
    label: 'Knowledge Owner',
    badge: 'Knowledge Owner',
    desc: 'Manage approved brand sources, guidelines, and verified facts used for proof citations.',
    icon: '📚',
  },
];

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

  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [role,         setRole]         = useState('creator');
  const [orgName,      setOrgName]      = useState('');
  const [joinDemoOrg,  setJoinDemoOrg]  = useState(false);
  const [showPass,     setShowPass]     = useState(false);
  const [errors,       setErrors]       = useState({});
  const [apiError,     setApiError]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => {
    if (user) {
      if (user.role === 'creator') {
        navigate('/drafts/new', { replace: true });
      } else if (user.role === 'knowledge_owner' || user.role === 'owner') {
        navigate('/knowledge-base', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
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
    if (!role)
      errs.role = 'Please select your role.';
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
      await register(
        name.trim(),
        email.trim().toLowerCase(),
        password,
        orgName.trim() || undefined,
        role,
        joinDemoOrg
      );
      // AuthProvider sets user → useEffect navigates to the role's fresh workspace
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

  const canSubmit = name.trim() && email.trim() && password && confirm && role;

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
          Sign up to verify brand-compliance against your truth sources, approve content, and manage guidelines.
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

            {/* Role Selection */}
            <div className="form-group login-field register-roles-group">
              <label className="form-label" id="reg-role-label">
                Select your role <span className="register-required">*</span>
              </label>
              <div
                className="register-role-picker"
                role="radiogroup"
                aria-labelledby="reg-role-label"
              >
                {ROLES.map((r) => {
                  const isSelected = role === r.id;
                  const badgeClass =
                    r.id === 'brand_manager'
                      ? 'r-manager'
                      : r.id === 'knowledge_owner'
                      ? 'r-owner'
                      : 'r-creator';

                  return (
                    <div
                      key={r.id}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      className={`register-role-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setRole(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setRole(r.id);
                        }
                      }}
                    >
                      <div className="register-role-card-header">
                        <span className="register-role-icon" aria-hidden="true">{r.icon}</span>
                        <div className="register-role-title-wrap">
                          <span className="register-role-name">{r.label}</span>
                          <span className={`pill ${badgeClass}`}>{r.badge}</span>
                        </div>
                        <div className="register-role-radio-circle" aria-hidden="true">
                          {isSelected && <span className="register-role-radio-dot" />}
                        </div>
                      </div>
                      <p className="register-role-card-desc">{r.desc}</p>
                    </div>
                  );
                })}
              </div>
              {errors.role && <span className="form-error" role="alert">{errors.role}</span>}
            </div>

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
                placeholder="e.g. Acme Studio (leave blank for your own workspace)"
              />
              <span className="register-hint">
                Leave blank to automatically create a fresh, dedicated workspace for you.
              </span>
            </div>

            {/* Demo workspace opt-in */}
            <div className="form-group login-field register-demo-opt">
              <label className="register-checkbox-label">
                <input
                  type="checkbox"
                  checked={joinDemoOrg}
                  onChange={(e) => setJoinDemoOrg(e.target.checked)}
                  className="register-checkbox"
                />
                <span>Join Stellara Brands demo workspace (pre-populated with sample drafts &amp; guidelines)</span>
              </label>
              <span className="register-hint">
                Unchecked by default to provide a completely fresh, clean interface.
              </span>
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
