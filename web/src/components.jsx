import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth, useCart } from './state.jsx';
import { api, timeAgo } from './api.js';

export function StatusBadge({ status }) {
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{status}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '🍽️', title, hint, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {hint ? <p className="muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'default', icon }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function BarChart({ data, valueKey = 'revenue', labelKey = 'day', format }) {
  if (!data || data.length === 0) return <p className="muted">No data for this range yet.</p>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="bars">
      {data.map((d) => {
        const raw = Number(d[valueKey]) || 0;
        return (
          <div className="bar-col" key={d[labelKey]} title={`${d[labelKey]} — ${raw}`}>
            <span className="bar-value">{format ? format(raw) : raw}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ height: `${Math.max(3, (raw / max) * 100)}%` }} />
            </div>
            <span className="bar-label">{String(d[labelKey]).slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressList({ data, valueKey = 'quantity', labelKey = 'name', format }) {
  if (!data || data.length === 0) return <p className="muted">Nothing recorded yet.</p>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <ul className="progress-list">
      {data.map((d, i) => (
        <li key={`${d[labelKey]}-${i}`}>
          <div className="progress-row">
            <span className="progress-name">
              <b>{i + 1}.</b> {d[labelKey]}
            </span>
            <span className="progress-val">{format ? format(Number(d[valueKey]) || 0) : d[valueKey]}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${((Number(d[valueKey]) || 0) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });

  const load = async () => {
    try {
      setData(await api('/notifications'));
    } catch (_e) {
      /* silent */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    load();
  };

  return (
    <div className="bell-wrap">
      <button className="icon-btn bell" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="Notifications">
        🔔
        {data.unread > 0 ? <span className="bell-dot">{data.unread}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel" onMouseLeave={() => setOpen(false)}>
          <div className="bell-head">
            <strong>Notifications</strong>
            {data.unread > 0 ? (
              <button className="link-btn" onClick={markAll}>
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="bell-list">
            {data.items.length === 0 ? <p className="muted pad">Nothing yet.</p> : null}
            {data.items.map((n) => (
              <div key={n.id} className={`bell-item ${n.is_read ? '' : 'unread'}`}>
                <div className="bell-title">{n.title}</div>
                <div className="bell-msg">{n.message}</div>
                <div className="bell-time">{timeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Navbar() {
  const { user, logout, isAdmin, isStaff } = useAuth();
  const cart = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">🍲</span>
          <span>
            <strong>Canteen Pre-Order</strong>
            <small>Management System</small>
          </span>
        </Link>

        <nav className={`nav-links ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
          <NavLink to="/" end>
            Menu
          </NavLink>
          {user ? <NavLink to="/orders">My Orders</NavLink> : null}
          {isStaff ? <NavLink to="/kitchen">Kitchen Board</NavLink> : null}
          {isStaff ? <NavLink to="/queue">All Orders</NavLink> : null}
          {isAdmin ? <NavLink to="/admin">Admin</NavLink> : null}
          {isAdmin ? <NavLink to="/reports">Reports</NavLink> : null}
          {user ? <NavLink to="/profile">Profile</NavLink> : null}
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <NotificationBell />
              <button className="cart-btn" onClick={() => cart.setOpen(true)}>
                🛒 <span className="cart-count">{cart.count}</span>
              </button>
              <div className="who">
                <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <span className="who-text">
                  <strong>{user.name}</strong>
                  <small>{user.role}</small>
                </span>
              </div>
              <button className="btn btn-ghost" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary" to="/register">
                Create account
              </Link>
            </>
          )}
          <button className="icon-btn burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
