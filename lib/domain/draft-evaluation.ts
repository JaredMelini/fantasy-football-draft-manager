import { playerIdsForTeam } from "./draft";
import { replayDraftEvents } from "./draft-session";
import { assignRoster } from "./roster";
import { calculateFantasyPoints } from "./scoring";
import type { DraftEvent, LeagueSettings, Player } from "./types";

export interface DraftEvaluation {
  score: number;
  starterProjectedPoints: number;
  rosterProjectedPoints: number;
  openStarterSlots: number;
  benchPlayers: number;
  recommendationMatches: number;
  userPicks: number;
  averageValueVsAdp: number;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function evaluateUserDraft(input: {
  events: DraftEvent[];
  userTeamId: string;
  players: Player[];
  league: LeagueSettings;
}): DraftEvaluation {
  const replayed = replayDraftEvents(input.events);
  const playerIds = playerIdsForTeam(replayed.picks, input.userTeamId);
  const roster = playerIds
    .map((playerId) => input.players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
  const assignment = assignRoster(roster, input.league.rosterSlots);
  const userEvents = replayed.activePickEvents.filter(
    (event) => event.pick.teamId === input.userTeamId,
  );
  const recommendationMatches = userEvents.filter(
    (event) =>
      event.recommendedPlayerId &&
      event.recommendedPlayerId === event.pick.playerId,
  ).length;
  const averageValueVsAdp =
    userEvents.length === 0
      ? 0
      : userEvents.reduce((total, event) => {
          const player = input.players.find(
            (candidate) => candidate.id === event.pick.playerId,
          );
          return total + (player ? player.adp - event.pick.overall : 0);
        }, 0) / userEvents.length;
  const starterProjectedPoints = assignment.starters.reduce(
    (total, starter) =>
      total + calculateFantasyPoints(starter.player, input.league.scoringRules),
    0,
  );
  const rosterProjectedPoints = roster.reduce(
    (total, player) =>
      total + calculateFantasyPoints(player, input.league.scoringRules),
    0,
  );
  const fillRate =
    input.league.rosterSlots.length === 0
      ? 0
      : assignment.starters.length / input.league.rosterSlots.length;
  const adherenceRate =
    userEvents.length === 0 ? 0 : recommendationMatches / userEvents.length;
  const valueScore = Math.max(-10, Math.min(10, averageValueVsAdp));
  const score = Math.round(
    Math.max(0, Math.min(100, 45 + fillRate * 40 + adherenceRate * 10 + valueScore / 2)),
  );

  return {
    score,
    starterProjectedPoints: round(starterProjectedPoints),
    rosterProjectedPoints: round(rosterProjectedPoints),
    openStarterSlots: assignment.openSlots.length,
    benchPlayers: assignment.bench.length,
    recommendationMatches,
    userPicks: userEvents.length,
    averageValueVsAdp: round(averageValueVsAdp),
  };
}
