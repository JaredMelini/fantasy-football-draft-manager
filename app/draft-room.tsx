"use client";

import { useMemo, useState } from "react";
import {
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
import { recommendPlayers } from "@/lib/domain/recommendation";
import { assignRoster } from "@/lib/domain/roster";
import { calculateFantasyPoints } from "@/lib/domain/scoring";
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
  Player,
  PlayerPosition,
} from "@/lib/domain/types";
import { buildDemoTeams } from "@/lib/sample-data";

function formatPoints(value: number): string {
  return value.toFixed(1);
}

interface DraftRoomProps {
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  seed: string;
  strategy: OpponentStrategy;
  onEventsChange: (events: DraftEvent[]) => void;
  onResetDraft: () => void;
}

export function DraftRoom({
  league,
  players,
  events,
  seed,
  strategy,
  onEventsChange,
  onResetDraft,
}: DraftRoomProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PlayerPosition | "ALL">("ALL");
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const effectiveTeamCount = Math.max(1, Math.round(league.teamCount || 1));
  const teams = useMemo(
    () => buildDemoTeams(effectiveTeamCount),
    [effectiveTeamCount],
  );
  const userTeam = teams.find((team) => team.isUser)!;
  const replayed = useMemo(() => replayDraftEvents(events), [events]);
  const picks = replayed.picks;
  const draftedIds = useMemo(
    () => new Set(picks.map((pick) => pick.playerId)),
    [picks],
  );
  const maximumPicks = Math.min(
    players.filter((player) => !player.excluded).length,
    effectiveTeamCount * league.rosterSlots.length,
  );
  const draftComplete = picks.length >= maximumPicks;
  const currentOverall = picks.length + 1;
  const currentRound = roundForOverallPick(currentOverall, effectiveTeamCount);
  const currentTeam = draftComplete
    ? userTeam
    : teamForOverallPick(currentOverall, teams, league.draftType);
  const userPlayerIds = playerIdsForTeam(picks, userTeam.id);
  const userRoster = players.filter((player) => userPlayerIds.includes(player.id));
  const rosterAssignment = assignRoster(userRoster, league.rosterSlots);
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
  const recommendations = draftComplete
    ? []
    : recommendPlayers({
        players,
        league,
        picks,
        userRoster,
        currentOverall,
        picksUntilNextTurn: nextTurnGap,
        limit: players.length,
      });
  const best = recommendations[0];
  const availablePlayers = players
    .filter((player) => !draftedIds.has(player.id) && !player.excluded)
    .filter((player) => position === "ALL" || player.positions.includes(position))
    .filter((player) =>
      `${player.name} ${player.nflTeam}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.userRank - b.userRank);
  const selected = selectedPlayerId
    ? recommendations.find(
        (recommendation) => recommendation.player.id === selectedPlayerId,
      ) ?? best
    : best;
  const capturePreview = useMemo(
    () => parseDraftPickCapture(captureText, players, draftedIds),
    [captureText, draftedIds, players],
  );

  function logPick(playerId: string) {
    if (draftComplete || draftedIds.has(playerId)) return;
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
  }

  function simulateOne() {
    if (draftComplete || currentTeam.isUser) return;
    onEventsChange(
      simulateNextPick({ events, teams, league, players, seed, strategy }),
    );
    setSelectedPlayerId(null);
  }

  function simulateToUser() {
    if (draftComplete || currentTeam.isUser) return;
    onEventsChange(
      simulateUntilUserTurn({ events, teams, league, players, seed, strategy }),
    );
    setSelectedPlayerId(null);
  }

  function undoLastPick() {
    const undo = createUndoEvent(events);
    if (!undo) return;
    onEventsChange([...events, undo]);
    setSelectedPlayerId(null);
  }

  function importCapturedPicks() {
    if (capturePreview.matches.length === 0) return;
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
  }

  const upcomingUserPick = currentOverall + currentTurnOffset;
  const recentPicks = [...picks].reverse().slice(0, 8);

  return (
    <>
      <section className="draft-context" id="top">
        <div>
          <p className="eyebrow">Event-sourced draft · manual companion</p>
          <h1>{league.name}</h1>
          <p>{league.teamCount} teams · {league.scoringLabel} · Draft slot {userTeam.draftSlot}</p>
        </div>
        <div className={`pick-clock ${draftComplete ? "complete" : ""}`} aria-live="polite">
          <span>{draftComplete ? "Draft complete" : "On the clock"}</span>
          <strong>
            {draftComplete
              ? `${picks.length} picks recorded`
              : `${currentTeam.name} · ${currentRound}.${((currentOverall - 1) % effectiveTeamCount) + 1}`}
          </strong>
          <small>
            {draftComplete
              ? "Open Mock Lab for replay and evaluation"
              : currentTeam.isUser
                ? "Your recommendation is ready"
                : `Your next pick: ${upcomingUserPick}`}
          </small>
        </div>
        <div className="context-actions">
          <button className="secondary-button" onClick={() => setShowQuickCapture((current) => !current)}>{showQuickCapture ? "Close capture" : "Quick capture"}</button>
          <button className="secondary-button" onClick={undoLastPick} disabled={picks.length === 0}>Undo last</button>
          <button className="ghost-button" onClick={onResetDraft}>Reset session</button>
        </div>
      </section>

      <div className="draft-progress" aria-label="Draft progress">
        <span style={{ width: `${maximumPicks === 0 ? 0 : (picks.length / maximumPicks) * 100}%` }} />
      </div>

      {showQuickCapture && (
        <section className="quick-capture panel">
          <div>
            <p className="eyebrow">API-free live companion</p>
            <h2>Paste picks in draft order</h2>
            <p>Copy or type one pick per line. Player names can appear inside longer lines such as “1.07 — Amon-Ra St. Brown — My Team.” Team ownership is reconstructed from your draft order.</p>
          </div>
          <textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder={"Bijan Robinson\nJahmyr Gibbs\nJa'Marr Chase"} aria-label="Draft picks in order" autoFocus />
          <div className="capture-results">
            <span><strong>{capturePreview.matches.length}</strong> matched</span>
            <span><strong>{capturePreview.unmatched.length}</strong> unmatched</span>
            <span><strong>{capturePreview.duplicates.length}</strong> duplicates</span>
            {(capturePreview.unmatched.length > 0 || capturePreview.duplicates.length > 0) && (
              <small>Review: {[...capturePreview.unmatched, ...capturePreview.duplicates].slice(0, 4).join(", ")}</small>
            )}
          </div>
          <button className="primary-button compact-button" disabled={capturePreview.matches.length === 0} onClick={importCapturedPicks}>Import {Math.min(capturePreview.matches.length, maximumPicks - picks.length)} picks</button>
        </section>
      )}

      <div className="workspace-grid" id="draft-room">
        <section className="recommendation-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Best decision now</p><h2>{selected?.player.name ?? "Session complete"}</h2></div>
            {selected && <span className="score-badge">{selected.breakdown.total}</span>}
          </div>

          {selected ? (
            <>
              <div className="player-meta large">
                <span className={`position ${selected.player.positions[0].toLowerCase()}`}>{selected.player.positions[0]}</span>
                <span>{selected.player.nflTeam}</span><span>Tier {selected.player.tier}</span><span>Bye {selected.player.byeWeek}</span>
              </div>
              <div className="recommendation-summary"><strong>{formatPoints(selected.breakdown.projectedPoints)}</strong><span>projected league points</span></div>
              <ul className="reason-list">
                {selected.explanation.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className="factor-grid" aria-label="Recommendation factors">
                <div><span>Above replacement</span><strong>+{selected.breakdown.replacementValue}</strong></div>
                <div><span>Roster fit</span><strong>+{selected.breakdown.rosterFit}</strong></div>
                <div><span>Wait urgency</span><strong>+{selected.breakdown.availabilityUrgency}</strong></div>
                <div><span>Risk adjustment</span><strong>−{selected.breakdown.riskPenalty}</strong></div>
              </div>
              <button className="primary-button" onClick={() => logPick(selected.player.id)}>
                {currentTeam.isUser ? "Draft to my team" : `Log for ${currentTeam.name}`}
              </button>
            </>
          ) : (
            <p className="empty-state-copy">Every active player has been assigned. The immutable event log is ready to replay.</p>
          )}

          <div className="alternatives">
            <div className="section-label">Alternatives</div>
            {recommendations.slice(0, 4).map((recommendation, index) => (
              <button className={selected?.player.id === recommendation.player.id ? "selected" : ""} key={recommendation.player.id} onClick={() => setSelectedPlayerId(recommendation.player.id)}>
                <span>{index + 1}</span><strong>{recommendation.player.name}</strong><small>{Math.round(recommendation.returnProbability * 100)}% returns</small>
              </button>
            ))}
          </div>
        </section>

        <section className="player-board panel">
          <div className="section-heading board-heading">
            <div><p className="eyebrow">Your rankings</p><h2>Available players</h2></div>
            {!draftComplete && !currentTeam.isUser && (
              <div className="simulation-actions">
                <button className="secondary-button" onClick={simulateOne}>Sim one</button>
                <button className="secondary-button" onClick={simulateToUser}>Sim to my pick</button>
              </div>
            )}
          </div>
          <div className="board-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available players" aria-label="Search available players" />
            <select value={position} onChange={(event) => setPosition(event.target.value as PlayerPosition | "ALL")} aria-label="Filter by position">
              <option value="ALL">All positions</option>
              {(["QB", "RB", "WR", "TE", "K", "DST"] as PlayerPosition[]).map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
            <span>{availablePlayers.length} available</span>
          </div>
          <div className="table-wrap draft-player-table">
            <table>
              <thead><tr><th>My rank</th><th>Player</th><th>Proj.</th><th>ADP</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {availablePlayers.slice(0, 30).map((player) => {
                  const recommendation = recommendations.find((item) => item.player.id === player.id);
                  return (
                    <tr key={player.id} className={best?.player.id === player.id ? "top-player" : ""}>
                      <td><span className="rank-number">{player.userRank}</span></td>
                      <td>
                        <button className="player-name" onClick={() => setSelectedPlayerId(player.id)}>
                          <strong>{player.name}</strong>
                          <span className="player-meta"><b className={`position ${player.positions[0].toLowerCase()}`}>{player.positions[0]}</b>{player.nflTeam} · Tier {player.tier}</span>
                        </button>
                      </td>
                      <td>{formatPoints(calculateFantasyPoints(player, league.scoringRules))}</td>
                      <td>{player.adp.toFixed(1)}</td>
                      <td>
                        <button className="log-pick" onClick={() => logPick(player.id)} aria-label={`Log ${player.name} for ${currentTeam.name}`}>{currentTeam.isUser ? "Draft" : "Log"}</button>
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
            <div><p className="eyebrow">Draft slot {userTeam.draftSlot} · My team</p><h2>Roster build</h2></div>
            <span className="roster-count">{rosterAssignment.starters.length}/{league.rosterSlots.length}</span>
          </div>
          <div className="roster-list">
            {league.rosterSlots.map((slot) => {
              const assigned = rosterAssignment.starters.find((starter) => starter.slot.id === slot.id);
              return assigned ? (
                <div className="roster-player" key={slot.id}>
                  <span className={`position ${assigned.player.positions[0].toLowerCase()}`}>{slot.label}</span>
                  <div><strong>{assigned.player.name}</strong><small>{assigned.player.nflTeam} · Bye {assigned.player.byeWeek}</small></div>
                  <b>{formatPoints(calculateFantasyPoints(assigned.player, league.scoringRules))}</b>
                </div>
              ) : (
                <div className="empty-slot" key={slot.id}><span>{slot.label}</span><small>Open starter slot</small></div>
              );
            })}
            {rosterAssignment.bench.map((player) => (
              <div className="roster-player bench-player" key={player.id}>
                <span className="position">BN</span>
                <div><strong>{player.name}</strong><small>{player.nflTeam} · {player.positions.join("/")}</small></div>
                <b>{formatPoints(calculateFantasyPoints(player, league.scoringRules))}</b>
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
        <div><p className="eyebrow">Mock milestone</p><h2>Practice a complete draft, then replay every decision.</h2></div>
        <p>Manual and simulated picks now use the same append-only event model planned for Yahoo synchronization, including deterministic reconstruction and correction history.</p>
      </section>
    </>
  );
}
