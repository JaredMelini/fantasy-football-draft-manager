"use client";

import { useMemo, useState } from "react";
import {
  picksUntilTeamTurn,
  playerIdsForTeam,
  roundForOverallPick,
  teamForOverallPick,
} from "@/lib/domain/draft";
import { recommendPlayers } from "@/lib/domain/recommendation";
import { calculateFantasyPoints } from "@/lib/domain/scoring";
import type { DraftPick, LeagueSettings, Player } from "@/lib/domain/types";
import {
  buildDemoTeams,
  buildInitialDemoPicks,
} from "@/lib/sample-data";

function formatPoints(value: number): string {
  return value.toFixed(1);
}

interface DraftRoomProps {
  league: LeagueSettings;
  players: Player[];
}

export function DraftRoom({ league, players }: DraftRoomProps) {
  const effectiveTeamCount = Math.max(1, Math.round(league.teamCount || 1));
  const teams = useMemo(
    () => buildDemoTeams(effectiveTeamCount),
    [effectiveTeamCount],
  );
  const initialPicks = useMemo(
    () => buildInitialDemoPicks(effectiveTeamCount),
    [effectiveTeamCount],
  );
  const userTeam = teams.find((team) => team.isUser)!;
  const [picks, setPicks] = useState<DraftPick[]>(initialPicks);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const draftedIds = useMemo(
    () => new Set(picks.map((pick) => pick.playerId)),
    [picks],
  );
  const currentOverall = picks.length + 1;
  const currentRound = roundForOverallPick(currentOverall, effectiveTeamCount);
  const currentTeam = teamForOverallPick(
    currentOverall,
    teams,
    league.draftType,
  );
  const userPlayerIds = playerIdsForTeam(picks, userTeam.id);
  const userRoster = players.filter((player) =>
    userPlayerIds.includes(player.id),
  );
  const currentTurnOffset = picksUntilTeamTurn(
    currentOverall,
    userTeam.id,
    teams,
    league.draftType,
  );
  const nextTurnGap = currentTeam.isUser
    ? 1 +
      picksUntilTeamTurn(
        currentOverall + 1,
        userTeam.id,
        teams,
        league.draftType,
      )
    : currentTurnOffset;

  const recommendations = recommendPlayers({
    players,
    league,
    picks,
    userRoster,
    currentOverall,
    picksUntilNextTurn: nextTurnGap,
  });
  const best = recommendations[0];
  const availablePlayers = players
    .filter((player) => !draftedIds.has(player.id))
    .sort((a, b) => a.userRank - b.userRank);
  const selected = selectedPlayerId
    ? recommendations.find(
        (recommendation) => recommendation.player.id === selectedPlayerId,
      ) ?? best
    : best;

  function logPick(playerId: string) {
    if (draftedIds.has(playerId)) return;
    setPicks((current) => [
      ...current,
      {
        overall: currentOverall,
        round: currentRound,
        teamId: currentTeam.id,
        playerId,
      },
    ]);
    setSelectedPlayerId(null);
  }

  function simulateOpponentPick() {
    if (currentTeam.isUser) return;
    const selection = [...availablePlayers].sort((a, b) => a.adp - b.adp)[0];
    if (selection) logPick(selection.id);
  }

  function undoLastPick() {
    if (picks.length <= initialPicks.length) return;
    setPicks((current) => current.slice(0, -1));
    setSelectedPlayerId(null);
  }

  function resetDemo() {
    setPicks(initialPicks);
    setSelectedPlayerId(null);
  }

  const upcomingUserPick = currentOverall + currentTurnOffset;
  const recentPicks = [...picks].reverse().slice(0, 6);

  return (
    <>
      <section className="draft-context" id="top">
        <div>
          <p className="eyebrow">Demo league · manual mode</p>
          <h1>{league.name}</h1>
          <p>{league.teamCount} teams · {league.scoringLabel} · Draft slot {userTeam.draftSlot}</p>
        </div>
        <div className="pick-clock" aria-live="polite">
          <span>On the clock</span>
          <strong>{currentTeam.name} · {currentRound}.{((currentOverall - 1) % effectiveTeamCount) + 1}</strong>
          <small>{currentTeam.isUser ? "Your recommendation is ready" : `Your next pick: ${upcomingUserPick}`}</small>
        </div>
        <div className="context-actions">
          <button className="secondary-button" onClick={undoLastPick} disabled={picks.length <= initialPicks.length}>Undo</button>
          <button className="ghost-button" onClick={resetDemo}>Reset demo</button>
        </div>
      </section>

      <div className="workspace-grid" id="draft-room">
        <section className="recommendation-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Best decision now</p><h2>{selected?.player.name ?? "Draft complete"}</h2></div>
            {selected && <span className="score-badge">{selected.breakdown.total}</span>}
          </div>

          {selected && (
            <>
              <div className="player-meta large">
                <span className={`position ${selected.player.positions[0].toLowerCase()}`}>{selected.player.positions[0]}</span>
                <span>{selected.player.nflTeam}</span><span>Tier {selected.player.tier}</span><span>Bye {selected.player.byeWeek}</span>
              </div>
              <div className="recommendation-summary"><strong>{formatPoints(selected.breakdown.projectedPoints)}</strong><span>projected PPR points</span></div>
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
            {!currentTeam.isUser && <button className="secondary-button" onClick={simulateOpponentPick}>Sim next pick</button>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>My rank</th><th>Player</th><th>Proj.</th><th>ADP</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {availablePlayers.slice(0, 12).map((player) => {
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
            <div><p className="eyebrow">Draft slot 7 · My team</p><h2>Roster build</h2></div>
            <span className="roster-count">{userRoster.length}/7</span>
          </div>
          <div className="roster-list">
            {userRoster.map((player) => (
              <div className="roster-player" key={player.id}>
                <span className={`position ${player.positions[0].toLowerCase()}`}>{player.positions[0]}</span>
                <div><strong>{player.name}</strong><small>{player.nflTeam} · Bye {player.byeWeek}</small></div>
                <b>{formatPoints(calculateFantasyPoints(player, league.scoringRules))}</b>
              </div>
            ))}
            {league.rosterSlots.slice(userRoster.length).map((slot) => (
              <div className="empty-slot" key={slot.id}><span>{slot.label}</span><small>Open starter slot</small></div>
            ))}
          </div>
          <div className="settings-audit">
            <div className="section-label">League model</div>
            <div><span>Scoring rules</span><strong>{league.scoringRules.length}/{league.scoringRules.length}</strong></div>
            <div><span>Roster slots</span><strong>{league.rosterSlots.length}/{league.rosterSlots.length}</strong></div>
            <div><span>Projection coverage</span><strong className="covered">Complete</strong></div>
          </div>
        </aside>
      </div>

      <section className="activity-strip">
        <div>
          <p className="eyebrow">Latest picks</p>
          <div className="pick-feed">
            {recentPicks.map((pick) => {
              const pickedPlayer = players.find((candidate) => candidate.id === pick.playerId)!;
              const team = teams.find((candidate) => candidate.id === pick.teamId)!;
              return <span key={pick.overall}><b>{pick.overall}</b> {pickedPlayer.name}<small>{team.name}</small></span>;
            })}
          </div>
        </div>
        <div className="model-note">
          <span className="status-dot ready" />
          <p><strong>Deterministic engine active</strong><small>Demo projections · exact league scoring · no AI required</small></p>
        </div>
      </section>

      <section className="plan-banner" id="plan">
        <div><p className="eyebrow">Foundation milestone</p><h2>Useful before Yahoo approval. Ready to connect afterward.</h2></div>
        <p>The same scoring, roster, and recommendation modules powering this demo will consume normalized Yahoo league data once API access is approved.</p>
      </section>
    </>
  );
}
