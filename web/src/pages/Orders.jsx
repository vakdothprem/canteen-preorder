import React, { useCallback, useEffect, useState } from 'react';
import { api, clock, dateOnly, money, qs, timeAgo } from '../api.js';
import { useAuth, useToast } from '../state.jsx';
import { EmptyState, Modal, Spinner, StatusBadge } from '../components.jsx';

const TABS = ['all', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

function OrderDetail({ orderId, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const { isStaff } = useAuth();
  const toast = useToast();

  const load = useCallback(() => {
    api(`/orders/${orderId}`).then(setOrder).catch((e) => toast.error(e.message));
  }, [orderId, toast]);

  useEffect(load, [load]);

  const act = async (fn, message) => {
    try {
      await fn();
      toast.success(message);
      load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Modal title={order ? `Order ${order.code}` : 'Order'} onClose={onClose} wide>
      {!order ? (
        <Spinner />
      ) : (
        <>
          <div className="detail-head">
            <StatusBadge status={order.status} />
            <span className="muted">
              placed {timeAgo(order.placed_at)} · pickup {order.pickup_time || '—'}
            </span>
          </div>

          <div className="grid-2 gap">
            <div className="panel">
              <h4>Customer</h4>
              <p>
                <b>{order.customer_name}</b>
                <br />
                <span className="muted">{order.customer_email}</span>
                <br />
                <span className="muted">{order.customer_department || '—'}</span>
              </p>
            </div>
            <div className="panel">
              <h4>Payment</h4>
              <p>
                <b>{order.payment_method}</b>
                <br />
                <span className={`badge ${order.payment_status === 'Paid' ? 'badge-completed' : 'badge-pending'}`}>
                  {order.payment_status}
                </span>
              </p>
            </div>
          </div>

          {order.notes ? <div className="alert alert-info">📝 {order.notes}</div> : null}

          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.item_name}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{money(i.unit_price)}</td>
                  <td className="num">{money(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">
                  Subtotal
                </td>
                <td className="num">{money(order.subtotal)}</td>
              </tr>
              {order.service_fee > 0 ? (
                <tr>
                  <td colSpan={3} className="num">
                    Service fee
                  </td>
                  <td className="num">{money(order.service_fee)}</td>
                </tr>
              ) : null}
              <tr className="strong">
                <td colSpan={3} className="num">
                  Total
                </td>
                <td className="num">{money(order.total)}</td>
              </tr>
            </tfoot>
          </table>

          <h4>Status timeline</h4>
          <ul className="timeline">
            {order.history.map((h, idx) => (
              <li key={idx}>
                <span className="dot" />
                <div>
                  <b>{h.status}</b>
                  <div className="muted small">
                    {dateOnly(h.created_at)} · {clock(h.created_at)} {h.changed_by_name ? `· ${h.changed_by_name}` : ''}
                  </div>
                  {h.note ? <div className="muted small">{h.note}</div> : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="actions">
            {isStaff ? (
              <>
                {order.status === 'Pending' ? (
                  <button className="btn btn-primary" onClick={() => act(() => api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'Confirmed' } }), 'Order accepted')}>
                    Accept order
                  </button>
                ) : null}
                {order.status === 'Confirmed' ? (
                  <button className="btn btn-primary" onClick={() => act(() => api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'Preparing' } }), 'Preparation started')}>
                    Start preparing
                  </button>
                ) : null}
                {order.status === 'Preparing' ? (
                  <button className="btn btn-primary" onClick={() => act(() => api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'Ready' } }), 'Marked ready — customer notified')}>
                    Mark ready for pickup
                  </button>
                ) : null}
                {order.status === 'Ready' ? (
                  <button className="btn btn-primary" onClick={() => act(() => api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'Completed' } }), 'Order completed')}>
                    Mark completed / picked up
                  </button>
                ) : null}
                {order.payment_status !== 'Paid' ? (
                  <button className="btn btn-ghost" onClick={() => act(() => api(`/orders/${order.id}/payment`, { method: 'PATCH', body: { payment_status: 'Paid' } }), 'Payment recorded')}>
                    Record payment
                  </button>
                ) : null}
              </>
            ) : null}
            {['Pending', 'Confirmed'].includes(order.status) ? (
              <button className="btn btn-danger" onClick={() => act(() => api(`/orders/${order.id}/cancel`, { method: 'POST', body: {} }), 'Order cancelled')}>
                Cancel order
              </button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Orders({ allOrders = false }) {
  const { user, isStaff } = useAuth();
  const toast = useToast();
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  const scoped = allOrders && isStaff;

  const load = useCallback(() => {
    setLoading(true);
    api(`/orders${qs({ status, q, page, limit: 12, mine: scoped ? '' : 'true' })}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [status, q, page, scoped, toast]);

  useEffect(load, [load]);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>{scoped ? 'All orders' : 'My orders'}</h1>
          <p className="muted">
            {scoped ? 'Every pre-order placed by customers, newest first.' : 'Track your pre-orders from Pending to Completed.'}
          </p>
        </div>
        <span className="pill">{data.total} order(s)</span>
      </section>

      <section className="filters">
        <input className="search" placeholder="Search by order code or customer…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <div className="chips">
          {TABS.map((t) => (
            <button key={t} className={`chip-btn ${status === t ? 'active' : ''}`} onClick={() => { setStatus(t); setPage(1); }}>
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState icon="🧾" title="No orders here yet" hint={scoped ? 'New pre-orders will appear as soon as customers confirm them.' : 'Head to the menu and place your first pre-order.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                {scoped ? <th>Customer</th> : null}
                <th>Placed</th>
                <th>Pickup</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.code}</b>
                  </td>
                  {scoped ? (
                    <td>
                      {o.customer_name}
                      <div className="muted small">{o.customer_email}</div>
                    </td>
                  ) : null}
                  <td>
                    {dateOnly(o.placed_at)}
                    <div className="muted small">{clock(o.placed_at)}</div>
                  </td>
                  <td>{o.pickup_time || '—'}</td>
                  <td className="num">{o.item_count}</td>
                  <td className="num">{money(o.total)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <span className={`badge ${o.payment_status === 'Paid' ? 'badge-completed' : o.payment_status === 'Refunded' ? 'badge-cancelled' : 'badge-pending'}`}>
                      {o.payment_status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(o.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 ? (
        <div className="pager">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <span className="muted">
            Page {data.page} of {data.pages}
          </span>
          <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      ) : null}

      {!user ? null : null}
      {openId ? <OrderDetail orderId={openId} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </div>
  );
}
