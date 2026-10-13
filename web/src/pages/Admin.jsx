import React, { useCallback, useEffect, useState } from 'react';
import { api, money, qs, dateOnly } from '../api.js';
import { useToast } from '../state.jsx';
import { EmptyState, Modal, Spinner } from '../components.jsx';

const BLANK_ITEM = {
  name: '',
  price: '',
  category_id: '',
  description: '',
  image_emoji: '🍽️',
  is_veg: true,
  prep_minutes: 10,
  stock_qty: '',
  is_available: true,
};

function MenuAdmin() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api(`/menu${qs({ q, includeUnavailable: 'true' })}`), api('/categories')])
      .then(([m, c]) => {
        setItems(m);
        setCategories(c);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(load, [load]);

  const save = async (form) => {
    const body = {
      ...form,
      price: Number(form.price),
      category_id: form.category_id ? Number(form.category_id) : null,
      prep_minutes: Number(form.prep_minutes || 10),
      stock_qty: form.stock_qty === '' ? null : Number(form.stock_qty),
      is_veg: !!form.is_veg,
      is_available: !!form.is_available,
    };
    try {
      if (form.id) await api(`/menu/${form.id}`, { method: 'PUT', body });
      else await api('/menu', { method: 'POST', body });
      toast.success(form.id ? 'Menu item updated' : 'Menu item added');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggle = async (item) => {
    try {
      await api(`/menu/${item.id}/availability`, { method: 'PATCH', body: { is_available: !item.is_available } });
      toast.success(`${item.name} is now ${item.is_available ? 'unavailable' : 'available'}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the menu?`)) return;
    try {
      await api(`/menu/${item.id}`, { method: 'DELETE' });
      toast.success('Menu item deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const addCategory = async () => {
    const name = window.prompt('New category name');
    if (!name) return;
    try {
      await api('/categories', { method: 'POST', body: { name } });
      toast.success('Category added');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <section className="hero">
        <div>
          <h1>Menu management</h1>
          <p className="muted">Add, update, price and hide food items. Changes reach customers immediately.</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-ghost" onClick={addCategory}>
            + Category
          </button>
          <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK_ITEM })}>
            + New item
          </button>
        </div>
      </section>

      <section className="filters">
        <input className="search" placeholder="Search menu…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="pill">{items.length} items</span>
      </section>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="📋" title="No menu items" hint="Create your first dish to start taking pre-orders." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Diet</th>
                <th className="num">Price</th>
                <th className="num">Prep</th>
                <th className="num">Stock</th>
                <th>Available</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <span className="cell-emoji">{i.image_emoji}</span>
                    <b>{i.name}</b>
                    <div className="muted small">{i.description}</div>
                  </td>
                  <td>{i.category_name || '—'}</td>
                  <td>
                    <span className={`diet-text ${i.is_veg ? 'veg' : 'nonveg'}`}>{i.is_veg ? 'Veg' : 'Non-veg'}</span>
                  </td>
                  <td className="num">{money(i.price)}</td>
                  <td className="num">{i.prep_minutes} min</td>
                  <td className="num">{i.stock_qty === null || i.stock_qty === undefined ? '∞' : i.stock_qty}</td>
                  <td>
                    <button className={`toggle ${i.is_available ? 'on' : 'off'}`} onClick={() => toggle(i)}>
                      {i.is_available ? 'Available' : 'Hidden'}
                    </button>
                  </td>
                  <td className="nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...i, category_id: i.category_id || '' })}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <Modal title={editing.id ? 'Edit menu item' : 'New menu item'} onClose={() => setEditing(null)}>
          <div className="form">
            <label>
              Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <div className="grid-2">
              <label>
                Price (₹)
                <input type="number" min="0" step="0.5" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </label>
              <label>
                Category
                <select value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <div className="grid-3">
              <label>
                Emoji
                <input value={editing.image_emoji || ''} onChange={(e) => setEditing({ ...editing, image_emoji: e.target.value })} />
              </label>
              <label>
                Prep minutes
                <input type="number" min="0" value={editing.prep_minutes} onChange={(e) => setEditing({ ...editing, prep_minutes: e.target.value })} />
              </label>
              <label>
                Stock (blank = ∞)
                <input type="number" min="0" value={editing.stock_qty ?? ''} onChange={(e) => setEditing({ ...editing, stock_qty: e.target.value })} />
              </label>
            </div>
            <div className="grid-2">
              <label className="switch">
                <input type="checkbox" checked={!!editing.is_veg} onChange={(e) => setEditing({ ...editing, is_veg: e.target.checked })} />
                <span>Vegetarian</span>
              </label>
              <label className="switch">
                <input type="checkbox" checked={!!editing.is_available} onChange={(e) => setEditing({ ...editing, is_available: e.target.checked })} />
                <span>Available today</span>
              </label>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => save(editing)}>
              {editing.id ? 'Save changes' : 'Create item'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function UsersAdmin() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    api(`/users${qs({ q, role })}`)
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [q, role, toast]);

  useEffect(load, [load]);

  const update = async (u, patch) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: patch });
      toast.success(`${u.name} updated`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <section className="hero">
        <div>
          <h1>User management</h1>
          <p className="muted">Promote staff, disable accounts and review customer activity.</p>
        </div>
        <span className="pill">{rows.length} users</span>
      </section>

      <section className="filters">
        <input className="search" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {['all', 'student', 'staff', 'admin'].map((r) => (
            <button key={r} className={`chip-btn ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>
              {r === 'all' ? 'All roles' : r}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th className="num">Orders</th>
                <th className="num">Spent</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    <select value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                      <option value="student">student</option>
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>{u.department || '—'}</td>
                  <td className="num">{u.order_count}</td>
                  <td className="num">{money(u.lifetime_value)}</td>
                  <td>{dateOnly(u.created_at)}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-completed' : 'badge-cancelled'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => update(u, { is_active: !u.is_active })}>
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CategoriesAdmin() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api('/categories')
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(load, [load]);

  const rename = async (c) => {
    const name = window.prompt('Rename category', c.name);
    if (!name) return;
    try {
      await api(`/categories/${c.id}`, { method: 'PUT', body: { name } });
      toast.success('Category renamed');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      toast.success('Category deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="cards-row">
      {rows.map((c) => (
        <div className="panel" key={c.id}>
          <h4>{c.name}</h4>
          <p className="muted">{c.description || 'No description'}</p>
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={() => rename(c)}>
              Rename
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('menu');
  return (
    <div className="page">
      <div className="tabs">
        {[
          ['menu', 'Menu items'],
          ['categories', 'Categories'],
          ['users', 'Users'],
        ].map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'menu' ? <MenuAdmin /> : null}
      {tab === 'categories' ? <CategoriesAdmin /> : null}
      {tab === 'users' ? <UsersAdmin /> : null}
    </div>
  );
}
