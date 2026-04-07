import React, { useEffect, useState } from "react";

const LogsPanel: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    async function load() {
      setLoading(true);
      try {
        if ((window as any).api && (window as any).api.readLogs) {
          const res = await (window as any).api.readLogs(500);
          if (res && res.ok) setLines(res.lines || []);
        }
        if ((window as any).api && (window as any).api.onLogsUpdated) {
          unsub = (window as any).api.onLogsUpdated((payload: string[]) => {
            setLines(payload || []);
          });
        }
      } catch (_error) {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <div className="logs-panel">
      {loading ? <div className="logs-panel__empty">Loading logs...</div> : null}
      {!loading && lines.length === 0 ? (
        <div className="logs-panel__empty">No logs yet</div>
      ) : null}
      {!loading &&
        lines.map((line, index) => {
          const tone = /\[ERROR\]/.test(line)
            ? "error"
            : /\[WARN\]/.test(line)
              ? "warn"
              : /\[INFO\]/.test(line)
                ? "info"
                : "neutral";

          return (
            <div
              key={`${index}-${line}`}
              className={`logs-panel__line logs-panel__line--${tone}`}
            >
              {line}
            </div>
          );
        })}
    </div>
  );
};

export default LogsPanel;
