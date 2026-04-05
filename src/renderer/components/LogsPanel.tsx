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
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <div
      className="logs-panel"
      style={{
        maxHeight: 360,
        overflow: "auto",
        background: "#111",
        color: "#eee",
        padding: 12,
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {loading && <div>Loading logs...</div>}
      {!loading && lines.length === 0 && <div>No logs yet</div>}
      {!loading && lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

export default LogsPanel;
