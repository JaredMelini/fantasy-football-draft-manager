import { assignedStarterCount } from "./draft";
import { calculateFantasyPoints, estimateReplacementBaselines } from "./scoring";
import type {
  DraftPick,
  LeagueSettings,
  Player,
  PlayerRecommendation,
} from "./types";

interface RecommendPlayersInput {
  players: Player[];
  league: LeagueSettings;
  picks: DraftPick[];
  userRoster: Player[];
  currentOverall: number;
  picksUntilNextTurn: number;
  limit?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function recommendPlayers({
  players,
  league,
  picks,
  userRoster,
  currentOverall,
  picksUntilNextTurn,
  limit = 8,
}: RecommendPlayersInput): PlayerRecommendation[] {
  const draftedPlayerIds = new Set(picks.map((pick) => pick.playerId));
  const available = players.filter(
    (player) => !draftedPlayerIds.has(player.id) && !player.excluded,
  );
  const baselines = estimateReplacementBaselines(players, league);
  const maximumRank = Math.max(...players.map((player) => player.userRank), 1);
  const filledBefore = assignedStarterCount(userRoster, league.rosterSlots);
  const nextUserPick = currentOverall + picksUntilNextTurn;

  return available
    .map((player) => {
      const projectedPoints = calculateFantasyPoints(
        player,
        league.scoringRules,
      );
      const replacementBaseline = Math.min(
        ...player.positions.map((position) => baselines[position]),
      );
      const replacementValue = projectedPoints - replacementBaseline;
      const personalRankValue =
        ((maximumRank - player.userRank + 1) / maximumRank) * 10;
      const filledAfter = assignedStarterCount(
        [...userRoster, player],
        league.rosterSlots,
      );
      const rosterFit = filledAfter > filledBefore ? 5 : 0.8;

      const samePosition = available
        .filter(
          (candidate) =>
            candidate.id !== player.id &&
            candidate.positions.some((position) =>
              player.positions.includes(position),
            ),
        )
        .map((candidate) =>
          calculateFantasyPoints(candidate, league.scoringRules),
        )
        .sort((a, b) => b - a);
      const nextBest = samePosition.find((points) => points <= projectedPoints) ?? 0;
      const tierScarcity = clamp((projectedPoints - nextBest) / 4, 0, 6);

      const spread = Math.max(4, league.teamCount / 2);
      const returnProbability = clamp(
        1 / (1 + Math.exp((nextUserPick - player.adp) / spread)),
        0.02,
        0.98,
      );
      const availabilityUrgency = (1 - returnProbability) * 6;
      const riskPenalty = player.risk * 4;
      const total =
        replacementValue +
        personalRankValue +
        rosterFit +
        tierScarcity +
        availabilityUrgency -
        riskPenalty;

      const explanation = [
        `${round(replacementValue)} points above the ${player.positions[0]} replacement baseline`,
        `${Math.round(returnProbability * 100)}% estimated chance to reach pick ${nextUserPick}`,
        filledAfter > filledBefore
          ? "Fills an open starting-lineup path"
          : "Adds depth rather than a new starter slot",
      ];

      return {
        player,
        breakdown: {
          projectedPoints: round(projectedPoints),
          replacementValue: round(replacementValue),
          personalRankValue: round(personalRankValue),
          rosterFit: round(rosterFit),
          tierScarcity: round(tierScarcity),
          availabilityUrgency: round(availabilityUrgency),
          riskPenalty: round(riskPenalty),
          total: round(total),
        },
        returnProbability,
        explanation,
      };
    })
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, limit);
}
