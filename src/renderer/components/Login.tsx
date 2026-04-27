import React, { useMemo, useState } from "react";
import { Bot, KeyRound, ShieldCheck, Waypoints } from "lucide-react";

import BrandMark from "./BrandMark";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";

type Props = {
  onLoginSuccess?: () => void;
};

type BrowserProvider = "google" | "github" | "discord";

const PROVIDERS: Array<{
  id: BrowserProvider;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "google", label: "Google", icon: ShieldCheck },
  { id: "github", label: "GitHub", icon: Bot },
  { id: "discord", label: "Discord", icon: Waypoints },
];

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [server, setServer] = useState(process.env.AUTH_SERVER_URL || "");
  const [provider, setProvider] = useState<BrowserProvider>("google");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const selectedProviderLabel = useMemo(
    () => PROVIDERS.find((item) => item.id === provider)?.label || "provider",
    [provider]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);

    try {
      const api = (window as any).api;
      if (!api?.runtimeLoginBrowser) {
        throw new Error("Runtime API not available");
      }

      setHint(`Opening ${selectedProviderLabel} sign-in in your browser...`);

      const result = await api.runtimeLoginBrowser({
        provider,
        server_url: server,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Login failed");
      }

      setHint(null);
      onLoginSuccess?.();
    } catch (err: any) {
      setHint(null);
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
              <strong>Desktop browser handoff</strong>
            </div>
          </div>

          <div className="login-card__copy">
            <Badge variant="secondary">
              <KeyRound className="size-4" />
              Browser login
            </Badge>
            <h2>Authenticate in your browser and return the session to Hermes.</h2>
            <p>
              Hermes opens the OAuth flow in your default browser and finishes the
              desktop session handoff automatically when the login callback arrives.
            </p>
          </div>

          <div className="login-card__notes">
            <div className="login-card__note">
              <ShieldCheck className="size-4" />
              <span>Tokens are stored in the shared runtime state on this machine.</span>
            </div>
            <div className="login-card__note">
              <Waypoints className="size-4" />
              <span>The runtime and the desktop UI reuse the same authenticated session.</span>
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

          <div className="login-field login-field--full">
            <label>Provider</label>
            <div className="login-provider-grid">
              {PROVIDERS.map((item) => {
                const Icon = item.icon;
                const isActive = provider === item.id;

                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className="login-provider-button"
                    onClick={() => setProvider(item.id)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="login-form__actions">
            <p className="login-form__note">
              Hermes will wait for the browser callback and finish the machine login
              in this app automatically.
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "Waiting for browser login..." : "Open browser and sign in"}
            </Button>
          </div>

          {hint ? <div className="status-banner status-banner--info">{hint}</div> : null}
          {error ? <div className="status-banner status-banner--error">{error}</div> : null}
        </form>
      </CardContent>
    </Card>
  );
};

export default Login;
