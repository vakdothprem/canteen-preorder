import React, { useEffect, useState } from 'react';
import { api, timeAgo } from '../api.js';
import { useAuth, useToast } from '../state.jsx';
import { Spinner } from '../components.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', department: '', phone: '' });
  const [notes, setNotes] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', department: user.department || '', phone: user.phone || '' });
  }, [user]);

  useEffect(() => {
    api('/notifications')
      .then((d) => setNotes(d.items))
      .catch(() => setNotes([]));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api('/auth/me', { method: 'PATCH', body: form });
      setUser(updated);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Spinner />;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>My profile</h1>
          <p className="muted">
            {user.email} · role <b>{user.role}</b>
          </p>
        </div>
      </section>

      <div className="grid-2 gap">
        <section className="panel">
          <h3>Account details</h3>
          <form className="form" onSubmit={save}>
            <label>
              Full name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Department / class
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h3>Notifications</h3>
          {!notes ? (
            <Spinner />
          ) : notes.length === 0 ? (
            <p className="muted">No notifications yet.</p>
          ) : (
            <ul className="notes">
              {notes.map((n) => (
                <li key={n.id} className={n.is_read ? '' : 'unread'}>
                  <div className="notes-head">
                    <b>{n.title}</b>
                    <span className="muted small">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="muted">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
