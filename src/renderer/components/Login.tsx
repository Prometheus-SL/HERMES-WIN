import React, { useState } from "react";
import { KeyRound, ShieldCheck, Waypoints } from "lucide-react";

import BrandMark from "./BrandMark";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  onLoginSuccess?: () => void;
};

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [server, setServer] = useState(process.env.AUTH_SERVER_URL || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const api = (window as any).api;
      if (!api?.runtimeLogin) {
        throw new Error("Runtime API not available");
      }

      const result = await api.runtimeLogin({
        email,
        password,
        server_url: server,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Login failed");
      }

      onLoginSuccess?.();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="surface-card login-card">
      <CardContent className="login-card__content">
        <div className="login-card__intro">
          <div className="brand-inline brand-inline--stacked">
            <BrandMark className="brand-mark--large" />
            <div>
              <span className="brand-inline__eyebrow">Prometeo Hermes</span>
              <strong>Desktop session handoff</strong>
            </div>
          </div>

          <div className="login-card__copy">
            <Badge variant="secondary">
              <KeyRound className="size-4" />
              First time setup
            </Badge>
            <h2>Authenticate this machine once and keep the session reusable.</h2>
            <p>
              The runtime stores the session in a shared state file so the desktop
              app and the background agent can both work from the same credentials.
            </p>
          </div>

          <div className="login-card__notes">
            <div className="login-card__note">
              <ShieldCheck className="size-4" />
              <span>Access tokens are reused by the shared runtime.</span>
            </div>
            <div className="login-card__note">
              <Waypoints className="size-4" />
              <span>Set the server URL here and the whole machine follows it.</span>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="login-form">
          <div className="login-field login-field--full">
            <label htmlFor="server-url">Server URL</label>
            <Input
              id="server-url"
              value={server}
              onChange={(event) => setServer(event.target.value)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <Input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@domain"
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />
          </div>

          <div className="login-form__actions">
            <p className="login-form__note">
              Once saved, Hermes can refresh the shared runtime without asking for
              credentials again every time the UI opens.
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "Authenticating..." : "Save credentials"}
            </Button>
          </div>

          {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        </form>
      </CardContent>
    </Card>
  );
};

export default Login;
