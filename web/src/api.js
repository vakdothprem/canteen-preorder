/** Thin fetch wrapper around the REST API. */
const TOKEN_KEY = 'canteen.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_e) {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_e) {
    /* storage disabled — session stays in memory only */
  }
};

export async function api(path, options = {}) {
  const { method = 'GET', body, auth = true } = options;
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (_e) {
    throw new Error('Cannot reach the server. Is the backend running on port 4000?');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch (_e) {
    /* no JSON body */
  }

  if (!res.ok || (payload && payload.success === false)) {
    const error = new Error((payload && payload.error) || `Request failed (HTTP ${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload ? payload.data : null;
}

export const qs = (params) => {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') usp.set(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
};

export const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

export const timeAgo = (value) => {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z')).getTime();
  if (Number.isNaN(then)) return value;
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export const clock = (value) => {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const dateOnly = (value) => {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};
