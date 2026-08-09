"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  Database,
  FlaskConical,
  LayoutDashboard,
  ListOrdered,
  LoaderCircle,
  ShieldCheck,
  SlidersHorizontal,
  WifiOff,
} from "lucide-react";
import { DraftRoom } from "./draft-room";
import { LeagueSettings } from "./league-settings";
import { MockLab } from "./mock-lab";
import { OfflineBridge } from "./offline-bridge";
import { RankingsStudio } from "./rankings-studio";
import {
  clearLocalDraftSnapshot,
  getLocalDraftSnapshot,
  getServerDraftSnapshot,
  saveLocalDraftSnapshot,
  subscribeToLocalDraft,
} from "@/lib/local-draft-store";
import {
  createDefaultOfflinePackage,
  snapshotForPlayers,
  type OfflineDraftPackage,
} from "@/lib/offline-package";
import type {
  LeagueSettings as LeagueSettingsModel,
  OpponentStrategy,
  Player,
} from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AppView = "draft" | "mock" | "rankings" | "league" | "offline";

const DEFAULT_STATE = createDefaultOfflinePackage();

export function DraftManagerApp() {
  const [view, setView] = useState<AppView>("draft");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const storedState = useSyncExternalStore(
    subscribeToLocalDraft,
    getLocalDraftSnapshot,
    getServerDraftSnapshot,
  );
  const state = storedState ?? DEFAULT_STATE;
  const { league, players, events, simulationSeed, opponentStrategy, opponentProfiles } = state;

  const navItems = [
    { id: "draft" as const, label: "Draft Room", detail: "Live decisions", icon: LayoutDashboard },
    { id: "mock" as const, label: "Mock Lab", detail: "Practice & replay", icon: FlaskConical },
    { id: "rankings" as const, label: "Rankings", detail: "Your player board", icon: ListOrdered },
    { id: "league" as const, label: "League Setup", detail: "Scoring & rosters", icon: SlidersHorizontal },
    { id: "offline" as const, label: "Data & Backup", detail: "Offline Bridge", icon: Database },
  ];
  const activeNav = navItems.find((item) => item.id === view)!;

  const runBusyTask = useCallback(
    async (label: string, task: () => void | Promise<void>) => {
      setBusyLabel(label);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      );
      try {
        await task();
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => resolve()),
        );
      } finally {
        setBusyLabel(null);
      }
    },
    [],
  );

  function saveState(changes: Partial<OfflineDraftPackage>) {
    saveLocalDraftSnapshot({ ...state, ...changes });
  }

  function resetDraft() {
    saveState({ events: [] });
  }

  function updateLeague(nextLeague: LeagueSettingsModel) {
    const currentShape = `${league.teamCount}:${league.draftType}:${league.userDraftSlot ?? "pending"}:${league.benchSlots ?? 0}:${league.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    const nextShape = `${nextLeague.teamCount}:${nextLeague.draftType}:${nextLeague.userDraftSlot ?? "pending"}:${nextLeague.benchSlots ?? 0}:${nextLeague.rosterSlots.map((slot) => `${slot.label}-${slot.eligiblePositions.join("/")}`).join("|")}`;
    saveState({
      league: nextLeague,
      events:
        currentShape === nextShape
          ? events
          : [],
    });
  }

  function resetEverything() {
    clearLocalDraftSnapshot();
    setView("offline");
  }

  return (
    <main className="app-shell" aria-busy={Boolean(busyLabel)}>
      {busyLabel && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <div className="busy-card">
            <LoaderCircle aria-hidden="true" />
            <strong>{busyLabel}</strong>
            <span>This should only take a moment.</span>
          </div>
        </div>
      )}
      <aside className="app-sidebar">
        <Button variant="ghost" className="sidebar-brand" onClick={() => setView("draft")}>
          <span className="brand-mark">DI</span>
          <span className="brand-copy">
            <strong>Draft Intelligence</strong>
            <small>Fantasy football</small>
          </span>
        </Button>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Button
              variant="ghost"
              className={`sidebar-nav-item ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </Button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="privacy-chip"><ShieldCheck /><span><strong>Private workspace</strong><small>Saved on this device</small></span></div>
          <Badge variant="success" className="sidebar-status"><WifiOff /> Offline companion ready</Badge>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <span>{activeNav.detail}</span>
            <strong>{activeNav.label}</strong>
          </div>
          <Badge variant="success" className="header-status"><span className="status-dot ready" /> Ready without Yahoo API</Badge>
        </header>

        <div className="app-content">
          {view === "draft" && (
            <DraftRoom
              key={`${league.teamCount}-${league.draftType}-${league.userDraftSlot ?? "pending"}`}
              league={league}
              players={players}
              events={events}
              seed={simulationSeed}
              strategy={opponentStrategy}
              opponentProfiles={opponentProfiles}
              onEventsChange={(nextEvents) => saveState({ events: nextEvents })}
              onResetDraft={() => resetDraft()}
              onRunBusyTask={runBusyTask}
            />
          )}
          {view === "mock" && (
            <MockLab
              league={league}
              players={players}
              events={events}
              seed={simulationSeed}
              strategy={opponentStrategy}
              opponentProfiles={opponentProfiles}
              onEventsChange={(nextEvents) => saveState({ events: nextEvents })}
              onSeedChange={(seed: string) => saveState({ simulationSeed: seed })}
              onStrategyChange={(strategy: OpponentStrategy) =>
                saveState({ opponentStrategy: strategy })
              }
              onResetDraft={() => resetDraft()}
              onOpenDraft={() => setView("draft")}
              onRunBusyTask={runBusyTask}
            />
          )}
          {view === "rankings" && (
            <RankingsStudio
              players={players}
              teamCount={league.teamCount}
              onPlayersChange={(nextPlayers: Player[]) =>
                saveState({
                  players: nextPlayers,
                  dataSnapshots: [
                    ...state.dataSnapshots,
                    snapshotForPlayers(
                      nextPlayers,
                      nextPlayers.some((player) => player.yahooAdpUpdatedAt)
                        ? "yahoo-market"
                        : "rankings",
                      nextPlayers.some((player) => player.yahooAdpUpdatedAt)
                        ? "Yahoo + Fantasy Footballers UDK"
                        : "Fantasy Footballers UDK",
                    ),
                  ].slice(-20),
                })
              }
              onReset={() =>
                saveState({ players: [], events: [] })
              }
              onRunBusyTask={runBusyTask}
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
        </div>
      </div>
    </main>
  );
}
