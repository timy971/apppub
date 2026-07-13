import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";

export const Route = createFileRoute("/test")({
  component: TestRoute,
});

function TestRoute() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0f" }}>
      <div style={{ width: 720, padding: 24, color: "#fff" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Route de test</h1>
        <p style={{ marginBottom: 12, color: "#9ca3af" }}>
          Page de test isolée — aucun service ni store importé.
        </p>
        <input
          ref={inputRef}
          autoFocus
          placeholder="Tapez quelque chose…"
          aria-label="test-input"
          style={{
            width: "100%",
            height: 44,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 12,
            fontSize: 16,
            background: "#0f1724",
            color: "#fff",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => navigate({ to: "/" })}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              background: "#2563eb",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
