import React, { useState } from "react";

type Props = {
  onLoginSuccess?: () => void;
};

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [server, setServer] = useState(process.env.AUTH_SERVER_URL || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const api = (window as any).api;
      if (!api?.runtimeLogin) throw new Error("Runtime API not available");

      const res = await api.runtimeLogin({
        email,
        password,
        server_url: server,
      });

      if (!res?.ok) throw new Error(res?.error || "Login failed");
      onLoginSuccess?.();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <h2>Authenticate Hermes</h2>
      <p className="login-copy">
        Save the user credentials once from the app. Hermes will write the
        shared runtime-state and the Windows service will reuse that session.
      </p>
      <form onSubmit={submit} className="login-form">
        <label>
          Server URL
          <input
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="https://api.example.com"
          />
        </label>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@domain"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? "Authenticating..." : "Save and Authenticate"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
};

export default Login;
