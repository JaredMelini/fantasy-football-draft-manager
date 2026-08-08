"use client";

import { useMemo, useState } from "react";
import {
  draftRosterSize,
  playerIdsForTeam,
  teamForOverallPick,
} from "@/lib/domain/draft";
import { evaluateUserDraft } from "@/lib/domain/draft-evaluation";
import { replayDraftEvents } from "@/lib/domain/draft-session";
import { assignRoster } from "@/lib/domain/roster";
import { simulateDraftToEnd, simulateUntilUserTurn } from "@/lib/domain/simulation";
import type {
  DraftEvent,
  LeagueSettings,
  OpponentStrategy,
  Player,
} from "@/lib/domain/types";
import { buildDemoTeams } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MockLabProps {
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  seed: string;
  strategy: OpponentStrategy;
  onEventsChange: (events: DraftEvent[]) => void;
  onSeedChange: (seed: string) => void;
  onStrategyChange: (strategy: OpponentStrategy) => void;
  onResetDraft: () => void;
  onOpenDraft: () => void;
  onRunBusyTask: (
    label: string,
    task: () => void | Promise<void>,
  ) => Promise<void>;
}

export function MockLab({
  league,
  players,
  events,
  seed,
  strategy,
  onEventsChange,
  onSeedChange,
  onStrategyChange,
  onResetDraft,
  onOpenDraft,
  onRunBusyTask,
}: MockLabProps) {
  const [replayPosition, setReplayPosition] = useState<number | "live">("live");
  const teams = useMemo(
    () =>
      buildDemoTeams(
        Math.max(1, Math.round(league.teamCount || 1)),
        league.userDraftSlot ?? 1,
      ),
    [league.teamCount, league.userDraftSlot],
  );
  const userTeam = teams.find((team) => team.isUser)!;
  const maximumSequence = useMemo(
    () => Math.max(0, ...events.map((event) => event.sequence)),
    [events],
  );
  const throughSequence =
    replayPosition === "live"
      ? maximumSequence
      : Math.min(replayPosition, maximumSequence);
  const visibleEvents = useMemo(
    () => events.filter((event) => event.sequence <= throughSequence),
    [events, throughSequence],
  );
  const replayed = useMemo(
    () => replayDraftEvents(visibleEvents),
    [visibleEvents],
  );
  const activePicks = replayed.picks;
  const currentTeam = teamForOverallPick(
    activePicks.length + 1,
    teams,
    league.draftType,
  );
  const maximumPicks = Math.min(
    players.filter((player) => !player.excluded).length,
    teams.length * draftRosterSize(league),
  );
  const complete = activePicks.length >= maximumPicks;
  const evaluation = useMemo(
    () =>
      evaluateUserDraft({
        events: visibleEvents,
        userTeamId: userTeam.id,
        players,
        league,
      }),
    [league, players, userTeam.id, visibleEvents],
  );
  const undoneCount = useMemo(
    () => visibleEvents.filter((event) => event.type === "pick_undone").length,
    [visibleEvents],
  );

  function advanceToUser() {
    const livePicks = replayDraftEvents(events).picks;
    const liveTeam = teamForOverallPick(
      livePicks.length + 1,
      teams,
      league.draftType,
    );
    if (liveTeam.isUser) {
      onOpenDraft();
      return;
    }
    void onRunBusyTask("Simulating to your next pick", () => {
      onEventsChange(
        simulateUntilUserTurn({ events, teams, league, players, seed, strategy }),
      );
      setReplayPosition("live");
    });
  }

  function finishMock() {
    void onRunBusyTask("Finishing the mock draft", () => {
      onEventsChange(
        simulateDraftToEnd({ events, teams, league, players, seed, strategy }),
      );
      setReplayPosition("live");
    });
  }

  return (
    <section className="tool-page mock-page">
      <div className="tool-hero mock-hero">
        <div>
          <p className="eyebrow">Mock Lab</p>
          <h1>Run it. Rewind it. Learn from every pick.</h1>
          <p>
            Opponents follow a repeatable seeded strategy. Every manual pick,
            simulated pick, and undo remains in the event log for exact replay.
          </p>
        </div>
        <div className="mock-controls panel">
          <label><span>Simulation seed</span><Input value={seed} onChange={(event) => onSeedChange(event.target.value || "draft-2026")} /></label>
          <label><span>Opponent strategy</span><select value={strategy} onChange={(event) => onStrategyChange(event.target.value as OpponentStrategy)}><option value="balanced">Balanced</option><option value="best-available">Best available</option><option value="needs-first">Roster needs first</option></select></label>
          <div className="mock-control-actions">
            <Button variant="secondary" size="sm" onClick={advanceToUser} disabled={complete}>{currentTeam.isUser ? "Make my pick" : "Advance to my pick"}</Button>
            <Button size="sm" onClick={finishMock} disabled={complete}>Finish mock</Button>
          </div>
        </div>
      </div>

      <div className="mock-summary-grid">
        <section className="evaluation-card panel">
          <div className="draft-grade"><span>Draft score</span><strong>{evaluation.score}</strong><small>/ 100</small></div>
          <div className="evaluation-metrics">
            <div><span>Starter projection</span><strong>{evaluation.starterProjectedPoints}</strong></div>
            <div><span>Open starter slots</span><strong>{evaluation.openStarterSlots}</strong></div>
            <div><span>Recommendation match</span><strong>{evaluation.recommendationMatches}/{evaluation.userPicks}</strong></div>
            <div><span>Value vs. ADP</span><strong>{evaluation.averageValueVsAdp > 0 ? "+" : ""}{evaluation.averageValueVsAdp}</strong></div>
          </div>
        </section>

        <section className="replay-card panel">
          <div className="section-heading">
            <div><p className="eyebrow">Exact replay</p><h2>Event {throughSequence} of {maximumSequence}</h2></div>
            <Button variant="outline" size="sm" onClick={() => setReplayPosition("live")} disabled={replayPosition === "live"}>Jump to live</Button>
          </div>
          <input
            className="replay-slider"
            type="range"
            min="0"
            max={Math.max(1, maximumSequence)}
            value={throughSequence}
            onChange={(event) => setReplayPosition(Number(event.target.value))}
            aria-label="Replay event position"
          />
          <div className="replay-meta"><span>{activePicks.length} active picks</span><span>{undoneCount} correction events</span><span>{replayPosition === "live" ? "Live state" : "Historical state"}</span></div>
        </section>
      </div>

      <div className="mock-workspace">
        <section className="mock-board panel">
          <div className="section-heading mock-section-heading">
            <div><p className="eyebrow">League board</p><h2>Roster construction</h2></div>
            <span className="local-badge">{activePicks.length}/{maximumPicks} picks</span>
          </div>
          <div className="team-board-grid">
            {teams.map((team) => {
              const rosterIds = playerIdsForTeam(activePicks, team.id);
              const roster = rosterIds
                .map((id) => players.find((player) => player.id === id))
                .filter((player): player is Player => Boolean(player));
              const assignment = assignRoster(roster, league.rosterSlots);
              return (
                <article className={`team-board-card ${team.isUser ? "user-team" : ""}`} key={team.id}>
                  <header><span>{team.draftSlot}</span><strong>{team.name}</strong><small>{assignment.starters.length}/{league.rosterSlots.length}</small></header>
                  <div className="team-picks">
                    {roster.map((player) => <span key={player.id}><b>{player.positions[0]}</b>{player.name}</span>)}
                    {roster.length === 0 && <em>No picks yet</em>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="event-timeline panel">
          <div className="section-heading">
            <div><p className="eyebrow">Decision history</p><h2>Pick replay</h2></div>
            <Button variant="ghost" size="sm" onClick={() => void onRunBusyTask("Resetting the mock draft", () => { onResetDraft(); setReplayPosition("live"); })}>Reset</Button>
          </div>
          <div className="timeline-list">
            {[...replayed.activePickEvents].reverse().map((event) => {
              const player = players.find((candidate) => candidate.id === event.pick.playerId);
              const team = teams.find((candidate) => candidate.id === event.pick.teamId);
              if (!player || !team) return null;
              const followed = event.recommendedPlayerId === event.pick.playerId;
              return (
                <div className={`timeline-event ${team.isUser ? "user-pick" : ""}`} key={event.id}>
                  <span>{event.pick.overall}</span>
                  <div><strong>{player.name}</strong><small>{team.name} · {event.source}{team.isUser && event.recommendedPlayerId ? followed ? " · followed recommendation" : " · chose an alternative" : ""}</small></div>
                  <b>{player.positions[0]}</b>
                </div>
              );
            })}
            {replayed.activePickEvents.length === 0 && <p className="empty-state-copy">Move the replay slider or start the mock to populate the timeline.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
