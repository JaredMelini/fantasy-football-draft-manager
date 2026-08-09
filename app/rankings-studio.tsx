"use client";

import { Fragment, useDeferredValue, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  applyRankingImport,
  buildRankingImport,
  buildUdkRankingImport,
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
import type { Player, PlayerPosition } from "@/lib/domain/types";
import {
  getMarketAdp,
  getMarketAdpSource,
  getPositionRank,
  getPositionTier,
} from "@/lib/domain/rankings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YahooAdpImport } from "./yahoo-adp-import";

interface RankingsStudioProps {
  players: Player[];
  teamCount: number;
  onPlayersChange: (players: Player[]) => void;
  onReset: () => void;
  onRunBusyTask: (
    label: string,
    task: () => void | Promise<void>,
  ) => Promise<void>;
}

const mappingFields: Array<{ field: RankingField; label: string; required?: boolean }> = [
  { field: "player", label: "Player name", required: true },
  { field: "rank", label: "Rank", required: true },
  { field: "team", label: "NFL team" },
  { field: "position", label: "Position" },
  { field: "tier", label: "Tier" },
  { field: "adp", label: "ADP" },
  { field: "points", label: "Projected points" },
  { field: "risk", label: "Risk" },
  { field: "upside", label: "Upside" },
  { field: "notes", label: "Notes" },
  { field: "externalId", label: "External ID" },
];

const ignoredReviewValue = "__ignored__";
const positions: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];
type RankingSortKey =
  | "rank"
  | "player"
  | "tier"
  | "risk"
  | "upside"
  | "points"
  | "adp"
  | "notes";
type SortDirection = "ascending" | "descending";

export function RankingsStudio({
  players,
  teamCount,
  onPlayersChange,
  onReset,
  onRunBusyTask,
}: RankingsStudioProps) {
  const [search, setSearch] = useState("");
  const [table, setTable] = useState<RankingTable | null>(null);
  const [columnMap, setColumnMap] = useState<RankingColumnMap>({});
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [importApplied, setImportApplied] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<"overall" | "position">("overall");
  const [udkTables, setUdkTables] = useState<RankingTable[]>([]);
  const [udkFileNames, setUdkFileNames] = useState<string[]>([]);
  const [activePosition, setActivePosition] = useState<PlayerPosition>("RB");
  const [sortKey, setSortKey] = useState<RankingSortKey>("rank");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("ascending");
  const deferredSearch = useDeferredValue(search);

  const preview = useMemo(
    () =>
      importMode === "position"
        ? udkTables.length > 0
          ? buildUdkRankingImport(udkTables, players)
          : null
        : table
          ? buildRankingImport(table, players, columnMap)
          : null,
    [columnMap, importMode, players, table, udkTables],
  );
  const visiblePlayers = useMemo(() => {
    const direction = sortDirection === "ascending" ? 1 : -1;
    const numericValue = (player: Player): number | undefined => {
      if (sortKey === "rank") {
        return getPositionRank(player, players, activePosition);
      }
      if (sortKey === "tier") return getPositionTier(player, activePosition);
      if (sortKey === "risk") return player.risk;
      if (sortKey === "upside") return player.upside;
      if (sortKey === "points") return player.sourceProjectedPoints;
      if (sortKey === "adp") return getMarketAdp(player, teamCount);
      return undefined;
    };
    const textValue = (player: Player): string =>
      sortKey === "notes" ? player.notes ?? "" : player.name;

    return [...players]
      .filter((player) => player.positions.includes(activePosition))
      .filter((player) =>
        `${player.name} ${player.nflTeam} ${player.positions.join(" ")}`
          .toLowerCase()
          .includes(deferredSearch.toLowerCase()),
      )
      .sort((a, b) => {
        if (sortKey === "player" || sortKey === "notes") {
          return textValue(a).localeCompare(textValue(b)) * direction;
        }
        const left = numericValue(a);
        const right = numericValue(b);
        if (left === undefined && right === undefined) {
          return a.name.localeCompare(b.name);
        }
        if (left === undefined) return 1;
        if (right === undefined) return -1;
        return (left - right) * direction || a.name.localeCompare(b.name);
      });
  }, [activePosition, deferredSearch, players, sortDirection, sortKey, teamCount]);
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
      return player
        ? [
            rankingUpdateFromReview(row, player, {
              mode: importMode,
              source:
                importMode === "position"
                  ? "Fantasy Footballers UDK"
                  : undefined,
            }),
          ]
        : [];
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
  }, [importMode, players, preview, reviewDecisions]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const input = event.currentTarget;
    await onRunBusyTask("Reading and matching rankings", async () => {
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
          throw new Error(
            "The selected file does not contain a header and ranking rows.",
          );
        }
        setTable(parsed);
        setImportMode("overall");
        setColumnMap(guessRankingColumnMap(parsed.headers));
        setFileName(file.name);
        setReviewDecisions({});
        setReviewOpen(true);
      } catch (error) {
        setTable(null);
        setFileName("");
        setFileError(
          error instanceof Error ? error.message : "Unable to read that file.",
        );
      } finally {
        input.value = "";
      }
    });
  }

  async function handleUdkFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const input = event.currentTarget;
    await onRunBusyTask("Reading and matching UDK rankings", async () => {
      setFileError("");
      setImportApplied(false);
      try {
        const parsed = await Promise.all(
          files.map(async (file) => parseDelimitedRankings(await file.text())),
        );
        if (
          parsed.some(
            (item) => item.headers.length === 0 || item.rows.length === 0,
          )
        ) {
          throw new Error("Every UDK CSV must contain a header and ranking rows.");
        }
        setUdkTables(parsed);
        setUdkFileNames(files.map((file) => file.name));
        setImportMode("position");
        setReviewDecisions({});
        setReviewOpen(true);
      } catch (error) {
        setUdkTables([]);
        setUdkFileNames([]);
        setFileError(
          error instanceof Error ? error.message : "Unable to read those files.",
        );
      } finally {
        input.value = "";
      }
    });
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
    const readyCount =
      reviewState.updates.length + (preview?.newPlayers.length ?? 0);
    if (
      !preview ||
      preview.errors.length > 0 ||
      reviewState.unresolvedRows.length > 0 ||
      reviewState.conflictRows.size > 0 ||
      readyCount === 0
    ) return;
    void onRunBusyTask("Applying rankings", () => {
      onPlayersChange(
        applyRankingImport(players, reviewState.updates, preview.newPlayers),
      );
      setImportApplied(true);
    });
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

  function updatePositionRanking(
    player: Player,
    field: "rank" | "tier",
    value: number,
  ) {
    updatePlayer(
      player.id,
      field === "rank"
        ? {
            positionRanks: {
              ...player.positionRanks,
              [activePosition]: Math.max(1, value),
            },
          }
        : {
            positionTiers: {
              ...player.positionTiers,
              [activePosition]: Math.max(1, value),
            },
          },
    );
  }

  function toggleSort(key: RankingSortKey) {
    if (sortKey === key) {
      setSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }
    setSortKey(key);
    setSortDirection(
      key === "risk" || key === "upside" || key === "points"
        ? "descending"
        : "ascending",
    );
  }

  function sortableHeader(key: RankingSortKey, label: string) {
    const active = sortKey === key;
    return (
      <th aria-sort={active ? sortDirection : "none"}>
        <button
          className={`sortable-header ${active ? "active" : ""}`}
          onClick={() => toggleSort(key)}
          type="button"
        >
          <span>{label}</span>
          <span aria-hidden="true" className="sort-indicator">
            {active ? (sortDirection === "ascending" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <section className="tool-page rankings-page">
      <div className="tool-hero">
        <div>
          <p className="eyebrow">Rankings Studio</p>
          <h1>Your board, not Yahoo&apos;s.</h1>
          <p>
            Import position rankings, review every match, then edit each
            position&apos;s ranks and tiers independently.
          </p>
        </div>
        <div className="hero-stat-grid">
          <div><strong>{players.length}</strong><span>players</span></div>
          <div><strong>{positions.filter((item) => players.some((player) => player.positionRanks?.[item])).length}</strong><span>positions imported</span></div>
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
          <YahooAdpImport
            players={players}
            onPlayersChange={onPlayersChange}
            onRunBusyTask={onRunBusyTask}
          />
          <div className="udk-import-card">
            <div>
              <strong>Fantasy Footballers UDK</strong>
              <span>Position ranks + tiers + points + risk + upside</span>
            </div>
            <p>
              While logged in, open each position, choose More → Download CSV,
              then select all of the exports here at once. FLEX is not needed.
              Points are imported for offensive players and are optional for K
              and D/ST because those exports do not include them.
            </p>
            <a
              className="udk-link"
              href="https://www.thefantasyfootballers.com/2026-ultimate-draft-kit/udk-position-rankings/?position=QB"
              target="_blank"
              rel="noreferrer"
            >
              Open UDK rankings ↗
            </a>
            <label className="file-drop compact-drop">
              <input type="file" multiple accept=".csv" onChange={handleUdkFiles} />
              <strong>
                {udkFileNames.length > 0
                  ? `${udkFileNames.length} UDK files selected`
                  : "Select UDK CSV exports"}
              </strong>
              <small>QB, RB, WR, TE, D/ST, and K · processed together</small>
            </label>
          </div>
          <div className="section-label">Or import another ranking file</div>
          <label className="file-drop">
            <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={handleFile} />
            <span className="file-icon">↑</span>
            <strong>{fileName || "Choose ranking file"}</strong>
            <small>CSV, TSV, or XLSX · first worksheet</small>
          </label>
          {fileError && <p className="form-error">{fileError}</p>}

          {preview && (
            <div className="mapping-area">
              {importMode === "overall" && table && (
                <><div className="section-label">Column mapping</div>
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
              ))}</>
              )}

              {preview && (
                <div className="import-summary">
                  <div><strong>{reviewState.updates.length + preview.newPlayers.length}</strong><span>ready</span></div>
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
                              <small>CSV row {row.rowNumber} · rank {row.rank}{row.tier ? ` · tier ${row.tier}` : ""}{row.sourceProjectedPoints !== undefined ? ` · ${row.sourceProjectedPoints} points` : ""}</small>
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
                                  .sort((a, b) => a.name.localeCompare(b.name))
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
                  reviewState.updates.length + preview.newPlayers.length === 0
                }
                onClick={applyImport}
              >
                {importApplied
                  ? "Import applied"
                  : reviewState.unresolvedRows.length > 0
                    ? `Review ${reviewState.unresolvedRows.length} remaining rows`
                    : `Apply ${reviewState.updates.length + preview.newPlayers.length} resolved rows`}
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
            <Button variant="outline" size="sm" disabled={players.length === 0} onClick={() => void onRunBusyTask("Clearing rankings and draft picks", onReset)}>Clear all rankings</Button>
          </div>
          <div className="position-tabs" aria-label="Ranking position">
            {positions.map((item) => (
              <button
                className={activePosition === item ? "active" : ""}
                key={item}
                onClick={() => setActivePosition(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="table-wrap ranking-table-wrap">
            <table className="ranking-table">
              <thead>
                <tr>
                  {sortableHeader("rank", `${activePosition} rank`)}
                  {sortableHeader("player", "Player")}
                  {sortableHeader("tier", "Tier")}
                  {sortableHeader("risk", "Risk")}
                  {sortableHeader("upside", "Upside")}
                  {sortableHeader("points", "UDK pts")}
                  {sortableHeader("adp", "Opponent ADP")}
                  {sortableHeader("notes", "Personal note")}
                </tr>
              </thead>
              <tbody>
                {visiblePlayers.map((player, index) => {
                  const tier = getPositionTier(player, activePosition);
                  const previousTier =
                    index > 0
                      ? getPositionTier(visiblePlayers[index - 1], activePosition)
                      : undefined;
                  const showTierDivider =
                    (sortKey === "rank" || sortKey === "tier") &&
                    tier !== previousTier;
                  return (
                  <Fragment key={player.id}>
                    {showTierDivider && (
                      <tr className={`tier-divider tier-color-${Math.min(tier, 8)}`}>
                        <td colSpan={8}>
                          <span>Tier {tier}</span>
                          <small>{activePosition} rankings</small>
                        </td>
                      </tr>
                    )}
                  <tr className={`ranking-player-row tier-color-${Math.min(tier, 8)}`}>
                    <td><input className="number-editor rank-editor" type="number" min="1" value={getPositionRank(player, players, activePosition)} aria-label={`${player.name} ${activePosition} rank`} onChange={(event) => updatePositionRanking(player, "rank", Number(event.target.value))} /></td>
                    <td><div className="editable-player"><span className={`position ${player.positions[0].toLowerCase()}`}>{player.positions[0]}</span><span><strong>{player.name}</strong><small>{player.nflTeam} · Bye {player.byeWeek}</small></span></div></td>
                    <td><div className="tier-editor"><span className={`tier-chip tier-color-${Math.min(tier, 8)}`}>T{tier}</span><input className="number-editor" type="number" min="1" value={tier} aria-label={`${player.name} ${activePosition} tier`} onChange={(event) => updatePositionRanking(player, "tier", Number(event.target.value))} /></div></td>
                    <td>{player.risk === undefined ? "—" : (player.risk * 10).toFixed(1)}</td>
                    <td>{player.upside === undefined ? "—" : (player.upside * 10).toFixed(1)}</td>
                    <td>{player.sourceProjectedPoints === undefined ? "—" : player.sourceProjectedPoints.toFixed(1)}</td>
                    <td>
                      <div className="adp-source-cell">
                        <strong>{getMarketAdp(player, teamCount).toFixed(1)}</strong>
                        <small>{getMarketAdpSource(player)}</small>
                        <label>
                          <span>Fallback</span>
                          <input className="number-editor adp-editor" type="number" min="1" step="0.1" value={player.adp} aria-label={`${player.name} fallback ADP`} onChange={(event) => updatePlayer(player.id, { adp: Math.max(1, Number(event.target.value)) })} />
                        </label>
                      </div>
                    </td>
                    <td><input className="note-editor" value={player.notes ?? ""} aria-label={`${player.name} note`} placeholder="Add your take…" onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} /></td>
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
