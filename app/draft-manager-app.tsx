"use client";

import { useState } from "react";
import { DraftRoom } from "./draft-room";
import { LeagueSettings } from "./league-settings";
import { MockLab } from "./mock-lab";
import { RankingsStudio } from "./rankings-studio";
import { eventsFromPicks } from "@/lib/domain/draft-session";
import {
  buildInitialDemoPicks,
  demoLeague,
  demoPlayers,
} from "@/lib/sample-data";
import type {
  DraftEvent,
  LeagueSettings as LeagueSettingsModel,
  OpponentStrategy,
  Player,
} from "@/lib/domain/types";

type AppView = "draft" | "mock" | "rankings" | "league";

function freshLeague(): LeagueSettingsModel {
  return {
    ...demoLeague,
    rosterSlots: demoLeague.rosterSlots.map((slot) => ({
      ...slot,
      eligiblePositions: [...slot.eligiblePositions],
    })),
    scoringRules: demoLeague.scoringRules.map((rule) => ({ ...rule })),
  };
}

function freshPlayers(): Player[] {
  return demoPlayers.map((player) => ({
    ...player,
    positions: [...player.positions],
    projectedStats: { ...player.projectedStats },
    externalIds: player.externalIds ? { ...player.externalIds } : undefined,
  }));
}

function freshDraftEvents(league: LeagueSettingsModel): DraftEvent[] {
  return eventsFromPicks(buildInitialDemoPicks(league.teamCount), "provider");
}

export function DraftManagerApp() {
  const [view, setView] = useState<AppView>("draft");
  const [league, setLeague] = useState<LeagueSettingsModel>(freshLeague);
  const [players, setPlayers] = useState<Player[]>(freshPlayers);
  const [events, setEvents] = useState<DraftEvent[]>(() =>
    freshDraftEvents(demoLeague),
  );
  const [simulationSeed, setSimulationSeed] = useState("sunday-night-2026");
  const [opponentStrategy, setOpponentStrategy] =
    useState<OpponentStrategy>("balanced");

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "draft", label: "Draft room" },
    { id: "mock", label: "Mock Lab" },
    { id: "rankings", label: "Rankings" },
    { id: "league", label: "League setup" },
  ];

  function resetDraft(nextLeague = league) {
    setEvents(freshDraftEvents(nextLeague));
  }

  function updateLeague(nextLeague: LeagueSettingsModel) {
    const currentShape = `${league.teamCount}:${league.draftType}:${league.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    const nextShape = `${nextLeague.teamCount}:${nextLeague.draftType}:${nextLeague.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    setLeague(nextLeague);
    if (currentShape !== nextShape) resetDraft(nextLeague);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setView("draft")}>
          <span className="brand-mark">FF</span>
          <span>
            <strong>Draft Intelligence</strong>
            <small>Fantasy football manager</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="connection-status" title="Yahoo connection is awaiting API approval">
          <span className="status-dot" />
          Yahoo approval pending
        </div>
      </header>

      {view === "draft" && (
        <DraftRoom
          key={`${league.teamCount}-${league.draftType}`}
          league={league}
          players={players}
          events={events}
          seed={simulationSeed}
          strategy={opponentStrategy}
          onEventsChange={setEvents}
          onResetDraft={() => resetDraft()}
        />
      )}
      {view === "mock" && (
        <MockLab
          league={league}
          players={players}
          events={events}
          seed={simulationSeed}
          strategy={opponentStrategy}
          onEventsChange={setEvents}
          onSeedChange={setSimulationSeed}
          onStrategyChange={setOpponentStrategy}
          onResetDraft={() => resetDraft()}
          onOpenDraft={() => setView("draft")}
        />
      )}
      {view === "rankings" && (
        <RankingsStudio
          players={players}
          onPlayersChange={setPlayers}
          onReset={() => setPlayers(freshPlayers())}
        />
      )}
      {view === "league" && (
        <LeagueSettings
          league={league}
          players={players}
          onLeagueChange={updateLeague}
          onReset={() => {
            const restored = freshLeague();
            setLeague(restored);
            resetDraft(restored);
          }}
        />
      )}
    </main>
  );
}
