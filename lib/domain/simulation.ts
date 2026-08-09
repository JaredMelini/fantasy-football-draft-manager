import {
  draftRosterSize,
  picksUntilTeamTurn,
  playerIdsForTeam,
  roundForOverallPick,
  teamForOverallPick,
} from "./draft";
import { createPickEvent, replayDraftEvents } from "./draft-session";
import { recommendPlayers } from "./recommendation";
import { assignRoster } from "./roster";
import {
  buildOpponentProfiles,
  chooseModeledOpponentPlayer,
  updateOpponentProfiles,
} from "./opponent-model";
import type {
  DraftEvent,
  DraftTeam,
  LeagueSettings,
  OpponentStrategy,
  Player,
  OpponentProfile,
} from "./types";

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
  const [base] = buildOpponentProfiles(
    [{ id: teamId, name: teamId, draftSlot: 1 }],
    seed,
  );
  if (!base) return available[0];
  const profile = {
    ...base,
    adpWeight: strategy === "best-available" ? base.adpWeight * 1.25 : base.adpWeight,
    needWeight: strategy === "needs-first" ? base.needWeight * 1.7 :
      strategy === "best-available" ? base.needWeight * 0.55 : base.needWeight,
  };
  return chooseModeledOpponentPlayer({
    available,
    roster,
    league,
    overall,
    seed,
    profile,
  });
}

function appendSimulatedPick(input: {
  events: DraftEvent[];
  teams: DraftTeam[];
  league: LeagueSettings;
  players: Player[];
  seed: string;
  strategy: OpponentStrategy;
  autoPickUser: boolean;
  opponentProfiles?: OpponentProfile[];
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
      teams: input.teams,
      seed: input.seed,
      simulationCount: 32,
      limit: input.players.length,
    });
    const filledBefore = assignRoster(roster, input.league.rosterSlots).starters.length;
    const dedicatedNeeds = new Set(
      input.league.rosterSlots
        .filter((slot) => slot.eligiblePositions.length === 1)
        .map((slot) => slot.eligiblePositions[0])
        .filter((position, _index, positions) => {
          const required = positions.filter((item) => item === position).length;
          const rostered = roster.filter((player) =>
            player.positions.includes(position),
          ).length;
          return rostered < required;
        }),
    );
    selected =
      recommendations.find(
        ({ player }) =>
          player.positions.some((position) => dedicatedNeeds.has(position)) &&
          assignRoster([...roster, player], input.league.rosterSlots).starters
            .length > filledBefore,
      )?.player ??
      recommendations.find(
        ({ player }) =>
          assignRoster([...roster, player], input.league.rosterSlots).starters
            .length > filledBefore,
      )?.player ?? recommendations[0]?.player;
    recommendedPlayerId = selected?.id;
  } else {
    const profiles = updateOpponentProfiles(
      buildOpponentProfiles(input.teams, input.seed, input.opponentProfiles),
      picks,
      input.players,
    );
    const modeledProfile = profiles.find((profile) => profile.teamId === team.id);
    selected = chooseOpponentPlayer({
      available,
      roster,
      league: input.league,
      overall,
      seed: input.seed,
      teamId: team.id,
      strategy: input.strategy,
    });
    if (modeledProfile) {
      const adjustedProfile = {
        ...modeledProfile,
        adpWeight:
          input.strategy === "best-available"
            ? modeledProfile.adpWeight * 1.25
            : modeledProfile.adpWeight,
        needWeight:
          input.strategy === "needs-first"
            ? modeledProfile.needWeight * 1.7
            : input.strategy === "best-available"
              ? modeledProfile.needWeight * 0.55
              : modeledProfile.needWeight,
      };
      selected = chooseModeledOpponentPlayer({
        available,
        roster,
        league: input.league,
        overall,
        seed: input.seed,
        profile: adjustedProfile,
      });
    }
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
  opponentProfiles?: OpponentProfile[];
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
  opponentProfiles?: OpponentProfile[];
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
  opponentProfiles?: OpponentProfile[];
}): DraftEvent[] {
  let events = [...input.events];
  const maximumPicks = Math.min(
    input.maximumPicks ?? input.teams.length * draftRosterSize(input.league),
    input.players.filter((player) => !player.excluded).length,
  );

  while (replayDraftEvents(events).picks.length < maximumPicks) {
    const next = appendSimulatedPick({ ...input, events, autoPickUser: true });
    if (next.length === events.length) break;
    events = next;
  }
  return events;
}
