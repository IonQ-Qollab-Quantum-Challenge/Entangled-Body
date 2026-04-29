"use client";

type CollapseControllerProps = {
  mode: "superposition" | "collapse";
  collapseProgress: number;
  stableProgress: number;
  modelStable: boolean;
  loading: boolean;
  error: string | null;
};

export function CollapseController({ mode, collapseProgress, stableProgress, modelStable, loading, error }: CollapseControllerProps) {
  const progress = mode === "collapse" ? collapseProgress : stableProgress;
  const status = loading ? "measuring" : modelStable ? "stabilizing" : "ready";

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 34,
        transform: "translateX(-50%)",
        display: "grid",
        gap: 16,
        width: 560,
        maxWidth: "calc(100vw - 48px)",
        padding: 28,
        border: "2px solid rgba(255,255,255,0.16)",
        background: "rgba(7,9,13,0.72)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 800 }}>
        <span>{mode}</span>
        <span>{status}</span>
      </div>
      <div style={{ height: 16, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: "100%",
            background: "#87e6ff",
            transition: "width 120ms linear",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(245,247,251,0.72)", fontSize: 21 }}>
        <span>{mode === "collapse" ? "collapse" : "stability"}</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      {error ? <div style={{ color: "#ffb4a8", fontSize: 19 }}>{error}</div> : null}
    </div>
  );
}
