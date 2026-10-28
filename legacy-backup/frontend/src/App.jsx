import { useCallback, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { api } from './api.js'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(
    location.state?.registered ? 'Account created successfully. Please sign in.' : ''
  )
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      navigate('/dashboard')
    } catch (err) {
      if (err.status === 403 && err.data?.requiresPasswordChange) {
        navigate('/change-password', {
          state: { forced: true },
          replace: true,
        })
      } else {
        setError(err.message || 'Login failed. Please check your credentials.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="logo-text">Password Security System</span>
          </div>
          <h1>Sign in</h1>
          <p className="auth-subtitle">
            Enter your credentials to access your account.
          </p>
        </div>

        {successMessage && (
          <div className="alert alert-success" role="status">
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or email"
              required
            />
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="text-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="link-highlight">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Password must contain uppercase, lowercase, a number, and a special character.')
      return
    }

    setLoading(true)
    try {
      await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          username,
          password,
        }),
      })

      navigate('/login', {
        state: { registered: true },
        replace: true,
      })
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-container">
      <div className="auth-card register-card">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="logo-text">Password Security System</span>
          </div>
          <h1>Create an account</h1>
          <p className="auth-subtitle">
            Register a new account with 30-day password lifecycle management.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-username">Username</label>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="reg-password">Password</label>
              <button
                type="button"
                className="text-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="link-highlight">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

function StatusBadge({ status }) {
  const norm = String(status || 'UNKNOWN').toUpperCase()
  if (norm === 'ACTIVE') {
    return <span className="badge badge-active">ACTIVE</span>
  }
  if (norm === 'NEAR_EXPIRY') {
    return <span className="badge badge-warning">EXPIRING SOON</span>
  }
  if (norm === 'EXPIRED') {
    return <span className="badge badge-expired">EXPIRED</span>
  }
  return <span className="badge badge-neutral">{norm}</span>
}

function ProtectedLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    let active = true

    api('/api/me')
      .then((data) => {
        if (active) setUser(data)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setChecking(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogout() {
    setLogoutError('')
    try {
      await api('/api/logout', { method: 'POST' })
      navigate('/login', { replace: true })
    } catch (err) {
      setLogoutError(err.message || 'Logout failed.')
    }
  }

  if (checking) {
    return (
      <div className="screen-center">
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isChangePassword = location.pathname === '/change-password'

  if (user.passwordExpired && !isChangePassword) {
    return <Navigate to="/change-password" replace state={{ forced: true }} />
  }

  const displayName = user.fullName || user.username
  const initial = String(displayName).charAt(0).toUpperCase()

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-info">
            <span className="brand-name">Password Security System</span>
          </div>
        </div>

        <div className="sidebar-section-title">WORKSPACE</div>
        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/change-password"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <span>Password & Keys</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-widget">
            <div className="user-avatar">{initial}</div>
            <div className="user-details">
              <span className="user-fullname">{displayName}</span>
              <span className="user-username">@{user.username}</span>
            </div>
          </div>

          <button onClick={handleLogout} className="btn-logout" title="Sign out">
            <span>Sign out</span>
          </button>
          {logoutError && <p className="logout-error">{logoutError}</p>}
        </div>
      </aside>

      <div className="content-wrapper">
        <header className="top-header">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="sep">/</span>
            <span className="current">
              {isChangePassword ? 'Password & Keys' : 'Dashboard'}
            </span>
          </div>
        </header>

        <main className="page-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route path="/change-password" element={<ChangePassword user={user} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Dashboard({ user }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await api('/api/password-status')
      setStatus(data)
    } catch (err) {
      setError(err.message || 'Failed to load password status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const daysLeft = status?.daysRemaining ?? null
  const progressPercent = Math.max(0, Math.min(100, Math.round(((daysLeft || 0) / 30) * 100)))

  return (
    <div className="dashboard-view">
      <div className="view-header">
        <div>
          <h2>Account Overview</h2>
          <p className="subtitle">
            Welcome, <strong>{user.fullName || user.username}</strong> ({user.email || user.username}). Monitor your credentials.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="cards-grid two-cards">
        <div className="metric-card">
          <div className="card-top">
            <span className="card-title">CREDENTIAL HEALTH</span>
          </div>
          <div className="card-body">
            {loading ? (
              <span className="metric-loading">Checking...</span>
            ) : (
              <StatusBadge status={status?.status} />
            )}
            <p className="card-subtext">
              {status?.status === 'NEAR_EXPIRY'
                ? 'Your password is approaching the 30-day lifecycle limit.'
                : status?.status === 'EXPIRED'
                ? 'Password lifecycle expired. Password change required.'
                : '30-day password lifecycle enforced.'}
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="card-top">
            <span className="card-title">DAYS REMAINING</span>
          </div>
          <div className="card-body">
            <div className="metric-number">{daysLeft !== null ? daysLeft : '—'}</div>
            <div className="progress-bar-bg">
              <div
                className={`progress-bar-fill ${
                  status?.status === 'NEAR_EXPIRY'
                    ? 'warning'
                    : status?.status === 'EXPIRED'
                    ? 'danger'
                    : 'normal'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="card-subtext">Out of standard 30-day validity period</p>
          </div>
        </div>
      </div>

      <div className="content-panel">
        <div className="panel-header">
          <h3>Password Lifecycle Details</h3>
        </div>
        <div className="key-value-list">
          <div className="kv-row">
            <span className="kv-key">Account Username</span>
            <span className="kv-value">@{user.username}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Registered Email</span>
            <span className="kv-value">{user.email || '—'}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Last Password Rotation</span>
            <span className="kv-value">{formatDate(status?.passwordChangedAt)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Password Expiry Date</span>
            <span className="kv-value">{formatDate(status?.passwordExpiryDate)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Current Status</span>
            <span className="kv-value">
              <StatusBadge status={status?.status} />
            </span>
          </div>
        </div>
        <div className="panel-action">
          <Link to="/change-password" className="btn-inline-primary">
            Rotate Password
          </Link>
        </div>
      </div>
    </div>
  )
}

function ChangePassword({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const forced = Boolean(location.state?.forced || user?.passwordExpired)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Password must contain uppercase, lowercase, a number, and a special character.')
      return
    }

    setLoading(true)
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      setSuccess('Password changed successfully! Redirecting to dashboard...')
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 1000)
    } catch (err) {
      setError(err.message || 'Password update failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-view">
      <div className="view-header">
        <div>
          <h2>{forced ? 'Password Update Required' : 'Password & Keys'}</h2>
          <p className="subtitle">
            {forced
              ? 'Your password has expired. In accordance with the 30-day security policy, please choose a new password.'
              : 'Rotate your password to keep your account protected.'}
          </p>
        </div>
      </div>

      {forced && (
        <div className="alert alert-warning">
          <span>
            <strong>Access Restricted:</strong> You must update your password before accessing the full workspace.
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="status">
          <span>{success}</span>
        </div>
      )}

      <div className="content-panel form-card">
        <div className="panel-header">
          <h3>Credentials Form</h3>
          <button
            type="button"
            className="text-toggle"
            onClick={() => setShowPasswords(!showPasswords)}
            tabIndex={-1}
          >
            {showPasswords ? 'Hide characters' : 'Show characters'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="standard-form">
          <div className="form-group">
            <label htmlFor="curr-password">Current Password</label>
            <input
              id="curr-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter existing password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter fresh password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="conf-password">Confirm New Password</label>
            <input
              id="conf-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              required
            />
          </div>

          <div className="form-actions">
            {!forced && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/dashboard')}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving new password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function AppRoutes() {
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/'

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}