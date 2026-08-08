import type {
  DraftEvent,
  LeagueSettings,
  OpponentStrategy,
  Player,
} from "./domain/types";
import { starterPlayers, yahooLeague } from "./sample-data";

export const OFFLINE_PACKAGE_VERSION = 1;

export interface OfflineDraftPackage {
  version: typeof OFFLINE_PACKAGE_VERSION;
  exportedAt: string;
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  simulationSeed: string;
  opponentStrategy: OpponentStrategy;
}

function cloneLeague(league: LeagueSettings): LeagueSettings {
  return {
    ...league,
    rosterSlots: league.rosterSlots.map((slot) => ({
      ...slot,
      eligiblePositions: [...slot.eligiblePositions],
    })),
    scoringRules: league.scoringRules.map((rule) => ({ ...rule })),
  };
}

function clonePlayers(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    positions: [...player.positions],
    projectedStats: { ...player.projectedStats },
    externalIds: player.externalIds ? { ...player.externalIds } : undefined,
  }));
}

export function createDefaultOfflinePackage(): OfflineDraftPackage {
  return {
    version: OFFLINE_PACKAGE_VERSION,
    exportedAt: new Date(0).toISOString(),
    league: cloneLeague(yahooLeague),
    players: clonePlayers(starterPlayers),
    events: [],
    simulationSeed: "sunday-night-2026",
    opponentStrategy: "balanced",
  };
}

function clonePackage(
  state: OfflineDraftPackage,
  exportedAt: string,
): OfflineDraftPackage {
  return {
    ...state,
    exportedAt,
    league: cloneLeague(state.league),
    players: clonePlayers(state.players),
    events: state.events.map((event) =>
      event.type === "pick_made"
        ? { ...event, pick: { ...event.pick } }
        : { ...event },
    ),
  };
}

export function packageForExport(
  state: OfflineDraftPackage,
): OfflineDraftPackage {
  return clonePackage(state, new Date().toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeague(value: unknown): value is LeagueSettings {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.teamCount === "number" &&
    ["snake", "linear", "salary-cap"].includes(String(value.draftType)) &&
    typeof value.scoringLabel === "string" &&
    Array.isArray(value.scoringRules) &&
    Array.isArray(value.rosterSlots)
  );
}

function isPlayer(value: unknown): value is Player {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.nflTeam === "string" &&
    Array.isArray(value.positions) &&
    typeof value.userRank === "number" &&
    typeof value.adp === "number" &&
    isRecord(value.projectedStats)
  );
}

function isDraftEvent(value: unknown): value is DraftEvent {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.sequence !== "number" ||
    !["manual", "simulated", "provider"].includes(String(value.source))
  ) {
    return false;
  }
  if (value.type === "pick_undone") return typeof value.targetEventId === "string";
  if (value.type !== "pick_made" || !isRecord(value.pick)) return false;
  return (
    typeof value.pick.overall === "number" &&
    typeof value.pick.round === "number" &&
    typeof value.pick.teamId === "string" &&
    typeof value.pick.playerId === "string"
  );
}

export function parseOfflinePackage(text: string): OfflineDraftPackage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!isRecord(value) || value.version !== OFFLINE_PACKAGE_VERSION) {
    throw new Error(`Expected offline package version ${OFFLINE_PACKAGE_VERSION}.`);
  }
  if (typeof value.exportedAt !== "string") {
    throw new Error("Package export date is missing.");
  }
  if (!isLeague(value.league)) throw new Error("League settings are missing or invalid.");
  if (!Array.isArray(value.players) || !value.players.every(isPlayer)) {
    throw new Error("Player rankings are missing or invalid.");
  }
  if (!Array.isArray(value.events) || !value.events.every(isDraftEvent)) {
    throw new Error("Draft history is missing or invalid.");
  }
  if (typeof value.simulationSeed !== "string") {
    throw new Error("Simulation seed is missing.");
  }
  if (!["balanced", "best-available", "needs-first"].includes(String(value.opponentStrategy))) {
    throw new Error("Opponent strategy is invalid.");
  }

  return clonePackage(
    value as unknown as OfflineDraftPackage,
    value.exportedAt,
  );
}
