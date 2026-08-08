"use client";

import { useState } from "react";
import { replayDraftEvents } from "@/lib/domain/draft-session";
import {
  packageForExport,
  parseOfflinePackage,
} from "@/lib/offline-package";
import type { OfflineDraftPackage } from "@/lib/offline-package";

interface OfflineBridgeProps {
  state: OfflineDraftPackage;
  onImport: (state: OfflineDraftPackage) => void;
  onReset: () => void;
  onNavigate: (view: "draft" | "rankings" | "league") => void;
}

export function OfflineBridge({
  state,
  onImport,
  onReset,
  onNavigate,
}: OfflineBridgeProps) {
  const [packageText, setPackageText] = useState("");
  const [message, setMessage] = useState("");
  const picks = replayDraftEvents(state.events).picks;

  function exportPackage() {
    const exported = packageForExport(state);
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fantasy-draft-${state.league.id || "backup"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Portable backup downloaded.");
  }

  function importText(text: string) {
    try {
      const parsed = parseOfflinePackage(text);
      onImport(parsed);
      setPackageText("");
      setMessage(
        `Imported ${parsed.league.name}, ${parsed.players.length} players, and ${replayDraftEvents(parsed.events).picks.length} picks.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import that package.");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    importText(await file.text());
  }

  return (
    <section className="tool-page offline-page">
      <div className="tool-hero offline-hero">
        <div>
          <p className="eyebrow">Offline Bridge</p>
          <h1>Nearly the full draft assistant—without Yahoo access.</h1>
          <p>
            Configure the league manually, import rankings, capture picks in
            order, and keep a portable local backup. OAuth can later replace
            the manual inputs without changing the recommendation engine.
          </p>
        </div>
        <div className="offline-readiness panel">
          <div><span className="status-dot ready" /><strong>Settings</strong><small>Manual editor ready</small></div>
          <div><span className="status-dot ready" /><strong>Rankings</strong><small>CSV/XLSX ready</small></div>
          <div><span className="status-dot ready" /><strong>Live picks</strong><small>Quick Capture ready</small></div>
          <div><span className="status-dot" /><strong>Yahoo sync</strong><small>Awaiting OAuth</small></div>
        </div>
      </div>

      <div className="offline-path-grid">
        <button className="offline-path-card panel" onClick={() => onNavigate("league")}>
          <span>01</span><strong>Enter league rules</strong><p>Set team count, roster positions, and every scoring modifier.</p><small>Open League setup →</small>
        </button>
        <button className="offline-path-card panel" onClick={() => onNavigate("rankings")}>
          <span>02</span><strong>Import your board</strong><p>Use CSV, TSV, or XLSX rankings and edit every matched player.</p><small>Open Rankings →</small>
        </button>
        <button className="offline-path-card panel" onClick={() => onNavigate("draft")}>
          <span>03</span><strong>Run companion mode</strong><p>Paste copied pick names in order or log selections with one click.</p><small>Open Draft room →</small>
        </button>
      </div>

      <div className="offline-workspace">
        <section className="backup-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Portable league package</p><h2>Backup and restore</h2></div>
            <span className="local-badge">Device local</span>
          </div>
          <p className="panel-copy">
            Your current state saves automatically in this browser. Download a
            JSON backup to move it to another device or protect the draft log.
          </p>
          <div className="package-summary">
            <div><span>League</span><strong>{state.league.name}</strong></div>
            <div><span>Players</span><strong>{state.players.length}</strong></div>
            <div><span>Active picks</span><strong>{picks.length}</strong></div>
            <div><span>Event records</span><strong>{state.events.length}</strong></div>
          </div>
          <div className="backup-actions">
            <button className="primary-button compact-button" onClick={exportPackage}>Download backup</button>
            <label className="secondary-button file-button">Import backup<input type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} /></label>
            <button className="ghost-button reset-link" onClick={onReset}>Restore demo data</button>
          </div>
          {message && <p className="bridge-message" aria-live="polite">{message}</p>}
        </section>

        <section className="paste-package-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Text transfer</p><h2>Paste a backup</h2></div>
          </div>
          <textarea value={packageText} onChange={(event) => setPackageText(event.target.value)} placeholder='Paste an exported package beginning with { "version": 1…' aria-label="Offline package JSON" />
          <button className="secondary-button" disabled={!packageText.trim()} onClick={() => importText(packageText)}>Validate and import</button>
        </section>
      </div>

      <section className="compliance-note panel">
        <span className="compliance-mark">✓</span>
        <div>
          <p className="eyebrow">Safe boundary</p>
          <h2>No scraping, credential sharing, or automated Yahoo clicks.</h2>
          <p>
            The bridge only processes information you type, paste, or upload.
            This preserves the account-safe path while Yahoo reviews the
            read-only API application.
          </p>
        </div>
      </section>
    </section>
  );
}
