export default function LoginModal({ error }) {
  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-icon">✨</div>
        <h2>Welcome Back</h2>
        <p className="subtitle">Access your Deriv application markup dashboard</p>
        <a className="btn-primary" href="/api/auth/login">Sign In with Deriv</a>
        {error && <div className="error-message">{error}</div>}
        <p className="modal-footer">Authentication uses Deriv OAuth 2.0 with PKCE. Your token stays server-side.</p>
      </div>
    </div>
  );
}
