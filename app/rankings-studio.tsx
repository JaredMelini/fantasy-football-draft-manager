"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  applyRankingImport,
  buildRankingImport,
  guessRankingColumnMap,
  parseDelimitedRankings,
  rankingUpdateFromReview,
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

const ignoredReviewValue = "__ignored__";

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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, string>>({});

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
  const reviewState = useMemo(() => {
    const automaticIds = new Set(
      preview?.updates.map((update) => update.playerId) ?? [],
    );
    const selectedByPlayer = new Map<string, string[]>();
    for (const row of preview?.reviewRows ?? []) {
      const decision = reviewDecisions[row.id];
      if (!decision || decision === ignoredReviewValue) continue;
      selectedByPlayer.set(decision, [
        ...(selectedByPlayer.get(decision) ?? []),
        row.id,
      ]);
    }
    const conflictRows = new Set<string>();
    for (const [playerId, rowIds] of selectedByPlayer) {
      if (automaticIds.has(playerId) || rowIds.length > 1) {
        rowIds.forEach((rowId) => conflictRows.add(rowId));
      }
    }
    const manualUpdates = (preview?.reviewRows ?? []).flatMap((row) => {
      const playerId = reviewDecisions[row.id];
      if (
        !playerId ||
        playerId === ignoredReviewValue ||
        conflictRows.has(row.id)
      ) {
        return [];
      }
      const player = players.find((candidate) => candidate.id === playerId);
      return player ? [rankingUpdateFromReview(row, player)] : [];
    });
    const unresolvedRows = (preview?.reviewRows ?? []).filter(
      (row) => !reviewDecisions[row.id],
    );
    return {
      automaticIds,
      selectedByPlayer,
      conflictRows,
      manualUpdates,
      unresolvedRows,
      updates: [...(preview?.updates ?? []), ...manualUpdates],
    };
  }, [players, preview, reviewDecisions]);

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
      setReviewDecisions({});
      setReviewOpen(true);
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
    setReviewDecisions({});
  }

  function applyImport() {
    if (
      !preview ||
      preview.errors.length > 0 ||
      reviewState.unresolvedRows.length > 0 ||
      reviewState.conflictRows.size > 0 ||
      reviewState.updates.length === 0
    ) return;
    onPlayersChange(applyRankingImport(players, reviewState.updates));
    setImportApplied(true);
  }

  function setReviewDecision(rowId: string, value: string) {
    setReviewDecisions((current) => ({ ...current, [rowId]: value }));
    setImportApplied(false);
  }

  function ignoreUnresolvedRows() {
    if (!preview) return;
    setReviewDecisions((current) => ({
      ...current,
      ...Object.fromEntries(
        preview.reviewRows
          .filter((row) => !current[row.id])
          .map((row) => [row.id, ignoredReviewValue]),
      ),
    }));
    setImportApplied(false);
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
                  <div><strong>{reviewState.updates.length}</strong><span>ready</span></div>
                  <div><strong>{preview.unmatched.length}</strong><span>unmatched</span></div>
                  <div><strong>{preview.duplicates.length}</strong><span>duplicates</span></div>
                  <div><strong>{preview.errors.length}</strong><span>errors</span></div>
                </div>
              )}
              {preview?.errors.map((error) => <p className="form-error compact" key={error}>{error}</p>)}
              {preview && preview.reviewRows.length > 0 && (
                <div className="import-review">
                  <div className="import-review-heading">
                    <div>
                      <strong>Match review</strong>
                      <small>{reviewState.unresolvedRows.length} of {preview.reviewRows.length} still need a decision</small>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setReviewOpen((current) => !current)}>
                      {reviewOpen ? "Hide review" : `Review ${preview.reviewRows.length} rows`}
                    </Button>
                  </div>

                  {reviewOpen && (
                    <div className="review-row-list">
                      {preview.reviewRows.map((row) => {
                        const decision = reviewDecisions[row.id];
                        const selectedPlayer = players.find(
                          (player) => player.id === decision,
                        );
                        const ignored = decision === ignoredReviewValue;
                        const conflict = reviewState.conflictRows.has(row.id);
                        const playerIsUsedElsewhere = (playerId: string) =>
                          reviewState.automaticIds.has(playerId) ||
                          (reviewState.selectedByPlayer.get(playerId) ?? []).some(
                            (rowId) => rowId !== row.id,
                          );
                        return (
                          <article className={`review-row ${ignored ? "ignored" : ""} ${conflict ? "conflict" : ""}`} key={row.id}>
                            <header>
                              <span className={`review-status ${row.status}`}>{row.status}</span>
                              <small>CSV row {row.rowNumber} · rank {row.rank}{row.tier ? ` · tier ${row.tier}` : ""}</small>
                            </header>
                            <strong>{row.sourceName}</strong>
                            <p>{[row.sourceTeam, row.sourcePosition].filter(Boolean).join(" · ") || "No team or position supplied"}</p>

                            <div className="suggested-matches">
                              <span>Suggested matches</span>
                              <div>
                                {row.suggestions.map((suggestion) => (
                                  <button
                                    disabled={playerIsUsedElsewhere(suggestion.playerId)}
                                    key={suggestion.playerId}
                                    onClick={() => setReviewDecision(row.id, suggestion.playerId)}
                                    type="button"
                                  >
                                    <strong>{suggestion.playerName}</strong>
                                    <small>{suggestion.team} · {suggestion.position} · {suggestion.score}%</small>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <label className="manual-match-row">
                              <span>Manual player match</span>
                              <select
                                aria-label={`Match ${row.sourceName} to a player`}
                                value={ignored ? "" : decision ?? ""}
                                onChange={(event) => setReviewDecision(row.id, event.target.value)}
                              >
                                <option value="">Choose player…</option>
                                {[...players]
                                  .sort((a, b) => a.userRank - b.userRank)
                                  .map((player) => (
                                    <option
                                      disabled={playerIsUsedElsewhere(player.id)}
                                      key={player.id}
                                      value={player.id}
                                    >
                                      {player.name} — {player.nflTeam} · {player.positions.join("/")}
                                    </option>
                                  ))}
                              </select>
                            </label>

                            <div className="review-row-footer">
                              <span className={conflict ? "review-conflict" : "review-resolution"}>
                                {conflict
                                  ? "That player is already assigned to another row."
                                  : ignored
                                    ? "This row will be ignored."
                                    : selectedPlayer
                                      ? `Will import as ${selectedPlayer.name}.`
                                      : "Choose a match or ignore this row."}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReviewDecision(row.id, ignored ? "" : ignoredReviewValue)}
                              >
                                {ignored ? "Undo ignore" : "Ignore"}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                      {reviewState.unresolvedRows.length > 0 && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={ignoreUnresolvedRows}>
                          Ignore all unresolved rows
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                disabled={
                  !preview ||
                  preview.errors.length > 0 ||
                  reviewState.unresolvedRows.length > 0 ||
                  reviewState.conflictRows.size > 0 ||
                  reviewState.updates.length === 0
                }
                onClick={applyImport}
              >
                {importApplied
                  ? "Import applied"
                  : reviewState.unresolvedRows.length > 0
                    ? `Review ${reviewState.unresolvedRows.length} remaining rows`
                    : `Apply ${reviewState.updates.length} resolved rows`}
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
