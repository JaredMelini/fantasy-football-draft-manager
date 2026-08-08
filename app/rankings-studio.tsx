"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  applyRankingImport,
  buildRankingImport,
  guessRankingColumnMap,
  parseDelimitedRankings,
  tableFromRows,
} from "@/lib/import/rankings";
import type {
  RankingColumnMap,
  RankingField,
  RankingTable,
} from "@/lib/import/rankings";
import type { Player } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RankingsStudioProps {
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  onReset: () => void;
}

const mappingFields: Array<{ field: RankingField; label: string; required?: boolean }> = [
  { field: "player", label: "Player name", required: true },
  { field: "rank", label: "Rank", required: true },
  { field: "team", label: "NFL team" },
  { field: "position", label: "Position" },
  { field: "tier", label: "Tier" },
  { field: "adp", label: "ADP" },
  { field: "notes", label: "Notes" },
  { field: "externalId", label: "External ID" },
];

export function RankingsStudio({
  players,
  onPlayersChange,
  onReset,
}: RankingsStudioProps) {
  const [search, setSearch] = useState("");
  const [table, setTable] = useState<RankingTable | null>(null);
  const [columnMap, setColumnMap] = useState<RankingColumnMap>({});
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [importApplied, setImportApplied] = useState(false);

  const preview = useMemo(
    () => (table ? buildRankingImport(table, players, columnMap) : null),
    [columnMap, players, table],
  );
  const visiblePlayers = [...players]
    .filter((player) =>
      `${player.name} ${player.nflTeam} ${player.positions.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.userRank - b.userRank);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError("");
    setImportApplied(false);
    try {
      let parsed: RankingTable;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser");
        const rows = await readSheet(file);
        parsed = tableFromRows(rows);
      } else {
        parsed = parseDelimitedRankings(await file.text());
      }
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        throw new Error("The selected file does not contain a header and ranking rows.");
      }
      setTable(parsed);
      setColumnMap(guessRankingColumnMap(parsed.headers));
      setFileName(file.name);
    } catch (error) {
      setTable(null);
      setFileName("");
      setFileError(error instanceof Error ? error.message : "Unable to read that file.");
    } finally {
      event.target.value = "";
    }
  }

  function updateColumn(field: RankingField, value: string) {
    setColumnMap((current) => ({
      ...current,
      [field]: value === "" ? undefined : Number(value),
    }));
    setImportApplied(false);
  }

  function applyImport() {
    if (!preview || preview.errors.length > 0 || preview.updates.length === 0) return;
    onPlayersChange(applyRankingImport(players, preview.updates));
    setImportApplied(true);
  }

  function updatePlayer(playerId: string, changes: Partial<Player>) {
    onPlayersChange(
      players.map((player) =>
        player.id === playerId ? { ...player, ...changes } : player,
      ),
    );
  }

  return (
    <section className="tool-page rankings-page">
      <div className="tool-hero">
        <div>
          <p className="eyebrow">Rankings Studio</p>
          <h1>Your board, not Yahoo&apos;s.</h1>
          <p>
            Import a spreadsheet, review every match, then edit ranks, tiers,
            ADP, and notes without losing your original player pool.
          </p>
        </div>
        <div className="hero-stat-grid">
          <div><strong>{players.length}</strong><span>players</span></div>
          <div><strong>{new Set(players.map((player) => player.tier)).size}</strong><span>tiers</span></div>
          <div><strong>{players.filter((player) => player.notes).length}</strong><span>notes</span></div>
        </div>
      </div>

      <div className="rankings-layout">
        <aside className="import-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Local import</p><h2>Bring your rankings</h2></div>
            <span className="local-badge">Stays in browser</span>
          </div>
          <p className="panel-copy">
            CSV, TSV, and XLSX files are read locally. Nothing is sent to Yahoo
            or uploaded to a server.
          </p>
          <label className="file-drop">
            <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={handleFile} />
            <span className="file-icon">↑</span>
            <strong>{fileName || "Choose ranking file"}</strong>
            <small>CSV, TSV, or XLSX · first worksheet</small>
          </label>
          {fileError && <p className="form-error">{fileError}</p>}

          {table && (
            <div className="mapping-area">
              <div className="section-label">Column mapping</div>
              {mappingFields.map(({ field, label, required }) => (
                <label className="mapping-row" key={field}>
                  <span>{label}{required ? " *" : ""}</span>
                  <select
                    value={columnMap[field] ?? ""}
                    onChange={(event) => updateColumn(field, event.target.value)}
                  >
                    <option value="">Not mapped</option>
                    {table.headers.map((header, index) => (
                      <option value={index} key={`${header}-${index}`}>{header || `Column ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}

              {preview && (
                <div className="import-summary">
                  <div><strong>{preview.updates.length}</strong><span>matched</span></div>
                  <div><strong>{preview.unmatched.length}</strong><span>unmatched</span></div>
                  <div><strong>{preview.duplicates.length}</strong><span>duplicates</span></div>
                  <div><strong>{preview.errors.length}</strong><span>errors</span></div>
                </div>
              )}
              {preview?.errors.map((error) => <p className="form-error compact" key={error}>{error}</p>)}
              {preview && preview.unmatched.length > 0 && (
                <p className="import-detail"><strong>Review unmatched:</strong> {preview.unmatched.slice(0, 4).join(", ")}{preview.unmatched.length > 4 ? "…" : ""}</p>
              )}
              <Button
                className="w-full"
                disabled={!preview || preview.errors.length > 0 || preview.updates.length === 0}
                onClick={applyImport}
              >
                {importApplied ? "Import applied" : `Apply ${preview?.updates.length ?? 0} matched rows`}
              </Button>
            </div>
          )}
        </aside>

        <section className="ranking-editor panel">
          <div className="ranking-toolbar">
            <div>
              <p className="eyebrow">Editable board</p>
              <h2>Personal rankings</h2>
            </div>
            <label className="search-field">
              <span className="sr-only">Search players</span>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player, team, position" />
            </label>
            <Button variant="outline" size="sm" onClick={onReset}>Restore demo rankings</Button>
          </div>
          <div className="table-wrap ranking-table-wrap">
            <table className="ranking-table">
              <thead><tr><th>Rank</th><th>Player</th><th>Tier</th><th>ADP</th><th>Personal note</th></tr></thead>
              <tbody>
                {visiblePlayers.map((player) => (
                  <tr key={player.id}>
                    <td><input className="number-editor rank-editor" type="number" min="1" value={player.userRank} aria-label={`${player.name} rank`} onChange={(event) => updatePlayer(player.id, { userRank: Math.max(1, Number(event.target.value)) })} /></td>
                    <td><div className="editable-player"><span className={`position ${player.positions[0].toLowerCase()}`}>{player.positions[0]}</span><span><strong>{player.name}</strong><small>{player.nflTeam} · Bye {player.byeWeek}</small></span></div></td>
                    <td><input className="number-editor" type="number" min="1" value={player.tier} aria-label={`${player.name} tier`} onChange={(event) => updatePlayer(player.id, { tier: Math.max(1, Number(event.target.value)) })} /></td>
                    <td><input className="number-editor adp-editor" type="number" min="1" step="0.1" value={player.adp} aria-label={`${player.name} ADP`} onChange={(event) => updatePlayer(player.id, { adp: Math.max(1, Number(event.target.value)) })} /></td>
                    <td><input className="note-editor" value={player.notes ?? ""} aria-label={`${player.name} note`} placeholder="Add your take…" onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
