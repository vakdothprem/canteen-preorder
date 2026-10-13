import React, { useEffect, useState } from 'react';
import { api, money, qs } from '../api.js';
import { useToast } from '../state.jsx';
import { BarChart, ProgressList, Spinner, StatCard } from '../components.jsx';

export default function Reports() {
  const toast = useToast();
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/reports/summary${qs({ days })}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [days, toast]);

  if (loading) return <div className="page"><Spinner label="Crunching the numbers…" /></div>;
  if (!data) return <div className="page"><p className="muted">No report data available.</p></div>;

  const statusTotal = data.byStatus.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Reports &amp; analytics</h1>
          <p className="muted">Order volume, revenue and demand patterns across the canteen.</p>
        </div>
        <div className="chips">
          {[7, 14, 30].map((d) => (
            <button key={d} className={`chip-btn ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
      </section>

      <section className="stats">
        <StatCard label={`Revenue · last ${days} days`} value={money(data.totals.revenue)} sub={`${data.totals.orders} orders`} icon="💰" tone="green" />
        <StatCard label="Average order value" value={money(data.totals.avg_order)} sub="per completed pre-order" icon="📈" tone="blue" />
        <StatCard label="Today" value={money(data.today.revenue)} sub={`${data.today.orders} orders so far`} icon="🗓️" tone="amber" />
        <StatCard
          label="Completion rate"
          value={`${Math.round(((data.byStatus.find((s) => s.status === 'Completed')?.count || 0) / statusTotal) * 100)}%`}
          sub={`${data.byStatus.find((s) => s.status === 'Cancelled')?.count || 0} cancelled`}
          icon="✅"
          tone="purple"
        />
      </section>

      <section className="panel">
        <h3>Daily revenue</h3>
        <BarChart data={data.byDay} valueKey="revenue" labelKey="day" format={(v) => `₹${Math.round(v)}`} />
      </section>

      <div className="grid-2 gap">
        <section className="panel">
          <h3>Best-selling items</h3>
          <ProgressList data={data.topItems} valueKey="quantity" labelKey="name" format={(v) => `${v} sold`} />
        </section>
        <section className="panel">
          <h3>Revenue by category</h3>
          <ProgressList data={data.byCategory} valueKey="revenue" labelKey="category" format={(v) => money(v)} />
        </section>
      </div>

      <div className="grid-2 gap">
        <section className="panel">
          <h3>Order status breakdown</h3>
          <ul className="status-list">
            {data.byStatus.map((s) => (
              <li key={s.status}>
                <span>{s.status}</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(s.count / statusTotal) * 100}%` }} />
                </div>
                <b>{s.count}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3>Payment methods</h3>
          <ul className="status-list">
            {data.byPayment.map((p) => (
              <li key={p.method}>
                <span>{p.method}</span>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(p.count / (data.byPayment.reduce((s, x) => s + x.count, 0) || 1)) * 100}%` }}
                  />
                </div>
                <b>{money(p.revenue)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h3>Top customers</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th className="num">Orders</th>
                <th className="num">Spent</th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c) => (
                <tr key={c.email}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td className="muted">{c.email}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{money(c.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
