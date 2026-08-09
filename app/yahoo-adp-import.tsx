"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import type { Player } from "@/lib/domain/types";
import {
  applyYahooAdpImport,
  buildYahooAdpImport,
  clearYahooAdp,
  parseYahooAdpText,
  yahooAdpUpdateFromReview,
  YAHOO_ADP_BOOKMARKLET,
} from "@/lib/import/yahoo-adp";
import { Button } from "@/components/ui/button";

interface YahooAdpImportProps {
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  onRunBusyTask: (
    label: string,
    task: () => void | Promise<void>,
  ) => Promise<void>;
}

const ignoredValue = "__ignored__";

export function YahooAdpImport({
  players,
  onPlayersChange,
  onRunBusyTask,
}: YahooAdpImportProps) {
  const [tables, setTables] = useState<ReturnType<typeof parseYahooAdpText>[]>([]);
  const [pasteValue, setPasteValue] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const preview = useMemo(
    () => (tables.length > 0 ? buildYahooAdpImport(tables, players) : null),
    [players, tables],
  );
  const resolved = useMemo(() => {
    const automaticallyUsed = new Set(
      preview?.updates.map((update) => update.playerId) ?? [],
    );
    const manuallyUsed = new Map<string, string[]>();
    for (const row of preview?.reviewRows ?? []) {
      const playerId = decisions[row.id];
      if (!playerId || playerId === ignoredValue) continue;
      manuallyUsed.set(playerId, [...(manuallyUsed.get(playerId) ?? []), row.id]);
    }
    const conflicts = new Set<string>();
    for (const [playerId, rowIds] of manuallyUsed) {
      if (automaticallyUsed.has(playerId) || rowIds.length > 1) {
        rowIds.forEach((rowId) => conflicts.add(rowId));
      }
    }
    const manualUpdates = (preview?.reviewRows ?? []).flatMap((row) => {
      const playerId = decisions[row.id];
      if (!playerId || playerId === ignoredValue || conflicts.has(row.id)) {
        return [];
      }
      const player = players.find((candidate) => candidate.id === playerId);
      return player ? [yahooAdpUpdateFromReview(row, player)] : [];
    });
    const unresolved = (preview?.reviewRows ?? []).filter(
      (row) => !decisions[row.id],
    );
    return {
      automaticallyUsed,
      manuallyUsed,
      conflicts,
      unresolved,
      updates: [...(preview?.updates ?? []), ...manualUpdates],
    };
  }, [decisions, players, preview]);
  const latestRefresh = players
    .map((player) => player.yahooAdpUpdatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const yahooPlayerCount = players.filter(
    (player) => player.yahooAdpRecent !== undefined || player.yahooAdpAll !== undefined,
  ).length;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const input = event.currentTarget;
    await onRunBusyTask("Reading Yahoo ADP files", async () => {
      setError("");
      setApplied(false);
      try {
        const parsed = await Promise.all(
          files.map(async (file) => parseYahooAdpText(await file.text())),
        );
        if (
          parsed.some(
            (table) => table.headers.length === 0 || table.rows.length === 0,
          )
        ) {
          throw new Error("Every Yahoo ADP file must contain headers and players.");
        }
        setTables(parsed);
        setFileNames(files.map((file) => file.name));
        setDecisions({});
        setReviewOpen(true);
      } catch (caught) {
        setTables([]);
        setFileNames([]);
        setError(
          caught instanceof Error ? caught.message : "Unable to read those files.",
        );
      } finally {
        input.value = "";
      }
    });
  }

  function previewPaste() {
    setError("");
    setApplied(false);
    const parsed = parseYahooAdpText(pasteValue);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setError("Paste the CSV or tab-separated output from the Yahoo exporter.");
      return;
    }
    setTables([parsed]);
    setFileNames([]);
    setDecisions({});
    setReviewOpen(true);
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(YAHOO_ADP_BOOKMARKLET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setError("Clipboard access was blocked. Try again from localhost in a secure browser tab.");
    }
  }

  function applyImport() {
    if (
      !preview ||
      preview.errors.length > 0 ||
      resolved.unresolved.length > 0 ||
      resolved.conflicts.size > 0 ||
      resolved.updates.length === 0
    ) {
      return;
    }
    void onRunBusyTask("Applying Yahoo ADP", () => {
      onPlayersChange(applyYahooAdpImport(players, resolved.updates));
      setApplied(true);
    });
  }

  function ignoreUnresolved() {
    if (!preview) return;
    setDecisions((current) => ({
      ...current,
      ...Object.fromEntries(
        preview.reviewRows
          .filter((row) => !current[row.id])
          .map((row) => [row.id, ignoredValue]),
      ),
    }));
  }

  return (
    <div className="yahoo-adp-card">
      <div className="yahoo-adp-heading">
        <div>
          <strong>Yahoo opponent ADP</strong>
          <span>
            {yahooPlayerCount > 0
              ? `${yahooPlayerCount} players · ${latestRefresh ? `refreshed ${latestRefresh.slice(0, 10)}` : "refresh date unavailable"}`
              : "Separate from your UDK board"}
          </span>
        </div>
        <span className={yahooPlayerCount > 0 ? "adp-status ready" : "adp-status"}>
          {yahooPlayerCount > 0 ? "Active" : "Not imported"}
        </span>
      </div>
      <p>
        Yahoo Last 7 Days ADP drives simulated opponents, with All Drafts ADP,
        UDK, and manual ADP used as fallbacks. Your ranks and tiers are never changed.
      </p>
      <ol className="yahoo-import-steps">
        <li>Copy the bookmarklet code and save it as a browser bookmark URL.</li>
        <li>Open Yahoo Draft Analysis, choose a position, then click the bookmark.</li>
        <li>Repeat for each position and select all downloaded CSVs below.</li>
      </ol>
      <div className="yahoo-adp-actions">
        <Button variant="outline" size="sm" onClick={() => void copyBookmarklet()}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? "Copied" : "Copy bookmarklet"}
        </Button>
        <a
          className="udk-link yahoo-link"
          href="https://football.fantasysports.yahoo.com/f1/595211/draftanalysis?pos=ALL"
          target="_blank"
          rel="noreferrer"
        >
          Open Yahoo ADP ↗
        </a>
      </div>
      <label className="file-drop compact-drop yahoo-drop">
        <input type="file" multiple accept=".csv,.tsv,.txt" onChange={handleFiles} />
        <Download aria-hidden="true" />
        <strong>
          {fileNames.length > 0
            ? `${fileNames.length} Yahoo ADP files selected`
            : "Select Yahoo ADP exports"}
        </strong>
        <small>QB, RB, WR, TE, K, and DEF can be applied together</small>
      </label>
      <details className="yahoo-paste-details">
        <summary>Paste exporter data instead</summary>
        <textarea
          aria-label="Paste Yahoo ADP CSV or TSV"
          value={pasteValue}
          onChange={(event) => setPasteValue(event.target.value)}
          placeholder="Player,Team,Position,All Drafts ADP,Last 7 Days ADP…"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!pasteValue.trim()}
          onClick={previewPaste}
        >
          Review pasted ADP
        </Button>
      </details>
      {error && <p className="form-error compact">{error}</p>}

      {preview && (
        <div className="yahoo-import-preview">
          <div className="import-summary yahoo-summary">
            <div><strong>{resolved.updates.length}</strong><span>ready</span></div>
            <div><strong>{resolved.unresolved.length}</strong><span>review</span></div>
            <div><strong>{preview.duplicates.length}</strong><span>duplicates</span></div>
            <div><strong>{preview.errors.length}</strong><span>errors</span></div>
          </div>
          {preview.errors.map((message) => (
            <p className="form-error compact" key={message}>{message}</p>
          ))}
          {preview.reviewRows.length > 0 && (
            <div className="import-review">
              <div className="import-review-heading">
                <div>
                  <strong>Yahoo match review</strong>
                  <small>{resolved.unresolved.length} rows still need a decision</small>
                </div>
                <Button variant="outline" size="sm" onClick={() => setReviewOpen((value) => !value)}>
                  {reviewOpen ? "Hide" : "Review"}
                </Button>
              </div>
              {reviewOpen && (
                <div className="review-row-list yahoo-review-list">
                  {preview.reviewRows.map((row) => {
                    const decision = decisions[row.id];
                    const ignored = decision === ignoredValue;
                    const conflict = resolved.conflicts.has(row.id);
                    const isUsed = (playerId: string) =>
                      resolved.automaticallyUsed.has(playerId) ||
                      (resolved.manuallyUsed.get(playerId) ?? []).some(
                        (rowId) => rowId !== row.id,
                      );
                    return (
                      <article className={`review-row ${ignored ? "ignored" : ""} ${conflict ? "conflict" : ""}`} key={row.id}>
                        <header>
                          <span className="review-status unmatched">Unmatched</span>
                          <small>
                            {row.recentAdp ? `7d ${row.recentAdp}` : "No recent ADP"}
                            {row.allDraftsAdp ? ` · all ${row.allDraftsAdp}` : ""}
                          </small>
                        </header>
                        <strong>{row.sourceName}</strong>
                        <p>{[row.sourceTeam, row.sourcePosition].filter(Boolean).join(" · ")}</p>
                        <div className="suggested-matches">
                          <span>Suggested matches</span>
                          <div>
                            {row.suggestions.map((suggestion) => (
                              <button
                                disabled={isUsed(suggestion.playerId)}
                                key={suggestion.playerId}
                                onClick={() => setDecisions((current) => ({ ...current, [row.id]: suggestion.playerId }))}
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
                            aria-label={`Match Yahoo ADP row for ${row.sourceName}`}
                            value={ignored ? "" : decision ?? ""}
                            onChange={(event) => setDecisions((current) => ({ ...current, [row.id]: event.target.value }))}
                          >
                            <option value="">Choose player…</option>
                            {[...players]
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((player) => (
                                <option disabled={isUsed(player.id)} key={player.id} value={player.id}>
                                  {player.name} — {player.nflTeam} · {player.positions.join("/")}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="review-row-footer">
                          <span className={conflict ? "review-conflict" : "review-resolution"}>
                            {conflict
                              ? "That player is already assigned to another Yahoo row."
                              : ignored
                                ? "This Yahoo row will be ignored."
                                : decision
                                  ? "This match is ready to apply."
                                  : "Choose a match or ignore this row."}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDecisions((current) => ({ ...current, [row.id]: ignored ? "" : ignoredValue }))}
                          >
                            {ignored ? "Undo ignore" : "Ignore"}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                  {resolved.unresolved.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={ignoreUnresolved}>
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
              preview.errors.length > 0 ||
              resolved.unresolved.length > 0 ||
              resolved.conflicts.size > 0 ||
              resolved.updates.length === 0
            }
            onClick={applyImport}
          >
            {applied ? "Yahoo ADP applied" : `Apply ${resolved.updates.length} Yahoo ADP rows`}
          </Button>
        </div>
      )}
      {yahooPlayerCount > 0 && (
        <Button
          className="clear-yahoo-adp"
          variant="ghost"
          size="sm"
          onClick={() => void onRunBusyTask("Removing Yahoo ADP", () => onPlayersChange(clearYahooAdp(players)))}
        >
          Remove Yahoo ADP data
        </Button>
      )}
    </div>
  );
}
