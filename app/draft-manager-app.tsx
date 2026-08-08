"use client";

import { useState } from "react";
import { DraftRoom } from "./draft-room";
import { LeagueSettings } from "./league-settings";
import { RankingsStudio } from "./rankings-studio";
import { demoLeague, demoPlayers } from "@/lib/sample-data";
import type { LeagueSettings as LeagueSettingsModel, Player } from "@/lib/domain/types";

type AppView = "draft" | "rankings" | "league";

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

export function DraftManagerApp() {
  const [view, setView] = useState<AppView>("draft");
  const [league, setLeague] = useState<LeagueSettingsModel>(freshLeague);
  const [players, setPlayers] = useState<Player[]>(freshPlayers);

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "draft", label: "Draft room" },
    { id: "rankings", label: "Rankings" },
    { id: "league", label: "League setup" },
  ];

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
          onLeagueChange={setLeague}
          onReset={() => setLeague(freshLeague())}
        />
      )}
    </main>
  );
}
