import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useToast } from '../state.jsx';
import { Spinner } from '../components.jsx';

export function ProtectedRoute({ children, staff, admin }) {
  const { user, loading, isStaff, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  return children;
}

const DEMO = [
  { role: 'Student', email: 'student@canteen.test', password: 'Student@123' },
  { role: 'Kitchen staff', email: 'staff@canteen.test', password: 'Staff@123' },
  { role: 'Administrator', email: 'admin@canteen.test', password: 'Admin@123' },
];

export default function Login() {
  const { login, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${me.name}!`);
      navigate(location.state?.from || (me.role === 'student' ? '/' : me.role === 'staff' ? '/kitchen' : '/admin'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <h1>Sign in</h1>
        <p className="muted">Students, canteen staff and administrators use the same login.</p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={submit} className="form">
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@campus.edu"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="demo-box">
          <div className="demo-title">Demo accounts — click to fill</div>
          <div className="demo-grid">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                className="demo-chip"
                onClick={() => setForm({ email: d.email, password: d.password })}
              >
                <strong>{d.role}</strong>
                <span>{d.email}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="muted center">
          New here? <a href="/register">Create an account</a>
        </p>
      </section>

      <aside className="auth-aside">
        <h2>How the system works</h2>
        <ol className="flow">
          <li>Open the system and sign in or register</li>
          <li>View the menu with live prices and availability</li>
          <li>Select items, set quantities, choose a pickup time</li>
          <li>Review the cart and confirm the order</li>
          <li>The order reaches the canteen admin instantly</li>
          <li>Staff accept and prepare the food</li>
          <li>Status is updated to <b>Ready</b> and you are notified</li>
          <li>Collect your food — the order is marked <b>Completed</b></li>
        </ol>
      </aside>
    </div>
  );
}

export function Register() {
  const { register, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    phone: '',
    role: 'student',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await register(form);
      toast.success(`Account created. Welcome, ${me.name}!`);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page single">
      <section className="auth-card">
        <h1>Create your account</h1>
        <p className="muted">Pre-order your food and skip the queue at break time.</p>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={submit} className="form">
          <label>
            Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ananya Sharma" />
          </label>
          <label>
            Email address
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@campus.edu"
            />
          </label>
          <div className="grid-2">
            <label>
              Department / class
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Computer Science, Year 2"
              />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98000 10003" />
            </label>
          </div>
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 6 characters"
            />
          </label>
          <label>
            I am a…
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="student">Student / Staff member (customer)</option>
              <option value="staff">Canteen kitchen staff</option>
            </select>
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="muted center">
          Already registered? <a href="/login">Sign in</a>
        </p>
      </section>
    </div>
  );
}
