import { roundForOverallPick, teamForOverallPick } from "./draft";
import type {
  DraftEvent,
  DraftEventSource,
  DraftPick,
  DraftPickEvent,
  DraftTeam,
  LeagueSettings,
  Player,
} from "./types";

export interface ReplayedDraft {
  picks: DraftPick[];
  activePickEvents: DraftPickEvent[];
}

export interface DraftPickValidation {
  valid: boolean;
  errors: string[];
}

export function nextDraftEventSequence(events: DraftEvent[]): number {
  return Math.max(0, ...events.map((event) => event.sequence)) + 1;
}

export function createPickEvent(input: {
  events: DraftEvent[];
  pick: DraftPick;
  source: DraftEventSource;
  recommendedPlayerId?: string;
}): DraftPickEvent {
  const sequence = nextDraftEventSequence(input.events);
  return {
    id: `pick-${sequence}-${input.pick.overall}-${input.pick.playerId}`,
    sequence,
    type: "pick_made",
    source: input.source,
    pick: input.pick,
    recommendedPlayerId: input.recommendedPlayerId,
  };
}

export function createUndoEvent(
  events: DraftEvent[],
  source: DraftEventSource = "manual",
): DraftEvent | undefined {
  const replayed = replayDraftEvents(events);
  const target = replayed.activePickEvents.at(-1);
  if (!target) return undefined;
  const sequence = nextDraftEventSequence(events);
  return {
    id: `undo-${sequence}-${target.id}`,
    sequence,
    type: "pick_undone",
    source,
    targetEventId: target.id,
  };
}

export function replayDraftEvents(
  events: DraftEvent[],
  throughSequence = Number.POSITIVE_INFINITY,
): ReplayedDraft {
  const seen = new Set<string>();
  const active = new Map<string, DraftPickEvent>();
  const ordered = [...events].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );

  for (const event of ordered) {
    if (event.sequence > throughSequence || seen.has(event.id)) continue;
    seen.add(event.id);
    if (event.type === "pick_made") active.set(event.id, event);
    if (event.type === "pick_undone") active.delete(event.targetEventId);
  }

  const activePickEvents = [...active.values()].sort(
    (a, b) => a.pick.overall - b.pick.overall || a.sequence - b.sequence,
  );
  return {
    activePickEvents,
    picks: activePickEvents.map((event) => event.pick),
  };
}

export function mergeDraftEvents(
  existing: DraftEvent[],
  incoming: DraftEvent[],
): DraftEvent[] {
  const byId = new Map(existing.map((event) => [event.id, event]));
  incoming.forEach((event) => {
    if (!byId.has(event.id)) byId.set(event.id, event);
  });
  return [...byId.values()].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
}

export function eventsFromPicks(
  picks: DraftPick[],
  source: DraftEventSource = "provider",
): DraftEvent[] {
  return picks.map((pick, index) => ({
    id: `initial-${pick.overall}-${pick.playerId}`,
    sequence: index + 1,
    type: "pick_made" as const,
    source,
    pick,
  }));
}

export function validateNextPick(input: {
  pick: DraftPick;
  currentPicks: DraftPick[];
  teams: DraftTeam[];
  draftType: LeagueSettings["draftType"];
  players: Player[];
}): DraftPickValidation {
  const { pick, currentPicks, teams, draftType, players } = input;
  const errors: string[] = [];
  const expectedOverall = currentPicks.length + 1;
  const expectedTeam = teamForOverallPick(expectedOverall, teams, draftType);
  const expectedRound = roundForOverallPick(expectedOverall, teams.length);

  if (pick.overall !== expectedOverall) {
    errors.push(`Expected overall pick ${expectedOverall}.`);
  }
  if (pick.round !== expectedRound) {
    errors.push(`Expected round ${expectedRound}.`);
  }
  if (pick.teamId !== expectedTeam.id) {
    errors.push(`Expected ${expectedTeam.name} to pick.`);
  }
  if (!players.some((player) => player.id === pick.playerId)) {
    errors.push("Player is not in the active player pool.");
  }
  if (currentPicks.some((current) => current.playerId === pick.playerId)) {
    errors.push("Player has already been drafted.");
  }

  return { valid: errors.length === 0, errors };
}
