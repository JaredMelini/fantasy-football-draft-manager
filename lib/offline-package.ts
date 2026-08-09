import type {
  DraftEvent,
  LeagueSettings,
  OpponentStrategy,
  OpponentProfile,
  Player,
  DataSnapshot,
} from "./domain/types";
import { buildDemoTeams, starterPlayers, yahooLeague } from "./sample-data";
import { buildOpponentProfiles } from "./domain/opponent-model";

export const OFFLINE_PACKAGE_VERSION = 2;

export interface OfflineDraftPackage {
  version: typeof OFFLINE_PACKAGE_VERSION;
  exportedAt: string;
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  simulationSeed: string;
  opponentStrategy: OpponentStrategy;
  opponentProfiles: OpponentProfile[];
  dataSnapshots: DataSnapshot[];
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
    opponentProfiles: buildOpponentProfiles(
      buildDemoTeams(yahooLeague.teamCount, yahooLeague.userDraftSlot ?? 1),
      "sunday-night-2026",
    ),
    dataSnapshots: [],
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
    opponentProfiles: state.opponentProfiles.map((profile) => ({
      ...profile,
      positionBias: { ...profile.positionBias },
    })),
    dataSnapshots: state.dataSnapshots.map((snapshot) => ({
      ...snapshot,
      positions: [...snapshot.positions],
    })),
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
  if (!isRecord(value) || ![1, OFFLINE_PACKAGE_VERSION].includes(Number(value.version))) {
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

  const migrated = {
    ...value,
    version: OFFLINE_PACKAGE_VERSION,
    opponentProfiles: Array.isArray(value.opponentProfiles)
      ? value.opponentProfiles
      : [],
    dataSnapshots: Array.isArray(value.dataSnapshots) ? value.dataSnapshots : [],
  } as unknown as OfflineDraftPackage;

  return clonePackage(
    migrated,
    value.exportedAt,
  );
}

export function snapshotForPlayers(
  players: Player[],
  kind: DataSnapshot["kind"],
  source: string,
): DataSnapshot {
  const positions = [...new Set(players.flatMap((player) => player.positions))].sort();
  const fingerprint = players
    .map((player) => `${player.id}:${player.userRank}:${player.yahooAdpRecent ?? ""}:${player.yahooAdpAll ?? ""}`)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const importedAt = new Date().toISOString();
  return {
    id: `${kind}-${importedAt}-${(hash >>> 0).toString(16)}`,
    kind,
    source,
    importedAt,
    playerCount: players.length,
    positions,
    fingerprint: (hash >>> 0).toString(16),
  };
}
