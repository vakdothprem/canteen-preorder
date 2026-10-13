import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components.jsx';
import Login, { ProtectedRoute, Register } from './pages/Auth.jsx';
import Menu from './pages/Menu.jsx';
import Orders from './pages/Orders.jsx';
import Kitchen from './pages/Kitchen.jsx';
import Admin from './pages/Admin.jsx';
import Reports from './pages/Reports.jsx';
import Profile from './pages/Profile.jsx';
import { useAuth } from './state.jsx';

function Footer() {
  return (
    <footer className="foot">
      <div>
        <strong>Canteen Pre-Order Management System</strong>
        <span className="muted">
          {' '}
          — reduce queues, cut manual errors and keep canteen operations organised.
        </span>
      </div>
      <div className="muted small">
        Modules: User · Menu · Order · Payment · Notification · Admin &amp; Reports
      </div>
    </footer>
  );
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Menu />;
}

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Landing />} />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue"
            element={
              <ProtectedRoute staff>
                <Orders allOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute staff>
                <Kitchen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute admin>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute admin>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
