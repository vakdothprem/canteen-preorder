import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

/* ------------------------------------------------------------------ toasts */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(
    () => ({
      push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------------- auth */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api('/auth/me');
      setUser(me);
      return me;
    } catch (_e) {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/auth/register', { method: 'POST', body: payload, auth: false });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      setUser,
      isAdmin: user?.role === 'admin',
      isStaff: user?.role === 'staff' || user?.role === 'admin',
    }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* -------------------------------------------------------------------- cart */
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);
const CART_KEY = 'canteen.cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_e) {
      return [];
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (_e) {
      /* ignore */
    }
  }, [items]);

  const add = useCallback((item, qty = 1) => {
    setItems((prev) => {
      const found = prev.find((i) => i.menu_item_id === item.id);
      if (found) {
        return prev.map((i) =>
          i.menu_item_id === item.id ? { ...i, quantity: Math.min(50, i.quantity + qty) } : i
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price),
          image_emoji: item.image_emoji || '🍽️',
          prep_minutes: item.prep_minutes || 10,
          quantity: qty,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((id, quantity) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.menu_item_id !== id)
        : prev.map((i) => (i.menu_item_id === id ? { ...i, quantity: Math.min(50, quantity) } : i))
    );
  }, []);

  const remove = useCallback((id) => setItems((prev) => prev.filter((i) => i.menu_item_id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
  const prepMinutes = items.reduce((m, i) => Math.max(m, i.prep_minutes || 0), 0);

  const value = useMemo(
    () => ({ items, add, setQuantity, remove, clear, count, subtotal, prepMinutes, open, setOpen }),
    [items, add, setQuantity, remove, clear, count, subtotal, prepMinutes, open]
  );

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
