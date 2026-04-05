import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";
import Login from "./Login";
import LogsPanel from "./LogsPanel";

type RuntimeStatus = {
  mode: string;
  lifecycle: string;
  connected: boolean;
  authenticated: boolean;
  agentId: string;
  serverUrl: string;
  monitoringIntervalMs: number;
  lastSnapshotAt?: string | null;
  lastAuthAt?: string | null;
  lastError?: string | null;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
};

type ServiceStatus = {
  installed: boolean;
  running: boolean;
  status: string;
  canStop?: boolean;
};

type StatusPayload = {
  runtime?: RuntimeStatus;
  runtimeState?: {
    serverUrl?: string;
    agentId?: string;
    monitoringIntervalMs?: number;
    lastAuthAt?: string | null;
    hasAccessToken?: boolean;
    hasRefreshToken?: boolean;
  };
  service?: ServiceStatus;
  hasStoredCredentials?: boolean;
};

const EMPTY_STATUS: StatusPayload = {
  runtime: {
    mode: "manual",
    lifecycle: "idle",
    connected: false,
    authenticated: false,
    agentId: "",
    serverUrl: "",
    monitoringIntervalMs: 30000,
    lastSnapshotAt: null,
    lastAuthAt: null,
    lastError: null,
    hasAccessToken: false,
    hasRefreshToken: false,
  },
  runtimeState: {
    serverUrl: "",
    agentId: "",
    monitoringIntervalMs: 30000,
    lastAuthAt: null,
    hasAccessToken: false,
    hasRefreshToken: false,
  },
  service: {
    installed: false,
    running: false,
    status: "not-installed",
    canStop: false,
  },
  hasStoredCredentials: false,
};

const App: React.FC = () => {
  const [status, setStatus] = useState<StatusPayload>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function loadStatus() {
      setLoading(true);
      try {
        const result = await (window as any).api.runtimeStatus();
        if (result?.ok && result.status) {
          setStatus((prev) => ({ ...prev, ...result.status }));
        }
      } finally {
        setLoading(false);
      }
    }

    void loadStatus();

    if ((window as any).api?.onRuntimeStatusUpdated) {
      unsubscribe = (window as any).api.onRuntimeStatusUpdated(
        (nextStatus: StatusPayload) => {
          setStatus((prev) => ({ ...prev, ...nextStatus }));
        }
      );
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const runtime = status.runtime ?? EMPTY_STATUS.runtime!;
  const service = status.service ?? EMPTY_STATUS.service!;
  const runtimeState = status.runtimeState ?? EMPTY_STATUS.runtimeState!;
  const needsLogin = useMemo(() => {
    return !runtimeState.serverUrl || !runtimeState.hasAccessToken;
  }, [runtimeState.hasAccessToken, runtimeState.serverUrl]);

  async function refreshStatus() {
    setActionError(null);
    const result = await (window as any).api.runtimeStatus();
    if (result?.ok && result.status) {
      setStatus((prev) => ({ ...prev, ...result.status }));
      return;
    }
    setActionError(result?.error || "Could not refresh status");
  }

  async function runAction(
    key: string,
    action: () => Promise<{ ok?: boolean; error?: string }>
  ) {
    setActionError(null);
    setBusyAction(key);
    try {
      const result = await action();
      if (!result?.ok) {
        setActionError(result?.error || "Action failed");
      } else {
        await refreshStatus();
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <h1>HERMES Control Panel</h1>
          <p>Windows agent runtime shared by the Electron app and the service.</p>
        </div>
        <div className="header-actions">
          <button onClick={() => void refreshStatus()} disabled={loading}>
            Refresh
          </button>
          <button
            onClick={() =>
              void runAction("restart-runtime", () =>
                (window as any).api.runtimeRestart()
              )
            }
            disabled={busyAction !== null}
          >
            Reconnect Runtime
          </button>
          <button
            onClick={() => setShowLogs((value) => !value)}
            disabled={busyAction !== null}
          >
            {showLogs ? "Hide logs" : "Show logs"}
          </button>
        </div>
      </div>

      {actionError ? <div className="banner error">{actionError}</div> : null}

      {needsLogin ? (
        <Login
          onLoginSuccess={() => {
            void refreshStatus();
          }}
        />
      ) : null}

      <div className="status-grid">
        <section className="panel">
          <h2>Runtime</h2>
          <div className="row">
            <span>Lifecycle</span>
            <strong>{runtime.lifecycle}</strong>
          </div>
          <div className="row">
            <span>Connected</span>
            <strong className={runtime.connected ? "ok" : "warn"}>
              {runtime.connected ? "Yes" : "No"}
            </strong>
          </div>
          <div className="row">
            <span>Mode</span>
            <strong>{runtime.mode}</strong>
          </div>
          <div className="row">
            <span>Agent ID</span>
            <strong>{runtimeState.agentId || runtime.agentId || "—"}</strong>
          </div>
          <div className="row">
            <span>Server</span>
            <strong>{runtimeState.serverUrl || runtime.serverUrl || "—"}</strong>
          </div>
          <div className="row">
            <span>Interval</span>
            <strong>
              {runtimeState.monitoringIntervalMs || runtime.monitoringIntervalMs} ms
            </strong>
          </div>
          <div className="row">
            <span>Last auth</span>
            <strong>
              {runtimeState.lastAuthAt
                ? new Date(runtimeState.lastAuthAt).toLocaleString()
                : "No session"}
            </strong>
          </div>
          <div className="row">
            <span>Last snapshot</span>
            <strong>
              {runtime.lastSnapshotAt
                ? new Date(runtime.lastSnapshotAt).toLocaleString()
                : "No data sent yet"}
            </strong>
          </div>
          <div className="row">
            <span>Session</span>
            <strong>
              {runtimeState.hasAccessToken || runtimeState.hasRefreshToken
                ? "Shared runtime-state ready"
                : "Waiting for login"}
            </strong>
          </div>
          {runtime.lastError ? (
            <div className="panel-note error">{runtime.lastError}</div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Windows Service</h2>
          <div className="row">
            <span>Installed</span>
            <strong className={service.installed ? "ok" : "warn"}>
              {service.installed ? "Yes" : "No"}
            </strong>
          </div>
          <div className="row">
            <span>Status</span>
            <strong>{service.status}</strong>
          </div>
          <div className="row">
            <span>Running</span>
            <strong className={service.running ? "ok" : "warn"}>
              {service.running ? "Yes" : "No"}
            </strong>
          </div>

          <div className="service-actions">
            <button
              onClick={() =>
                void runAction("service-install", () =>
                  (window as any).api.serviceInstall()
                )
              }
              disabled={busyAction !== null || service.installed}
            >
              Install
            </button>
            <button
              onClick={() =>
                void runAction("service-start", () =>
                  (window as any).api.serviceStart()
                )
              }
              disabled={busyAction !== null || !service.installed || service.running}
            >
              Start
            </button>
            <button
              onClick={() =>
                void runAction("service-stop", () =>
                  (window as any).api.serviceStop()
                )
              }
              disabled={busyAction !== null || !service.running}
            >
              Stop
            </button>
            <button
              onClick={() =>
                void runAction("service-uninstall", () =>
                  (window as any).api.serviceUninstall()
                )
              }
              disabled={busyAction !== null || !service.installed}
            >
              Uninstall
            </button>
          </div>

          <div className="panel-note">
            {service.installed
              ? "When the service is installed, the app stays in control-panel mode and does not start a second runtime."
              : "Without the service installed, the Electron app hosts the runtime in manual mode while it is open."}
          </div>
        </section>
      </div>

      {showLogs ? (
        <section className="panel">
          <h2>Logs</h2>
          <LogsPanel />
        </section>
      ) : null}
    </div>
  );
};

export default App;
