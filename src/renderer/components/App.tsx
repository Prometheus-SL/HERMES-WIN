import React, { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  CloudCog,
  Gauge,
  HardDriveDownload,
  LifeBuoy,
  Power,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  Waypoints,
  Zap,
} from "lucide-react";

import BrandMark from "./BrandMark";
import Login from "./Login";
import LogsPanel from "./LogsPanel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";

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
  name?: string;
  internalName?: string;
  displayName?: string;
  kind?: string;
  supported?: boolean;
  installed: boolean;
  running: boolean;
  status: string;
  canStop?: boolean;
  actions?: {
    install?: boolean;
    start?: boolean;
    stop?: boolean;
    uninstall?: boolean;
  };
  error?: string;
};

type PlatformCapabilities = {
  audio?: boolean;
  audioOutputs?: boolean;
  sleep?: boolean;
  hibernate?: boolean;
  lockScreen?: boolean;
  daemonControl?: boolean;
};

type StatusPayload = {
  platform?: string;
  capabilities?: PlatformCapabilities;
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

type SessionState = "missing" | "cached" | "ready";
type BadgeTone =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

const EMPTY_STATUS: StatusPayload = {
  platform: "unknown",
  capabilities: {
    audio: false,
    audioOutputs: false,
    sleep: false,
    hibernate: false,
    lockScreen: false,
    daemonControl: false,
  },
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
    displayName: "Background agent",
    kind: "manual",
    supported: false,
    installed: false,
    running: false,
    status: "not-installed",
    canStop: false,
    actions: {
      install: false,
      start: false,
      stop: false,
      uninstall: false,
    },
  },
  hasStoredCredentials: false,
};

function formatPlatformLabel(platform?: string | null) {
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  if (platform === "darwin") return "macOS";
  return platform || "Unknown";
}

function formatRelative(value?: string | null) {
  if (!value) return "Waiting for first event";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting for first event";

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));

  if (diffSeconds < 60) return "Just now";
  if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} min ago`;
  if (diffSeconds < 86400) return `${Math.round(diffSeconds / 3600)} h ago`;
  if (diffSeconds < 604800) return `${Math.round(diffSeconds / 86400)} d ago`;
  if (diffSeconds < 2628000) return `${Math.round(diffSeconds / 604800)} wk ago`;
  if (diffSeconds < 31536000) return `${Math.round(diffSeconds / 2628000)} mo ago`;
  return `${Math.round(diffSeconds / 31536000)} yr ago`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "No data yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No data yet";
  return date.toLocaleString();
}

function compactServerLabel(value?: string | null) {
  if (!value) return "Not configured";

  try {
    const parsed = new URL(value);
    return parsed.host;
  } catch (_error) {
    return value.replace(/^https?:\/\//i, "") || value;
  }
}

function getSessionState(
  runtimeState: StatusPayload["runtimeState"],
  hasStoredCredentials?: boolean
): SessionState {
  if (runtimeState?.hasAccessToken) return "ready";
  if (runtimeState?.hasRefreshToken || hasStoredCredentials) return "cached";
  return "missing";
}

function computeSessionProgress(state: SessionState) {
  if (state === "ready") return 100;
  if (state === "cached") return 62;
  return 12;
}

function computeRuntimeProgress(runtime: RuntimeStatus) {
  if (runtime.connected) return 100;
  if (runtime.lifecycle === "connecting" || runtime.lifecycle === "reconnecting") {
    return 68;
  }
  if (runtime.authenticated) return 54;
  if (runtime.lifecycle === "running") return 72;
  return 16;
}

function computeServiceProgress(service: ServiceStatus) {
  if (service.supported === false) return 100;
  if (service.running) return 100;
  if (service.installed) return 64;
  return 10;
}

function toneForLifecycle(
  runtime: RuntimeStatus,
  sessionState: SessionState
): BadgeTone {
  if (runtime.lastError) return "destructive";
  if (runtime.connected) return "success";
  if (sessionState !== "missing" || runtime.authenticated) return "warning";
  return "secondary";
}

function toneForService(service: ServiceStatus): BadgeTone {
  if (service.supported === false) return "secondary";
  if (service.running) return "success";
  if (service.installed) return "warning";
  return "outline";
}

function getSessionLabel(state: SessionState) {
  if (state === "ready") return "Authenticated";
  if (state === "cached") return "Cached";
  return "Missing";
}

function getRecommendation(
  runtime: RuntimeStatus,
  service: ServiceStatus,
  sessionState: SessionState,
  needsLogin: boolean
) {
  if (needsLogin) {
    return {
      tone: "warning" as BadgeTone,
      title: "Complete machine login",
      description:
        "Store the server URL and credentials once so the desktop app and the background runtime can share the same session.",
    };
  }

  if (service.supported === false) {
    return {
      tone: "secondary" as BadgeTone,
      title: "Manual mode on this platform",
      description:
        "Hermes is running without a managed daemon here. The desktop app can still keep the runtime alive while it stays open.",
    };
  }

  if (!service.installed) {
    return {
      tone: "default" as BadgeTone,
      title: "Install the background agent",
      description:
        "This keeps Hermes available when the desktop console is closed and makes the setup more reliable after reboot or login.",
    };
  }

  if (!service.running) {
    return {
      tone: "warning" as BadgeTone,
      title: "Start the background agent",
      description:
        "The machine is provisioned, but the daemon is currently stopped. Start it to resume background monitoring.",
    };
  }

  if (!runtime.connected) {
    return {
      tone: "warning" as BadgeTone,
      title: "Reconnect the runtime",
      description:
        "The background agent is active, but the live runtime has not linked back to the server yet. A reconnect usually restores the session.",
    };
  }

  return {
    tone: "success" as BadgeTone,
    title: "Everything looks healthy",
    description:
      "The runtime is linked, the session is shared correctly, and the background agent is ready to keep Hermes online.",
  };
}

function statusLabel(
  runtime: RuntimeStatus,
  service: ServiceStatus,
  sessionState: SessionState
) {
  if (runtime.connected) return "Connected";
  if (service.running) return "Background agent active";
  if (sessionState === "cached" || sessionState === "ready") return "Session ready";
  return "Setup needed";
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  helper,
  progress,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  helper: string;
  progress: number;
}) {
  return (
    <div className="overview-stat">
      <div className="overview-stat__top">
        <span className="overview-stat__icon">
          <Icon className="size-4" />
        </span>
        <div className="overview-stat__copy">
          <span className="overview-stat__label">{label}</span>
          <strong className="overview-stat__value">{value}</strong>
        </div>
      </div>
      <p className="overview-stat__helper">{helper}</p>
      <Progress value={progress} className="overview-stat__progress" />
    </div>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "muted";
}) {
  return (
    <div className="detail-row">
      <span className="detail-row__label">{label}</span>
      <strong className={cn("detail-row__value", tone && `detail-row__value--${tone}`)}>
        {value}
      </strong>
    </div>
  );
}

function ChecklistItem({
  label,
  complete,
  description,
}: {
  label: string;
  complete: boolean;
  description: string;
}) {
  return (
    <div className="checklist-item">
      <div className={cn("checklist-item__dot", complete && "checklist-item__dot--done")}>
        <CheckCircle2 className="size-4" />
      </div>
      <div className="checklist-item__copy">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <Badge variant={complete ? "success" : "warning"}>
        {complete ? "Done" : "Pending"}
      </Badge>
    </div>
  );
}

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
        await refreshStatus();
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
  const sessionState = getSessionState(runtimeState, status.hasStoredCredentials);
  const needsLogin = !runtimeState.serverUrl || sessionState === "missing";
  const runtimeProgress = computeRuntimeProgress(runtime);
  const sessionProgress = computeSessionProgress(sessionState);
  const serviceProgress = computeServiceProgress(service);
  const heroTone = toneForLifecycle(runtime, sessionState);
  const serviceTone = toneForService(service);
  const recommendation = getRecommendation(
    runtime,
    service,
    sessionState,
    needsLogin
  );
  const platformLabel = formatPlatformLabel(status.platform);
  const isRefreshing = loading || busyAction === "refresh";
  const updateLabel = formatRelative(runtime.lastSnapshotAt || runtimeState.lastAuthAt);
  const serverLabel = compactServerLabel(runtimeState.serverUrl || runtime.serverUrl);
  const activeAgent = runtimeState.agentId || runtime.agentId || "Awaiting assignment";
  const lifecycleLabel = runtime.connected ? "online" : runtime.lifecycle;

  useEffect(() => {
    if (actionError || runtime.lastError) {
      setShowLogs(true);
    }
  }, [actionError, runtime.lastError]);

  async function refreshStatus(manual = false) {
    if (manual) {
      setActionError(null);
      setBusyAction("refresh");
    }

    try {
      const result = await (window as any).api.runtimeStatus();
      if (result?.ok && result.status) {
        setStatus((prev) => ({ ...prev, ...result.status }));
        return;
      }

      setActionError(result?.error || "Could not refresh status");
    } finally {
      if (manual) {
        setBusyAction(null);
      }
    }
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
        return;
      }

      await refreshStatus();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="console-app">
      <div className="console-backdrop" />
      <div className="console-orb console-orb--primary" />
      <div className="console-orb console-orb--secondary" />
      <div className="console-orb console-orb--accent" />
      <div className="console-grid" />

      <div className="console-shell">
        <section className="ui-card hero-panel">
          <div className="hero-panel__content">
            <div className="hero-panel__main">
              <div className="brand-inline">
                <BrandMark />
                <div>
                  <span className="brand-inline__eyebrow">Prometeo desktop</span>
                  <strong>Hermes Console</strong>
                </div>
              </div>

              <div className="hero-panel__copy">
                <Badge variant={heroTone} className="hero-panel__status">
                  {statusLabel(runtime, service, sessionState)}
                </Badge>
                <h1>Operate Hermes from one cross-platform control room.</h1>
                <p>
                  Keep the shared session under control, monitor the runtime, and
                  manage the background agent from a layout tuned for Windows,
                  Linux, and macOS.
                </p>
              </div>

              <div className="signal-row">
                <span className="signal-pill">
                  <Waypoints className="size-4" />
                  Agent {activeAgent}
                </span>
                <span className="signal-pill">
                  <ServerCog className="size-4" />
                  Platform {platformLabel}
                </span>
                <span className="signal-pill">
                  <Zap className="size-4" />
                  Runtime {lifecycleLabel}
                </span>
                <span className="signal-pill">
                  <CloudCog className="size-4" />
                  Server {serverLabel}
                </span>
              </div>

              <div className="hero-actions">
                <Button
                  onClick={() => void refreshStatus(true)}
                  disabled={loading || busyAction !== null}
                >
                  <RefreshCw className={cn("size-4", isRefreshing && "spin")} />
                  {isRefreshing ? "Refreshing" : "Refresh"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction("restart-runtime", () =>
                      (window as any).api.runtimeRestart()
                    )
                  }
                  disabled={busyAction !== null}
                >
                  <Power className="size-4" />
                  Reconnect runtime
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowLogs((value) => !value)}
                  disabled={busyAction !== null}
                >
                  <TerminalSquare className="size-4" />
                  {showLogs ? "Hide logs" : "Open logs"}
                </Button>
              </div>

              {actionError ? (
                <div className="status-banner status-banner--error">{actionError}</div>
              ) : null}
              {runtime.lastError ? (
                <div className="status-banner status-banner--warn">{runtime.lastError}</div>
              ) : null}
            </div>

            <aside className="hero-panel__aside">
              <div className="recommendation-card">
                <div className="recommendation-card__header">
                  <span className="recommendation-card__eyebrow">
                    <LifeBuoy className="size-4" />
                    Next best step
                  </span>
                  <Badge variant={recommendation.tone}>{recommendation.title}</Badge>
                </div>
                <p>{recommendation.description}</p>
              </div>

              <div className="hero-summary">
                <div className="hero-summary__row">
                  <span>Session</span>
                  <strong>{getSessionLabel(sessionState)}</strong>
                </div>
                <div className="hero-summary__row">
                  <span>Background agent</span>
                  <strong>
                    {service.supported === false
                      ? "Manual only"
                      : service.running
                        ? "Running"
                        : service.status}
                  </strong>
                </div>
                <div className="hero-summary__row">
                  <span>Last update</span>
                  <strong>{updateLabel}</strong>
                </div>
              </div>

              <div className="hero-summary__actions">
                <Button
                  variant="ghost"
                  onClick={() =>
                    void runAction("runtime-clear", () =>
                      (window as any).api.runtimeClear()
                    )
                  }
                  disabled={busyAction !== null}
                >
                  <Trash2 className="size-4" />
                  Reset session
                </Button>
              </div>
            </aside>
          </div>

          <div className="hero-stats">
            <OverviewStat
              icon={ShieldCheck}
              label="Session handoff"
              value={getSessionLabel(sessionState)}
              helper={
                sessionState === "ready"
                  ? "Access token is ready for the shared runtime."
                  : sessionState === "cached"
                    ? "Stored credentials exist and can refresh the runtime."
                    : "Credentials still need to be configured."
              }
              progress={sessionProgress}
            />
            <OverviewStat
              icon={Bot}
              label="Runtime"
              value={runtime.connected ? "Linked" : runtime.lifecycle}
              helper={`Last snapshot ${formatRelative(runtime.lastSnapshotAt)}`}
              progress={runtimeProgress}
            />
            <OverviewStat
              icon={ServerCog}
              label="Background agent"
              value={
                service.supported === false
                  ? "Manual only"
                  : service.running
                    ? "Running"
                    : service.status
              }
              helper={
                service.supported === false
                  ? "This platform currently uses manual runtime mode."
                  : service.installed
                    ? "Background daemon is available on this machine."
                    : "Install the background agent for always-on mode."
              }
              progress={serviceProgress}
            />
            <OverviewStat
              icon={Gauge}
              label="Monitoring"
              value={`${runtimeState.monitoringIntervalMs || runtime.monitoringIntervalMs} ms`}
              helper={`Server host ${serverLabel}`}
              progress={Math.min(
                100,
                Math.max(
                  16,
                  100 -
                    Math.round(
                      (runtimeState.monitoringIntervalMs ||
                        runtime.monitoringIntervalMs ||
                        30000) / 1000
                    )
                )
              )}
            />
          </div>
        </section>

        {needsLogin ? (
          <Login
            onLoginSuccess={() => {
              void refreshStatus();
            }}
          />
        ) : null}

        <section className="workspace-grid">
          <Card className="surface-card status-panel">
            <CardHeader>
              <div className="panel-header">
                <span className="panel-header__icon">
                  <ShieldCheck className="size-4" />
                </span>
                <div>
                  <CardTitle>Shared session</CardTitle>
                  <CardDescription>
                    Credentials are stored once and reused by the app plus the
                    background agent.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="status-panel__content">
              <div className="details-list">
                <DetailRow
                  label="Server URL"
                  value={runtimeState.serverUrl || runtime.serverUrl || "Not configured"}
                  tone={runtimeState.serverUrl || runtime.serverUrl ? "ok" : "warn"}
                />
                <DetailRow
                  label="Session state"
                  value={getSessionLabel(sessionState)}
                  tone={sessionState === "ready" ? "ok" : sessionState === "cached" ? "muted" : "warn"}
                />
                <DetailRow
                  label="Stored credentials"
                  value={status.hasStoredCredentials ? "Yes" : "No"}
                  tone={status.hasStoredCredentials ? "ok" : "warn"}
                />
                <DetailRow
                  label="Last auth"
                  value={formatDateTime(runtimeState.lastAuthAt || runtime.lastAuthAt)}
                />
              </div>

              <div className="status-panel__footer">
                <Progress value={sessionProgress} />
                <p>
                  {needsLogin
                    ? "Complete the login block above to provision the shared session."
                    : "The machine already has enough session data to keep Hermes moving."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card status-panel">
            <CardHeader>
              <div className="panel-header">
                <span className="panel-header__icon">
                  <Bot className="size-4" />
                </span>
                <div>
                  <CardTitle>Runtime</CardTitle>
                  <CardDescription>
                    Live state mirrored from the Hermes process currently serving the
                    machine.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="status-panel__content">
              <div className="details-list">
                <DetailRow label="Lifecycle" value={runtime.lifecycle} />
                <DetailRow
                  label="Connected"
                  value={runtime.connected ? "Yes" : "No"}
                  tone={runtime.connected ? "ok" : "warn"}
                />
                <DetailRow label="Mode" value={runtime.mode} />
                <DetailRow label="Agent ID" value={activeAgent} />
                <DetailRow
                  label="Last snapshot"
                  value={
                    runtime.lastSnapshotAt
                      ? formatDateTime(runtime.lastSnapshotAt)
                      : "No data sent yet"
                  }
                />
              </div>

              <div className="status-panel__footer">
                <Progress value={runtimeProgress} />
                <p>
                  {runtime.connected
                    ? "The runtime is fully linked to the backend."
                    : "Reconnect the runtime if the process is alive but not linked."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card status-panel">
            <CardHeader>
              <div className="panel-header">
                <span className="panel-header__icon">
                  <HardDriveDownload className="size-4" />
                </span>
                <div>
                  <CardTitle>Background agent</CardTitle>
                  <CardDescription>
                    Install, start, stop, or remove the Hermes daemon without leaving
                    the desktop console when this platform supports it.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="status-panel__content status-panel__content--spaced">
              <div className="service-banner">
                <Badge variant={serviceTone}>
                  {service.supported === false
                    ? "Manual only"
                    : service.running
                      ? "Running"
                      : service.installed
                        ? "Installed"
                        : "Not installed"}
                </Badge>
                <p>
                  {service.supported === false
                    ? "This platform currently runs Hermes in manual mode. Background daemon controls will appear here once they are supported."
                    : service.installed
                      ? "Use the background agent for resilient execution and better startup behavior."
                      : "If the background agent is missing, Hermes only lives while the Electron app is open."}
                </p>
              </div>

              {service.supported !== false ? (
                <div className="control-grid">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void runAction("service-install", () =>
                        (window as any).api.serviceInstall()
                      )
                    }
                    disabled={
                      busyAction !== null ||
                      service.installed ||
                      service.actions?.install === false
                    }
                  >
                    <HardDriveDownload className="size-4" />
                    Install
                  </Button>
                  <Button
                    onClick={() =>
                      void runAction("service-start", () =>
                        (window as any).api.serviceStart()
                      )
                    }
                    disabled={
                      busyAction !== null ||
                      !service.installed ||
                      service.running ||
                      service.actions?.start === false
                    }
                  >
                    <Activity className="size-4" />
                    Start
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void runAction("service-stop", () =>
                        (window as any).api.serviceStop()
                      )
                    }
                    disabled={
                      busyAction !== null ||
                      !service.running ||
                      service.canStop === false ||
                      service.actions?.stop === false
                    }
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      void runAction("service-uninstall", () =>
                        (window as any).api.serviceUninstall()
                      )
                    }
                    disabled={
                      busyAction !== null ||
                      !service.installed ||
                      service.actions?.uninstall === false
                    }
                  >
                    <Trash2 className="size-4" />
                    Uninstall
                  </Button>
                </div>
              ) : null}

              <div className="details-list">
                <DetailRow label="Platform" value={platformLabel} />
                <DetailRow
                  label="Mode"
                  value={service.kind || "manual"}
                  tone={service.supported === false ? "muted" : "ok"}
                />
                <DetailRow
                  label="Installed"
                  value={service.installed ? "Yes" : "No"}
                  tone={service.installed ? "ok" : service.supported === false ? "muted" : "warn"}
                />
                <DetailRow
                  label="Running"
                  value={
                    service.supported === false
                      ? "Managed externally"
                      : service.running
                        ? "Yes"
                        : "No"
                  }
                  tone={
                    service.supported === false ? "muted" : service.running ? "ok" : "warn"
                  }
                />
                <DetailRow label="Status" value={service.status} />
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card status-panel">
            <CardHeader>
              <div className="panel-header">
                <span className="panel-header__icon">
                  <Zap className="size-4" />
                </span>
                <div>
                  <CardTitle>Setup checklist</CardTitle>
                  <CardDescription>
                    The fastest way to see what is still missing on this machine.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="status-panel__content status-panel__content--spaced">
              <div className="checklist">
                <ChecklistItem
                  label="Server configured"
                  complete={Boolean(runtimeState.serverUrl || runtime.serverUrl)}
                  description="The desktop console knows which backend this machine should reach."
                />
                <ChecklistItem
                  label="Shared session stored"
                  complete={sessionState !== "missing"}
                  description="At least one reusable credential source exists for the runtime."
                />
                <ChecklistItem
                  label="Runtime linked"
                  complete={runtime.connected}
                  description="The live Hermes process is currently talking to the backend."
                />
                <ChecklistItem
                  label="Background mode ready"
                  complete={service.supported === false || (service.installed && service.running)}
                  description={
                    service.supported === false
                      ? "This platform currently relies on the manual runtime instead of a managed daemon."
                      : "Background mode is installed and running independently from the UI."
                  }
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="surface-card logs-card">
          <CardHeader>
            <div className="panel-header">
              <span className="panel-header__icon">
                <TerminalSquare className="size-4" />
              </span>
              <div>
                <CardTitle>Logs</CardTitle>
                <CardDescription>
                  Runtime and service output streamed from the local Hermes log.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showLogs ? (
              <LogsPanel />
            ) : (
              <div className="logs-placeholder">
                <p>
                  Logs stay collapsed by default so the dashboard remains easier to
                  scan.
                </p>
                <Button variant="outline" onClick={() => setShowLogs(true)}>
                  <TerminalSquare className="size-4" />
                  Show live logs
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default App;
