"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  draftRosterSize,
  picksUntilTeamTurn,
  playerIdsForTeam,
  roundForOverallPick,
  teamForOverallPick,
} from "@/lib/domain/draft";
import {
  createPickEvent,
  createUndoEvent,
  replayDraftEvents,
  validateNextPick,
} from "@/lib/domain/draft-session";
import {
  analyzeCandidateRollouts,
  integrateRosterOutcomes,
} from "@/lib/domain/candidate-rollout";
import { recommendPlayers } from "@/lib/domain/recommendation";
import { assignRoster } from "@/lib/domain/roster";
import { calculateFantasyPoints, projectionModeForPlayer } from "@/lib/domain/scoring";
import { buildDraftSlotPlaybooks } from "@/lib/domain/draft-slot-planning";
import { buildDecisionBrief } from "@/lib/domain/decision-analyst";
import {
  getMarketAdp,
  getPositionRank,
  getPositionTier,
  primaryPosition,
} from "@/lib/domain/rankings";
import {
  simulateNextPick,
  simulateUntilUserTurn,
} from "@/lib/domain/simulation";
import {
  appendCapturedPicks,
  parseDraftPickCapture,
} from "@/lib/import/draft-picks";
import type {
  DraftEvent,
  LeagueSettings,
  OpponentStrategy,
  OpponentProfile,
  Player,
  PlayerPosition,
  RecommendationDecision,
  RiskTolerance,
} from "@/lib/domain/types";
import { buildDemoTeams } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function formatPoints(value: number): string {
  return value.toFixed(1);
}

function formatPlayerPoints(player: Player): string {
  return player.sourceProjectedPoints === undefined
    ? "—"
    : formatPoints(player.sourceProjectedPoints);
}

function formatSignedScore(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatLeaguePoints(player: Player, league: LeagueSettings): string {
  const mode = projectionModeForPlayer(player);
  if (mode === "rank-only") return "—";
  return mode === "source-total"
    ? formatPlayerPoints(player)
    : formatPoints(calculateFantasyPoints(player, league.scoringRules));
}

function decisionLabel(decision: RecommendationDecision): string {
  if (decision === "draft-now") return "Draft now";
  if (decision === "lean-now") return "Lean now";
  return "Can wait";
}

type PlayerBoardSort = "decision" | "projection" | "adp";
type SortDirection = "ascending" | "descending";

interface DraftRoomProps {
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  seed: string;
  strategy: OpponentStrategy;
  opponentProfiles: OpponentProfile[];
  onEventsChange: (events: DraftEvent[]) => void;
  onResetDraft: () => void;
  onRunBusyTask: (
    label: string,
    task: () => void | Promise<void>,
  ) => Promise<void>;
}

export function DraftRoom({
  league,
  players,
  events,
  seed,
  strategy,
  opponentProfiles,
  onEventsChange,
  onResetDraft,
  onRunBusyTask,
}: DraftRoomProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PlayerPosition | "ALL">("ALL");
  const [boardSort, setBoardSort] = useState<PlayerBoardSort>("decision");
  const [boardSortDirection, setBoardSortDirection] =
    useState<SortDirection>("descending");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("balanced");
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const deferredSearch = useDeferredValue(search);
  const deferredCaptureText = useDeferredValue(captureText);
  const effectiveTeamCount = Math.max(1, Math.round(league.teamCount || 1));
  const draftSlotPending = league.userDraftSlot === undefined;
  const teams = useMemo(
    () => buildDemoTeams(effectiveTeamCount, league.userDraftSlot ?? 1),
    [effectiveTeamCount, league.userDraftSlot],
  );
  const userTeam = teams.find((team) => team.isUser)!;
  const draftSlotLabel = league.userDraftSlot
    ? `Draft slot ${league.userDraftSlot}`
    : "Draft order pending";
  const replayed = useMemo(() => replayDraftEvents(events), [events]);
  const picks = replayed.picks;
  const draftedIds = useMemo(
    () => new Set(picks.map((pick) => pick.playerId)),
    [picks],
  );
  const maximumPicks = useMemo(
    () =>
      Math.min(
        players.filter((player) => !player.excluded).length,
        effectiveTeamCount * draftRosterSize(league),
      ),
    [effectiveTeamCount, league, players],
  );
  const rankingsNeeded = maximumPicks === 0;
  const draftComplete = !rankingsNeeded && picks.length >= maximumPicks;
  const currentOverall = picks.length + 1;
  const currentRound = roundForOverallPick(currentOverall, effectiveTeamCount);
  const currentTeam = draftComplete
    ? userTeam
    : teamForOverallPick(currentOverall, teams, league.draftType);
  const userPlayerIds = useMemo(
    () => new Set(playerIdsForTeam(picks, userTeam.id)),
    [picks, userTeam.id],
  );
  const userRoster = useMemo(
    () => players.filter((player) => userPlayerIds.has(player.id)),
    [players, userPlayerIds],
  );
  const rosterAssignment = useMemo(
    () => assignRoster(userRoster, league.rosterSlots),
    [league.rosterSlots, userRoster],
  );
  const currentTurnOffset = draftComplete
    ? 0
    : picksUntilTeamTurn(
        currentOverall,
        userTeam.id,
        teams,
        league.draftType,
      );
  const nextTurnGap =
    !draftComplete && currentTeam.isUser
      ? 1 +
        picksUntilTeamTurn(
          currentOverall + 1,
          userTeam.id,
          teams,
          league.draftType,
        )
      : currentTurnOffset;
  const decisionOverall = currentTeam.isUser
    ? currentOverall
    : currentOverall + currentTurnOffset;
  const baseRecommendations = useMemo(
    () =>
      draftComplete || draftSlotPending
        ? []
        : recommendPlayers({
            players,
            league,
            picks,
            userRoster,
            currentOverall,
            picksUntilNextTurn: nextTurnGap,
            teams,
            seed,
            riskTolerance,
            simulationCount: 64,
            limit: players.length,
            opponentProfiles,
          }),
    [
      currentOverall,
      draftSlotPending,
      draftComplete,
      league,
      nextTurnGap,
      picks,
      players,
      opponentProfiles,
      riskTolerance,
      seed,
      teams,
      userRoster,
    ],
  );
  const rolloutAnalysis = useMemo(
    () =>
      draftComplete || draftSlotPending
        ? { summaries: [], lenses: [] }
        : analyzeCandidateRollouts({
            recommendations: baseRecommendations,
            players,
            league,
            picks,
            teams,
            userTeamId: userTeam.id,
            userRoster,
            decisionOverall,
            seed,
            riskTolerance,
            simulationCount: 18,
            candidateLimit: 6,
            opponentProfiles,
          }),
    [
      decisionOverall,
      draftComplete,
      draftSlotPending,
      league,
      picks,
      players,
      opponentProfiles,
      baseRecommendations,
      riskTolerance,
      seed,
      teams,
      userRoster,
      userTeam.id,
    ],
  );
  const recommendations = useMemo(
    () =>
      integrateRosterOutcomes(
        baseRecommendations,
        rolloutAnalysis.summaries,
        riskTolerance,
      ),
    [baseRecommendations, riskTolerance, rolloutAnalysis.summaries],
  );
  const best = recommendations[0];
  const recommendationScores = useMemo(
    () =>
      new Map(
        recommendations.map((item) => [item.player.id, item.breakdown.total]),
      ),
    [recommendations],
  );
  const availablePlayers = useMemo(
    () =>
      players
        .filter((player) => !draftedIds.has(player.id) && !player.excluded)
        .filter(
          (player) =>
            position === "ALL" || player.positions.includes(position),
        )
        .filter((player) =>
          `${player.name} ${player.nflTeam}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase()),
        )
        .sort((a, b) => {
          const direction = boardSortDirection === "ascending" ? 1 : -1;
          const positionRankDifference =
            getPositionRank(a, players, primaryPosition(a)) -
            getPositionRank(b, players, primaryPosition(b));

          if (boardSort === "projection") {
            const left = a.sourceProjectedPoints;
            const right = b.sourceProjectedPoints;
            if (left === undefined && right === undefined) {
              return positionRankDifference;
            }
            if (left === undefined) return 1;
            if (right === undefined) return -1;
            return (left - right) * direction || positionRankDifference;
          }

          if (boardSort === "adp") {
            return (
              (getMarketAdp(a, league.teamCount) -
                getMarketAdp(b, league.teamCount)) *
                direction || positionRankDifference
            );
          }

          return position === "ALL"
            ? (recommendationScores.get(b.id) ?? -Infinity) -
                (recommendationScores.get(a.id) ?? -Infinity)
            : getPositionRank(a, players, position) -
                getPositionRank(b, players, position);
        }),
    [
      boardSort,
      boardSortDirection,
      deferredSearch,
      draftedIds,
      league.teamCount,
      players,
      position,
      recommendationScores,
    ],
  );
  const selected = selectedPlayerId
    ? recommendations.find(
        (recommendation) => recommendation.player.id === selectedPlayerId,
      ) ?? best
    : best;
  const isReviewingAlternative = Boolean(
    selected && best && selected.player.id !== best.player.id,
  );
  const comparisonLenses = useMemo(
    () =>
      best
        ? [
            {
              key: "best",
              label: "Best overall",
              playerId: best.player.id,
              metric: `${best.breakdown.total} unified grade`,
              rationale: "Strongest combined live-pick and completed-roster result",
            },
            ...rolloutAnalysis.lenses,
          ]
        : rolloutAnalysis.lenses,
    [best, rolloutAnalysis.lenses],
  );
  const selectedRollout = selected
    ? rolloutAnalysis.summaries.find(
        (summary) => summary.playerId === selected.player.id,
      )
    : undefined;
  const decisionBrief = useMemo(
    () =>
      selected
        ? buildDecisionBrief({ recommendation: selected, league })
        : null,
    [league, selected],
  );
  const capturePreview = useMemo(
    () => parseDraftPickCapture(deferredCaptureText, players, draftedIds),
    [deferredCaptureText, draftedIds, players],
  );
  const slotPlaybooks = useMemo(
    () =>
      draftSlotPending
        ? buildDraftSlotPlaybooks({
            players,
            league,
            seed,
            simulationsPerSlot: 3,
          })
        : [],
    [draftSlotPending, league, players, seed],
  );

  function logPick(playerId: string) {
    if (draftComplete || draftSlotPending || draftedIds.has(playerId)) return;
    const pick = {
      overall: currentOverall,
      round: currentRound,
      teamId: currentTeam.id,
      playerId,
    };
    const validation = validateNextPick({
      pick,
      currentPicks: picks,
      teams,
      draftType: league.draftType,
      players,
    });
    if (!validation.valid) return;
    void onRunBusyTask("Updating draft recommendations", () => {
      onEventsChange([
        ...events,
        createPickEvent({
          events,
          pick,
          source: "manual",
          recommendedPlayerId: best?.player.id,
        }),
      ]);
      setSelectedPlayerId(null);
    });
  }

  function toggleBoardSort(nextSort: Exclude<PlayerBoardSort, "decision">) {
    if (boardSort === nextSort) {
      setBoardSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }

    setBoardSort(nextSort);
    setBoardSortDirection(nextSort === "adp" ? "ascending" : "descending");
  }

  function simulateOne() {
    if (draftComplete || currentTeam.isUser) return;
    void onRunBusyTask("Simulating the next pick", () => {
      onEventsChange(
        simulateNextPick({ events, teams, league, players, seed, strategy, opponentProfiles }),
      );
      setSelectedPlayerId(null);
    });
  }

  function simulateToUser() {
    if (draftComplete || currentTeam.isUser) return;
    void onRunBusyTask("Simulating to your next pick", () => {
      onEventsChange(
        simulateUntilUserTurn({ events, teams, league, players, seed, strategy, opponentProfiles }),
      );
      setSelectedPlayerId(null);
    });
  }

  function undoLastPick() {
    const undo = createUndoEvent(events);
    if (!undo) return;
    void onRunBusyTask("Recalculating after undo", () => {
      onEventsChange([...events, undo]);
      setSelectedPlayerId(null);
    });
  }

  function importCapturedPicks() {
    if (capturePreview.matches.length === 0) return;
    void onRunBusyTask("Importing picks and updating recommendations", () => {
      onEventsChange(
        appendCapturedPicks({
          events,
          matches: capturePreview.matches,
          teams,
          league,
          maximumPicks,
        }),
      );
      setCaptureText("");
      setShowQuickCapture(false);
      setSelectedPlayerId(null);
    });
  }

  const upcomingUserPick = currentOverall + currentTurnOffset;
  const recentPicks = [...picks].reverse().slice(0, 8);

  return (
    <>
      <section className="draft-context" id="top">
        <div>
          <p className="eyebrow">Event-sourced draft · manual companion</p>
          <h1>{league.name}</h1>
          <p>{league.teamCount} teams · {league.scoringLabel} · {draftSlotLabel}</p>
        </div>
        <div className={`pick-clock ${draftComplete ? "complete" : ""}`} aria-live="polite">
          <span>{rankingsNeeded ? "Rankings needed" : draftSlotPending ? "Draft slot required" : draftComplete ? "Draft complete" : "On the clock"}</span>
          <strong>
            {rankingsNeeded
              ? "Import your UDK files"
              : draftSlotPending
              ? "Set your Yahoo slot"
              : draftComplete
              ? `${picks.length} picks recorded`
              : `${currentTeam.name} · ${currentRound}.${((currentOverall - 1) % effectiveTeamCount) + 1}`}
          </strong>
          <small>
            {rankingsNeeded
              ? "Open Rankings to build the player board"
              : draftSlotPending
              ? "Use League Setup when Yahoo reveals the order"
              : draftComplete
              ? "Open Mock Lab for replay and evaluation"
              : currentTeam.isUser
                ? "Your recommendation is ready"
                : `Your next pick: ${upcomingUserPick}`}
          </small>
        </div>
        <div className="context-actions">
          <Button variant="outline" size="sm" onClick={() => setShowQuickCapture((current) => !current)}>{showQuickCapture ? "Close capture" : "Quick capture"}</Button>
          <Button variant="outline" size="sm" onClick={undoLastPick} disabled={picks.length === 0}>Undo last</Button>
          <Button variant="ghost" size="sm" onClick={() => void onRunBusyTask("Resetting the draft session", onResetDraft)}>Reset session</Button>
        </div>
      </section>

      <div className="draft-progress" aria-label="Draft progress">
        <span style={{ width: `${maximumPicks === 0 ? 0 : (picks.length / maximumPicks) * 100}%` }} />
      </div>

      {draftSlotPending && slotPlaybooks.length > 0 && (
        <Card className="quick-capture">
          <div>
            <p className="eyebrow">Random draft order playbooks</p>
            <h2>Plans are ready for all {effectiveTeamCount} slots</h2>
            <p>
              Live recommendations stay locked until Yahoo reveals your exact
              slot. Each row is generated from coherent full-draft simulations
              using your league scoring, UDK board, and Yahoo market behavior.
            </p>
          </div>
          <div className="capture-results">
            {slotPlaybooks.map((playbook) => (
              <span key={playbook.slot}>
                <strong>Slot {playbook.slot}</strong> {playbook.openingPositions} · {playbook.firstPickTargets.join(" / ")}
              </span>
            ))}
          </div>
        </Card>
      )}

      {showQuickCapture && (
        <Card className="quick-capture">
          <div>
            <p className="eyebrow">API-free live companion</p>
            <h2>Paste picks in draft order</h2>
            <p>Copy or type one pick per line. Player names can appear inside longer lines such as “1.07 — Amon-Ra St. Brown — My Team.” Team ownership is reconstructed from your draft order.</p>
          </div>
          <Textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder={"Bijan Robinson\nJahmyr Gibbs\nJa'Marr Chase"} aria-label="Draft picks in order" autoFocus />
          <div className="capture-results">
            <span><strong>{capturePreview.matches.length}</strong> matched</span>
            <span><strong>{capturePreview.unmatched.length}</strong> unmatched</span>
            <span><strong>{capturePreview.duplicates.length}</strong> duplicates</span>
            {(capturePreview.unmatched.length > 0 || capturePreview.duplicates.length > 0) && (
              <small>Review: {[...capturePreview.unmatched, ...capturePreview.duplicates].slice(0, 4).join(", ")}</small>
            )}
          </div>
          <Button size="sm" disabled={capturePreview.matches.length === 0} onClick={importCapturedPicks}>Import {Math.min(capturePreview.matches.length, maximumPicks - picks.length)} picks</Button>
        </Card>
      )}

      <div className="workspace-grid" id="draft-room">
        <section className="recommendation-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">{isReviewingAlternative ? "Reviewing alternative" : "Best decision now"}</p><h2>{selected?.player.name ?? (rankingsNeeded ? "Import rankings to begin" : draftSlotPending ? "Set your Yahoo draft slot" : "Session complete")}</h2></div>
            <div className="recommendation-heading-actions">
              {selected && <span className="score-badge" title="Unified best-overall grade">{selected.breakdown.total}</span>}
              {isReviewingAlternative && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedPlayerId(null)}>
                  Return to best decision
                </Button>
              )}
            </div>
          </div>

          {comparisonLenses.length > 0 && (
            <div className="recommendation-lenses" aria-label="Recommendation comparison views">
              {comparisonLenses.map((lens) => {
                const recommendation = recommendations.find(
                  ({ player }) => player.id === lens.playerId,
                );
                if (!recommendation) return null;
                return (
                  <button
                    className={`${selected?.player.id === lens.playerId ? "active" : ""} ${lens.key === "best" ? "primary-lens" : ""}`}
                    key={lens.key}
                    onClick={() =>
                      setSelectedPlayerId(
                        lens.playerId === best?.player.id
                          ? null
                          : lens.playerId,
                      )
                    }
                    type="button"
                  >
                    <span>{lens.label}</span>
                    <strong>{recommendation.player.name}</strong>
                    <small>{lens.metric}</small>
                  </button>
                );
              })}
            </div>
          )}

          {selected ? (
            <>
              <div className="player-meta large">
                <span className={`position ${selected.player.positions[0].toLowerCase()}`}>{selected.player.positions[0]}</span>
                <span>{selected.player.nflTeam}</span><span>{primaryPosition(selected.player)}{getPositionRank(selected.player, players)}</span><span>Tier {getPositionTier(selected.player)}</span><span>Bye {selected.player.byeWeek}</span>
              </div>
              <div className="decision-strip">
                <span className={`decision-chip ${selected.decision}`}>{decisionLabel(selected.decision)}</span>
                <strong>{Math.round(selected.confidence * 100)}% confidence</strong>
                <small>{selected.waitAnalysis.simulations} scenarios</small>
              </div>
              <label className="risk-control">
                <span>Risk profile</span>
                <select value={riskTolerance} onChange={(event) => { const nextRisk = event.target.value as RiskTolerance; void onRunBusyTask("Recalculating recommendations", () => setRiskTolerance(nextRisk)); }} aria-label="Recommendation risk profile">
                  <option value="safe">Safer floor</option>
                  <option value="balanced">Balanced</option>
                  <option value="upside">Chase upside</option>
                </select>
              </label>
              <div className="recommendation-summary"><strong>{formatLeaguePoints(selected.player, league)}</strong><span>{projectionModeForPlayer(selected.player) === "raw-league-scored" ? "League-scored projection" : projectionModeForPlayer(selected.player) === "source-total" ? "Imported source projection" : "Rank-only player"}</span></div>
              <ul className="reason-list">
                {selected.explanation.map((reason) => <li key={reason}>{reason}</li>)}
                {decisionBrief?.cautions.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className="wait-comparison" aria-label="Draft now versus wait comparison">
                <div><span>Draft now</span><strong>{selected.player.name}</strong><small>Lock in a {selected.breakdown.total} unified decision grade</small></div>
                <div><span>If you wait</span><strong>{selected.waitAnalysis.expectedAlternativeName ?? "No reliable fallback"}</strong><small>{selected.waitAnalysis.opportunityLoss > 0 ? `${selected.waitAnalysis.opportunityLoss} expected score lost` : "Comparable value should remain"}</small></div>
              </div>
              {selectedRollout && (
                <div className="roster-outlook" aria-label="Completed roster forecast">
                  <div>
                    <span>Completed roster forecast</span>
                    <strong>{selectedRollout.averageRosterGrade}</strong>
                    <small>average grade</small>
                  </div>
                  <dl>
                    <div><dt>Floor</dt><dd>{selectedRollout.floorRosterGrade}</dd></div>
                    <div><dt>Ceiling</dt><dd>{selectedRollout.ceilingRosterGrade}</dd></div>
                    <div><dt>Starter pts</dt><dd>{selectedRollout.averageStarterPoints}</dd></div>
                    <div><dt>Filled</dt><dd>{Math.round(selectedRollout.completionRate * 100)}%</dd></div>
                    <div><dt>Playoffs</dt><dd>{Math.round(selectedRollout.playoffProbability * 100)}%</dd></div>
                    <div><dt>Title</dt><dd>{Math.round(selectedRollout.championshipProbability * 100)}%</dd></div>
                    <div><dt>Regret</dt><dd>{selectedRollout.expectedRegret}</dd></div>
                    <div><dt>95% CI</dt><dd>{selectedRollout.confidenceLow}–{selectedRollout.confidenceHigh}</dd></div>
                  </dl>
                  <p>Based on {selectedRollout.simulations} coherent full drafts with exact snake turns, persistent manager tendencies, weekly optimal lineups, and paired season outcomes.</p>
                </div>
              )}
              <div className="factor-grid" aria-label="Recommendation factors">
                <div><span>Above replacement</span><strong>{formatSignedScore(selected.breakdown.replacementValue)}</strong></div>
                <div><span>Roster fit</span><strong>{formatSignedScore(selected.breakdown.rosterFit)}</strong></div>
                <div><span>Wait urgency</span><strong>{formatSignedScore(selected.breakdown.availabilityUrgency)}</strong></div>
                <div><span>Opponent pressure</span><strong>{formatSignedScore(selected.breakdown.opponentDemand)}</strong></div>
                <div><span>Wait opportunity</span><strong>{formatSignedScore(selected.breakdown.opportunityCost)}</strong></div>
                {selected.breakdown.rankGuardrail > 0 && <div><span>Rank guardrail</span><strong>{formatSignedScore(-selected.breakdown.rankGuardrail)}</strong></div>}
                <div><span>Upside profile</span><strong>{formatSignedScore(selected.breakdown.upsideValue)}</strong></div>
                <div><span>Risk adjustment</span><strong>−{selected.breakdown.riskPenalty}</strong></div>
                {selected.breakdown.immediateScore !== undefined && <div><span>Live pick score</span><strong>{selected.breakdown.immediateScore}</strong></div>}
                {selected.breakdown.expectedRosterGrade !== undefined && <div><span>Expected roster</span><strong>{selected.breakdown.expectedRosterGrade}</strong></div>}
              </div>
              <Button className="w-full" onClick={() => logPick(selected.player.id)}>
                {currentTeam.isUser ? "Draft to my team" : `Log for ${currentTeam.name}`}
              </Button>
            </>
          ) : (
            <p className="empty-state-copy">{rankingsNeeded ? "Your player board is empty. Import the UDK position files in Rankings before starting a draft." : "Every active player has been assigned. The immutable event log is ready to replay."}</p>
          )}

          <div className="alternatives">
            <div className="section-label">Alternatives</div>
            {recommendations.slice(0, 4).map((recommendation, index) => (
              <button className={selected?.player.id === recommendation.player.id ? "selected" : ""} key={recommendation.player.id} onClick={() => setSelectedPlayerId(recommendation.player.id)}>
                <span>{index + 1}</span><strong>{recommendation.player.name}</strong><small>{decisionLabel(recommendation.decision)} · {Math.round(recommendation.returnProbability * 100)}% returns</small>
              </button>
            ))}
          </div>
        </section>

        <section className="player-board panel">
          <div className="section-heading board-heading">
            <div><p className="eyebrow">Your rankings</p><h2>Available players</h2></div>
            {!draftComplete && !currentTeam.isUser && (
              <div className="simulation-actions">
                <Button variant="outline" size="sm" onClick={simulateOne}>Sim one</Button>
                <Button variant="secondary" size="sm" onClick={simulateToUser}>Sim to my pick</Button>
              </div>
            )}
          </div>
          <div className="board-filters">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available players" aria-label="Search available players" />
            <select value={position} onChange={(event) => setPosition(event.target.value as PlayerPosition | "ALL")} aria-label="Filter by position">
              <option value="ALL">All positions</option>
              {(["QB", "RB", "WR", "TE", "K", "DST"] as PlayerPosition[]).map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
            <div className="board-status">
              <span>{availablePlayers.length} available</span>
              {boardSort !== "decision" && (
                <button type="button" onClick={() => setBoardSort("decision")}>Decision order</button>
              )}
            </div>
          </div>
          <div className="table-wrap draft-player-table">
            <table>
              <thead>
                <tr>
                  <th>Pos. rank</th>
                  <th>Player</th>
                  <th aria-sort={boardSort === "projection" ? boardSortDirection : "none"}>
                    <button className={`sortable-header ${boardSort === "projection" ? "active" : ""}`} type="button" onClick={() => toggleBoardSort("projection")} aria-label="Sort by projected points">
                      <span>Proj.</span>
                      <span className="sort-indicator" aria-hidden="true">{boardSort === "projection" ? (boardSortDirection === "ascending" ? "↑" : "↓") : "↕"}</span>
                    </button>
                  </th>
                  <th aria-sort={boardSort === "adp" ? boardSortDirection : "none"}>
                    <button className={`sortable-header ${boardSort === "adp" ? "active" : ""}`} type="button" onClick={() => toggleBoardSort("adp")} aria-label="Sort by ADP">
                      <span>ADP</span>
                      <span className="sort-indicator" aria-hidden="true">{boardSort === "adp" ? (boardSortDirection === "ascending" ? "↑" : "↓") : "↕"}</span>
                    </button>
                  </th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {availablePlayers.slice(0, 30).map((player) => {
                  const recommendation = recommendations.find((item) => item.player.id === player.id);
                  return (
                    <tr key={player.id} className={best?.player.id === player.id ? "top-player" : ""}>
                      <td><span className="rank-number">{primaryPosition(player)}{getPositionRank(player, players)}</span></td>
                      <td>
                        <button className="player-name" onClick={() => setSelectedPlayerId(player.id)}>
                          <strong>{player.name}</strong>
                          <span className="player-meta"><b className={`position ${player.positions[0].toLowerCase()}`}>{player.positions[0]}</b>{player.nflTeam} · Tier {getPositionTier(player)}</span>
                        </button>
                      </td>
                      <td>{formatPlayerPoints(player)}</td>
                      <td>{player.sourceAdp ?? player.adp.toFixed(1)}</td>
                      <td>
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={() => logPick(player.id)} aria-label={`Log ${player.name} for ${currentTeam.name}`}>{currentTeam.isUser ? "Draft" : "Log"}</Button>
                        {recommendation && <small className="decision-score">{recommendation.breakdown.total}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="roster-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">{draftSlotLabel} · My team</p><h2>Roster build</h2></div>
            <span className="roster-count">{rosterAssignment.starters.length}/{league.rosterSlots.length}</span>
          </div>
          <div className="roster-list">
            {league.rosterSlots.map((slot) => {
              const assigned = rosterAssignment.starters.find((starter) => starter.slot.id === slot.id);
              return assigned ? (
                <div className="roster-player" key={slot.id}>
                  <span className={`position ${assigned.player.positions[0].toLowerCase()}`}>{slot.label}</span>
                  <div><strong>{assigned.player.name}</strong><small>{assigned.player.nflTeam} · Bye {assigned.player.byeWeek}</small></div>
                  <b>{formatPlayerPoints(assigned.player)}</b>
                </div>
              ) : (
                <div className="empty-slot" key={slot.id}><span>{slot.label}</span><small>Open starter slot</small></div>
              );
            })}
            {rosterAssignment.bench.map((player) => (
              <div className="roster-player bench-player" key={player.id}>
                <span className="position">BN</span>
                <div><strong>{player.name}</strong><small>{player.nflTeam} · {player.positions.join("/")}</small></div>
                <b>{formatPlayerPoints(player)}</b>
              </div>
            ))}
          </div>
          <div className="settings-audit">
            <div className="section-label">Session integrity</div>
            <div><span>Active picks</span><strong>{picks.length}</strong></div>
            <div><span>Event records</span><strong>{events.length}</strong></div>
            <div><span>Replay status</span><strong className="covered">Deterministic</strong></div>
          </div>
        </aside>
      </div>

      <section className="activity-strip">
        <div>
          <p className="eyebrow">Latest picks</p>
          <div className="pick-feed">
            {recentPicks.map((pick) => {
              const pickedPlayer = players.find((candidate) => candidate.id === pick.playerId);
              const team = teams.find((candidate) => candidate.id === pick.teamId);
              if (!pickedPlayer || !team) return null;
              return <span key={`${pick.overall}-${pick.playerId}`}><b>{pick.overall}</b> {pickedPlayer.name}<small>{team.name}</small></span>;
            })}
          </div>
        </div>
        <div className="model-note">
          <span className="status-dot ready" />
          <p><strong>Draft event log active</strong><small>{seed} seed · {strategy} opponents · undo preserves history</small></p>
        </div>
      </section>

      <section className="plan-banner" id="plan">
        <div><p className="eyebrow">Decision Engine v3</p><h2>Optimize the finished roster, not just the next pick.</h2></div>
        <p>Best Overall blends completed-roster simulations with your rankings, roster constraints, live replacement value, market timing, opponent needs, and wait scenarios. The risk profile shifts the balance between average, floor, and ceiling outcomes.</p>
      </section>
    </>
  );
}
