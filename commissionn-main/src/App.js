import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { disconnectDeriv } from './services/deriv';
import LoginModal from './components/LoginModal';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then((session) => setLoggedIn(Boolean(session.authenticated)))
      .catch(() => setError('Unable to check the Deriv session.'))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      disconnectDeriv();
      setLoggedIn(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="loading-spinner"></div><div>Checking your Deriv session...</div></div>;

  return (
    <Router>
      <Routes>
        <Route path="/admindashboard" element={<AdminDashboard />} />
        <Route path="/" element={loggedIn ? <Dashboard onLogout={logout} /> : <LoginModal error={error} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
