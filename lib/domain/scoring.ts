import type {
  LeagueSettings,
  Player,
  PlayerPosition,
  ProjectionStat,
} from "./types";

export function calculateFantasyPoints(
  player: Player,
  scoringRules: LeagueSettings["scoringRules"],
): number {
  return scoringRules.reduce((total, rule) => {
    const projectedValue = player.projectedStats[rule.stat] ?? 0;
    return total + projectedValue * rule.pointsPerUnit;
  }, 0);
}

export function findUncoveredScoringStats(
  players: Player[],
  scoringRules: LeagueSettings["scoringRules"],
): ProjectionStat[] {
  return scoringRules
    .map((rule) => rule.stat)
    .filter(
      (stat) => !players.some((player) => player.projectedStats[stat] !== undefined),
    );
}

export function estimateReplacementBaselines(
  players: Player[],
  league: LeagueSettings,
): Record<PlayerPosition, number> {
  const scoredPlayers = players
    .map((player) => ({
      player,
      points: calculateFantasyPoints(player, league.scoringRules),
    }))
    .sort((a, b) => b.points - a.points);

  const selectedStarterIds = new Set<string>();
  const starterDemand: Record<PlayerPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };

  const slots = [...league.rosterSlots].sort(
    (a, b) => a.eligiblePositions.length - b.eligiblePositions.length,
  );

  for (const slot of slots) {
    const eligible = scoredPlayers.filter(
      ({ player }) =>
        !selectedStarterIds.has(player.id) &&
        player.positions.some((position) =>
          slot.eligiblePositions.includes(position),
        ),
    );

    for (const candidate of eligible.slice(0, league.teamCount)) {
      selectedStarterIds.add(candidate.player.id);
      const assignedPosition = candidate.player.positions.find((position) =>
        slot.eligiblePositions.includes(position),
      );
      if (assignedPosition) starterDemand[assignedPosition] += 1;
    }
  }

  const baselines = {} as Record<PlayerPosition, number>;
  for (const position of Object.keys(starterDemand) as PlayerPosition[]) {
    const positionalPlayers = scoredPlayers.filter(({ player }) =>
      player.positions.includes(position),
    );
    const replacementIndex = Math.min(
      starterDemand[position],
      Math.max(positionalPlayers.length - 1, 0),
    );
    baselines[position] = positionalPlayers[replacementIndex]?.points ?? 0;
  }

  return baselines;
}
