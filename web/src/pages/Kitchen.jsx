import React, { useCallback, useEffect, useState } from 'react';
import { api, money, timeAgo } from '../api.js';
import { useToast } from '../state.jsx';
import { EmptyState, Modal, Spinner, StatusBadge } from '../components.jsx';

const COLUMNS = [
  { key: 'Pending', title: 'New orders', hint: 'Waiting to be accepted', action: 'Accept', next: 'Confirmed', tone: 'pending' },
  { key: 'Confirmed', title: 'Accepted', hint: 'Ready to start cooking', action: 'Start preparing', next: 'Preparing', tone: 'confirmed' },
  { key: 'Preparing', title: 'In the kitchen', hint: 'Being prepared now', action: 'Mark ready', next: 'Ready', tone: 'preparing' },
  { key: 'Ready', title: 'Ready for pickup', hint: 'Waiting at the counter', action: 'Complete', next: 'Completed', tone: 'ready' },
];

function Card({ order, column, onAdvance, onOpen, busy }) {
  return (
    <article className={`kcard kcard-${column.tone}`}>
      <header>
        <b>{order.code}</b>
        <span className="muted small">{timeAgo(order.placed_at)}</span>
      </header>
      <div className="kcard-body">
        <div>
          <span className="muted small">Customer</span>
          <div>{order.customer_name}</div>
        </div>
        <div>
          <span className="muted small">Pickup</span>
          <div>{order.pickup_time || '—'}</div>
        </div>
        <div>
          <span className="muted small">Items</span>
          <div>{order.total_qty}</div>
        </div>
        <div>
          <span className="muted small">Total</span>
          <div>{money(order.total)}</div>
        </div>
      </div>
      <footer>
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(order.id)}>
          Details
        </button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAdvance(order, column.next)}>
          {column.action}
        </button>
      </footer>
    </article>
  );
}

export default function Kitchen() {
  const toast = useToast();
  const [board, setBoard] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [auto, setAuto] = useState(true);

  const load = useCallback(() => {
    api('/orders/board')
      .then(setBoard)
      .catch((e) => toast.error(e.message));
  }, [toast]);

  useEffect(() => {
    load();
    if (!auto) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load, auto]);

  const advance = async (order, next) => {
    setBusyId(order.id);
    try {
      await api(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: next } });
      toast.success(`${order.code} → ${next}`);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const total = board ? COLUMNS.reduce((s, c) => s + (board[c.key] || []).length, 0) : 0;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Kitchen board</h1>
          <p className="muted">Live view of every active pre-order. Cards refresh automatically every 15 seconds.</p>
        </div>
        <div className="hero-actions">
          <span className="pill">{total} active</span>
          <label className="switch">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>Auto refresh</span>
          </label>
          <button className="btn btn-ghost" onClick={load}>
            ⟳ Refresh
          </button>
        </div>
      </section>

      {!board ? (
        <Spinner label="Loading the board…" />
      ) : total === 0 ? (
        <EmptyState icon="🍳" title="No active orders" hint="New pre-orders will appear in the first column instantly." />
      ) : (
        <section className="kanban">
          {COLUMNS.map((c) => (
            <div className="kcol" key={c.key}>
              <header className={`kcol-head kcol-${c.tone}`}>
                <div>
                  <strong>{c.title}</strong>
                  <div className="muted small">{c.hint}</div>
                </div>
                <span className="kcount">{(board[c.key] || []).length}</span>
              </header>
              <div className="kcol-body">
                {(board[c.key] || []).map((o) => (
                  <Card key={o.id} order={o} column={c} busy={busyId === o.id} onAdvance={advance} onOpen={setOpenId} />
                ))}
                {(board[c.key] || []).length === 0 ? <p className="muted small pad">Empty</p> : null}
              </div>
            </div>
          ))}
        </section>
      )}

      {openId ? <KitchenDetail orderId={openId} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </div>
  );
}

function KitchenDetail({ orderId, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const toast = useToast();

  const load = () => api(`/orders/${orderId}`).then(setOrder).catch((e) => toast.error(e.message));
  useEffect(load, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={order ? `Order ${order.code}` : 'Order'} onClose={onClose}>
      {!order ? (
        <Spinner />
      ) : (
        <>
          <div className="detail-head">
            <StatusBadge status={order.status} />
            <span className="muted">pickup {order.pickup_time || '—'}</span>
          </div>
          <p>
            <b>{order.customer_name}</b> · {order.customer_email}
          </p>
          {order.notes ? <div className="alert alert-info">📝 {order.notes}</div> : null}
          <ul className="ticket">
            {order.items.map((i) => (
              <li key={i.id}>
                <span>{i.item_name}</span>
                <b>×{i.quantity}</b>
              </li>
            ))}
          </ul>
          <div className="total-line">
            <span>Total</span>
            <b>{money(order.total)}</b>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={async () => {
              try {
                await api(`/orders/${order.id}/payment`, { method: 'PATCH', body: { payment_status: 'Paid' } });
                toast.success('Payment recorded');
                load();
                onChanged && onChanged();
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            Record payment received
          </button>
        </>
      )}
    </Modal>
  );
}
