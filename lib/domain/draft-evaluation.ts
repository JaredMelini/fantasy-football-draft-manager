import { playerIdsForTeam } from "./draft";
import { replayDraftEvents } from "./draft-session";
import { assignOptimalRoster } from "./roster";
import { calculateFantasyPoints, estimateLeagueReplacementLevels } from "./scoring";
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
  const assignment = assignOptimalRoster(
    roster,
    input.league.rosterSlots,
    (player) => calculateFantasyPoints(player, input.league.scoringRules),
  );
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
  const levels = estimateLeagueReplacementLevels(input.players, input.league);
  const starterValue = assignment.starters.reduce((total, starter) => {
    const points = calculateFantasyPoints(starter.player, input.league.scoringRules);
    const baseline = Math.min(
      ...starter.player.positions.map((position) => levels.waiver[position]),
    );
    return total + Math.max(0, points - baseline);
  }, 0);
  const benchOptionValue = assignment.bench.reduce((total, player) => {
    const points = calculateFantasyPoints(player, input.league.scoringRules);
    const baseline = Math.min(...player.positions.map((position) => levels.waiver[position]));
    return total + Math.max(0, points - baseline) * (0.08 + player.risk * 0.06);
  }, 0);
  const strengthPerStarter = starterValue / Math.max(1, input.league.rosterSlots.length);
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        25 + fillRate * 35 + strengthPerStarter * 0.55 + benchOptionValue * 0.22,
      ),
    ),
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
