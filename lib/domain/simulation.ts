import {
  picksUntilTeamTurn,
  playerIdsForTeam,
  roundForOverallPick,
  teamForOverallPick,
} from "./draft";
import { createPickEvent, replayDraftEvents } from "./draft-session";
import { recommendPlayers } from "./recommendation";
import { assignRoster } from "./roster";
import type {
  DraftEvent,
  DraftTeam,
  LeagueSettings,
  OpponentStrategy,
  Player,
} from "./types";

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function deterministicNoise(seed: string, key: string): number {
  let value = hash(`${seed}:${key}`) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function chooseOpponentPlayer(input: {
  available: Player[];
  roster: Player[];
  league: LeagueSettings;
  overall: number;
  seed: string;
  teamId: string;
  strategy: OpponentStrategy;
}): Player | undefined {
  const { available, roster, league, overall, seed, teamId, strategy } = input;
  const filledBefore = assignRoster(roster, league.rosterSlots).starters.length;
  const needWeight =
    strategy === "needs-first" ? 70 : strategy === "balanced" ? 34 : 8;
  const marketWeight = strategy === "best-available" ? 1.35 : 1;
  const rankWeight = strategy === "best-available" ? 0.15 : 0.35;

  return [...available]
    .map((player) => {
      const filledAfter = assignRoster(
        [...roster, player],
        league.rosterSlots,
      ).starters.length;
      const fillsNeed = filledAfter > filledBefore ? 1 : 0;
      const marketValue = 110 - Math.abs(player.adp - overall) - player.adp * 0.2;
      const personalValue = 100 - player.userRank;
      const jitter = deterministicNoise(seed, `${overall}:${teamId}:${player.id}`) * 7;
      return {
        player,
        score:
          marketValue * marketWeight +
          personalValue * rankWeight +
          fillsNeed * needWeight +
          jitter,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.player.userRank - b.player.userRank,
    )[0]?.player;
}

function appendSimulatedPick(input: {
  events: DraftEvent[];
  teams: DraftTeam[];
  league: LeagueSettings;
  players: Player[];
  seed: string;
  strategy: OpponentStrategy;
  autoPickUser: boolean;
}): DraftEvent[] {
  const replayed = replayDraftEvents(input.events);
  const picks = replayed.picks;
  const draftedIds = new Set(picks.map((pick) => pick.playerId));
  const available = input.players.filter(
    (player) => !draftedIds.has(player.id) && !player.excluded,
  );
  if (available.length === 0) return input.events;

  const overall = picks.length + 1;
  const team = teamForOverallPick(overall, input.teams, input.league.draftType);
  if (team.isUser && !input.autoPickUser) return input.events;
  const rosterIds = playerIdsForTeam(picks, team.id);
  const roster = input.players.filter((player) => rosterIds.includes(player.id));

  let selected: Player | undefined;
  let recommendedPlayerId: string | undefined;
  if (team.isUser) {
    const nextTurnGap =
      1 +
      picksUntilTeamTurn(
        overall + 1,
        team.id,
        input.teams,
        input.league.draftType,
      );
    const recommendations = recommendPlayers({
      players: input.players,
      league: input.league,
      picks,
      userRoster: roster,
      currentOverall: overall,
      picksUntilNextTurn: nextTurnGap,
      limit: input.players.length,
    });
    const filledBefore = assignRoster(roster, input.league.rosterSlots).starters.length;
    selected =
      recommendations.find(
        ({ player }) =>
          assignRoster([...roster, player], input.league.rosterSlots).starters
            .length > filledBefore,
      )?.player ?? recommendations[0]?.player;
    recommendedPlayerId = selected?.id;
  } else {
    selected = chooseOpponentPlayer({
      available,
      roster,
      league: input.league,
      overall,
      seed: input.seed,
      teamId: team.id,
      strategy: input.strategy,
    });
  }
  if (!selected) return input.events;

  return [
    ...input.events,
    createPickEvent({
      events: input.events,
      source: "simulated",
      recommendedPlayerId,
      pick: {
        overall,
        round: roundForOverallPick(overall, input.teams.length),
        teamId: team.id,
        playerId: selected.id,
      },
    }),
  ];
}

export function simulateNextPick(input: {
  events: DraftEvent[];
  teams: DraftTeam[];
  league: LeagueSettings;
  players: Player[];
  seed: string;
  strategy: OpponentStrategy;
}): DraftEvent[] {
  return appendSimulatedPick({ ...input, autoPickUser: false });
}

export function simulateUntilUserTurn(input: {
  events: DraftEvent[];
  teams: DraftTeam[];
  league: LeagueSettings;
  players: Player[];
  seed: string;
  strategy: OpponentStrategy;
}): DraftEvent[] {
  let events = [...input.events];
  const safetyLimit = input.teams.length * 2;

  for (let index = 0; index < safetyLimit; index += 1) {
    const picks = replayDraftEvents(events).picks;
    const team = teamForOverallPick(
      picks.length + 1,
      input.teams,
      input.league.draftType,
    );
    if (team.isUser) break;
    const next = appendSimulatedPick({ ...input, events, autoPickUser: false });
    if (next.length === events.length) break;
    events = next;
  }
  return events;
}

export function simulateDraftToEnd(input: {
  events: DraftEvent[];
  teams: DraftTeam[];
  league: LeagueSettings;
  players: Player[];
  seed: string;
  strategy: OpponentStrategy;
  maximumPicks?: number;
}): DraftEvent[] {
  let events = [...input.events];
  const maximumPicks = Math.min(
    input.maximumPicks ?? input.teams.length * input.league.rosterSlots.length,
    input.players.filter((player) => !player.excluded).length,
  );

  while (replayDraftEvents(events).picks.length < maximumPicks) {
    const next = appendSimulatedPick({ ...input, events, autoPickUser: true });
    if (next.length === events.length) break;
    events = next;
  }
  return events;
}
