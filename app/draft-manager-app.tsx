"use client";

import { useState, useSyncExternalStore } from "react";
import { DraftRoom } from "./draft-room";
import { LeagueSettings } from "./league-settings";
import { MockLab } from "./mock-lab";
import { OfflineBridge } from "./offline-bridge";
import { RankingsStudio } from "./rankings-studio";
import { eventsFromPicks } from "@/lib/domain/draft-session";
import {
  clearLocalDraftSnapshot,
  getLocalDraftSnapshot,
  getServerDraftSnapshot,
  saveLocalDraftSnapshot,
  subscribeToLocalDraft,
} from "@/lib/local-draft-store";
import {
  createDefaultOfflinePackage,
  type OfflineDraftPackage,
} from "@/lib/offline-package";
import { buildInitialDemoPicks } from "@/lib/sample-data";
import type {
  LeagueSettings as LeagueSettingsModel,
  OpponentStrategy,
  Player,
} from "@/lib/domain/types";

type AppView = "draft" | "mock" | "rankings" | "league" | "offline";

const DEFAULT_STATE = createDefaultOfflinePackage();

export function DraftManagerApp() {
  const [view, setView] = useState<AppView>("draft");
  const storedState = useSyncExternalStore(
    subscribeToLocalDraft,
    getLocalDraftSnapshot,
    getServerDraftSnapshot,
  );
  const state = storedState ?? DEFAULT_STATE;
  const { league, players, events, simulationSeed, opponentStrategy } = state;

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "draft", label: "Draft room" },
    { id: "mock", label: "Mock Lab" },
    { id: "rankings", label: "Rankings" },
    { id: "league", label: "League setup" },
    { id: "offline", label: "Offline Bridge" },
  ];

  function saveState(changes: Partial<OfflineDraftPackage>) {
    saveLocalDraftSnapshot({ ...state, ...changes });
  }

  function resetDraft(nextLeague = league) {
    saveState({
      events: eventsFromPicks(
        buildInitialDemoPicks(nextLeague.teamCount),
        "provider",
      ),
    });
  }

  function updateLeague(nextLeague: LeagueSettingsModel) {
    const currentShape = `${league.teamCount}:${league.draftType}:${league.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    const nextShape = `${nextLeague.teamCount}:${nextLeague.draftType}:${nextLeague.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    saveState({
      league: nextLeague,
      events:
        currentShape === nextShape
          ? events
          : eventsFromPicks(
              buildInitialDemoPicks(nextLeague.teamCount),
              "provider",
            ),
    });
  }

  function resetEverything() {
    clearLocalDraftSnapshot();
    setView("offline");
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

        <div className="connection-status" title="Offline companion is ready; Yahoo OAuth is awaiting approval">
          <span className="status-dot ready" />
          Offline companion ready
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
          onEventsChange={(nextEvents) => saveState({ events: nextEvents })}
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
          onEventsChange={(nextEvents) => saveState({ events: nextEvents })}
          onSeedChange={(seed: string) => saveState({ simulationSeed: seed })}
          onStrategyChange={(strategy: OpponentStrategy) =>
            saveState({ opponentStrategy: strategy })
          }
          onResetDraft={() => resetDraft()}
          onOpenDraft={() => setView("draft")}
        />
      )}
      {view === "rankings" && (
        <RankingsStudio
          players={players}
          onPlayersChange={(nextPlayers: Player[]) =>
            saveState({ players: nextPlayers })
          }
          onReset={() =>
            saveState({ players: createDefaultOfflinePackage().players })
          }
        />
      )}
      {view === "league" && (
        <LeagueSettings
          league={league}
          players={players}
          onLeagueChange={updateLeague}
          onReset={() => {
            const restored = createDefaultOfflinePackage();
            saveState({ league: restored.league, events: restored.events });
          }}
        />
      )}
      {view === "offline" && (
        <OfflineBridge
          state={state}
          onImport={(imported) => saveLocalDraftSnapshot(imported)}
          onReset={resetEverything}
          onNavigate={setView}
        />
      )}
    </main>
  );
}
