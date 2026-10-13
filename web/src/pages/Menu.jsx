import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, qs } from '../api.js';
import { useAuth, useCart, useToast } from '../state.jsx';
import { EmptyState, Modal, Spinner } from '../components.jsx';

function MenuCard({ item, onAdd }) {
  return (
    <article className={`menu-card ${item.is_available ? '' : 'soldout'}`}>
      <div className="menu-thumb">
        <span>{item.image_emoji || '🍽️'}</span>
        <span className={`diet ${item.is_veg ? 'veg' : 'nonveg'}`} title={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}>
          ●
        </span>
      </div>
      <div className="menu-body">
        <div className="menu-row">
          <h3>{item.name}</h3>
          <span className="price">{money(item.price)}</span>
        </div>
        <p className="menu-desc">{item.description}</p>
        <div className="menu-meta">
          <span className="chip">{item.category_name || 'Uncategorised'}</span>
          <span className="chip">⏱ {item.prep_minutes} min</span>
          {item.stock_qty !== null && item.stock_qty !== undefined ? (
            <span className={`chip ${item.stock_qty === 0 ? 'chip-danger' : ''}`}>
              {item.stock_qty === 0 ? 'Sold out' : `${item.stock_qty} left`}
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-primary btn-block"
          disabled={!item.is_available || item.stock_qty === 0}
          onClick={() => onAdd(item)}
        >
          {!item.is_available || item.stock_qty === 0 ? 'Unavailable' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
}

function CartDrawer() {
  const cart = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [form, setForm] = useState({ pickup_time: '', notes: '', payment_method: 'Cash on Pickup' });
  const [placed, setPlaced] = useState(null);

  if (!cart.open) return null;

  const suggested = new Date(Date.now() + (cart.prepMinutes + 10) * 60000);
  const suggestedStr = `${String(suggested.getHours()).padStart(2, '0')}:${String(suggested.getMinutes()).padStart(2, '0')}`;

  const placeOrder = async () => {
    if (!user) {
      toast.info('Please sign in to place an order.');
      cart.setOpen(false);
      navigate('/login');
      return;
    }
    setPlacing(true);
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          items: cart.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
          pickup_time: form.pickup_time || suggestedStr,
          notes: form.notes || null,
          payment_method: form.payment_method,
        },
      });
      setPlaced(order);
      cart.clear();
      toast.success(`Order ${order.code} placed successfully!`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cart.setOpen(false)}>
      <aside className="drawer">
        <header className="drawer-head">
          <h3>Your cart</h3>
          <button className="icon-btn" onClick={() => cart.setOpen(false)}>
            ✕
          </button>
        </header>

        {placed ? (
          <div className="drawer-body center">
            <div className="tick">✅</div>
            <h3>Order confirmed</h3>
            <p className="muted">
              Your order <b>{placed.code}</b> has been sent to the canteen. Pickup time{' '}
              <b>{placed.pickup_time || 'as soon as ready'}</b>.
            </p>
            <div className="total-line">
              <span>Total payable</span>
              <b>{money(placed.total)}</b>
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                setPlaced(null);
                cart.setOpen(false);
                navigate('/orders');
              }}
            >
              Track my order
            </button>
          </div>
        ) : cart.items.length === 0 ? (
          <div className="drawer-body">
            <EmptyState icon="🛒" title="Your cart is empty" hint="Add something tasty from the menu." />
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {cart.items.map((i) => (
                <div className="cart-line" key={i.menu_item_id}>
                  <span className="cart-emoji">{i.image_emoji}</span>
                  <div className="cart-info">
                    <strong>{i.name}</strong>
                    <small>{money(i.price)} each</small>
                  </div>
                  <div className="qty">
                    <button onClick={() => cart.setQuantity(i.menu_item_id, i.quantity - 1)}>−</button>
                    <span>{i.quantity}</span>
                    <button onClick={() => cart.setQuantity(i.menu_item_id, i.quantity + 1)}>+</button>
                  </div>
                  <span className="cart-total">{money(i.price * i.quantity)}</span>
                  <button className="icon-btn" onClick={() => cart.remove(i.menu_item_id)} aria-label="Remove">
                    🗑
                  </button>
                </div>
              ))}

              <div className="cart-summary">
                <div>
                  <span>Subtotal ({cart.count} items)</span>
                  <b>{money(cart.subtotal)}</b>
                </div>
                <div className="muted small">
                  Estimated preparation: {cart.prepMinutes} min · suggested pickup {suggestedStr}
                </div>
              </div>
            </div>

            <footer className="drawer-foot">
              {!checkout ? (
                <button className="btn btn-primary btn-block" onClick={() => setCheckout(true)}>
                  Proceed to checkout
                </button>
              ) : (
                <div className="form compact">
                  <label>
                    Pickup time
                    <input
                      type="time"
                      value={form.pickup_time}
                      onChange={(e) => setForm({ ...form, pickup_time: e.target.value })}
                      placeholder={suggestedStr}
                    />
                  </label>
                  <label>
                    Payment method
                    <select
                      value={form.payment_method}
                      onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    >
                      <option>Cash on Pickup</option>
                      <option>Online</option>
                    </select>
                  </label>
                  <label>
                    Notes for the kitchen (optional)
                    <input
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="e.g. less spicy, no onion"
                    />
                  </label>
                  <div className="total-line">
                    <span>Total</span>
                    <b>{money(cart.subtotal)}</b>
                  </div>
                  <button className="btn btn-primary btn-block" disabled={placing} onClick={placeOrder}>
                    {placing ? 'Placing order…' : 'Confirm order'}
                  </button>
                  <button className="btn btn-ghost btn-block" onClick={() => setCheckout(false)}>
                    Back to cart
                  </button>
                </div>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

export default function Menu() {
  const { user, isStaff } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category: 'all', q: '', veg: false, sort: 'default' });
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api('/categories')
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = qs({
      category: filters.category,
      q: filters.q,
      veg: filters.veg ? 'true' : '',
      includeUnavailable: isStaff ? 'true' : '',
    });
    api(`/menu${params}`)
      .then((rows) => alive && setItems(rows))
      .catch((e) => toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.q, filters.veg, isStaff]);

  const shown = useMemo(() => {
    const list = [...items];
    if (filters.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (filters.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    if (filters.sort === 'fast') list.sort((a, b) => a.prep_minutes - b.prep_minutes);
    return list;
  }, [items, filters.sort]);

  const availableCount = items.filter((i) => i.is_available).length;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Today&apos;s canteen menu</h1>
          <p className="muted">
            {availableCount} items available · prices update live · order now and collect at your chosen time.
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => cart.setOpen(true)}>
            🛒 Cart · {cart.count}
          </button>
        </div>
      </section>

      <section className="filters">
        <input
          className="search"
          placeholder="Search dishes…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <div className="chips">
          <button
            className={`chip-btn ${filters.category === 'all' ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, category: 'all' })}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip-btn ${filters.category === c.name ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, category: c.name })}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="filters-right">
          <label className="switch">
            <input
              type="checkbox"
              checked={filters.veg}
              onChange={(e) => setFilters({ ...filters, veg: e.target.checked })}
            />
            <span>Veg only</span>
          </label>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="default">Sort: Recommended</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="fast">Fastest to prepare</option>
          </select>
        </div>
      </section>

      {loading ? (
        <Spinner label="Loading the menu…" />
      ) : shown.length === 0 ? (
        <EmptyState icon="🔍" title="No dishes match your filters" hint="Try clearing the search or picking another category." />
      ) : (
        <section className="menu-grid">
          {shown.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              onAdd={(it) => {
                cart.add(it);
                toast.success(`${it.name} added to cart`);
              }}
            />
          ))}
        </section>
      )}

      {!user ? (
        <section className="cta-strip">
          <div>
            <strong>Sign in to pre-order</strong>
            <p className="muted">Your cart is saved — you can order in one tap after signing in.</p>
          </div>
          <a className="btn btn-primary" href="/login">
            Sign in / Register
          </a>
        </section>
      ) : null}

      {detail ? (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <p className="muted">{detail.description}</p>
          <div className="total-line">
            <span>Price</span>
            <b>{money(detail.price)}</b>
          </div>
          <div className="total-line">
            <span>Category</span>
            <b>{detail.category_name || '—'}</b>
          </div>
          <div className="total-line">
            <span>Preparation time</span>
            <b>{detail.prep_minutes} min</b>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => { cart.add(detail); setDetail(null); }}>
            Add to cart
          </button>
        </Modal>
      ) : null}

      <CartDrawer />
    </div>
  );
}
