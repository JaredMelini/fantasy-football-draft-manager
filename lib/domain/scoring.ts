import type {
  DraftPick,
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

export function estimateDynamicReplacementBaselines(
  players: Player[],
  league: LeagueSettings,
  picks: DraftPick[] = [],
): Record<PlayerPosition, number> {
  const positions: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];
  const draftedIds = new Set(picks.map((pick) => pick.playerId));
  const available = players.filter(
    (player) => !draftedIds.has(player.id) && !player.excluded,
  );
  const demand = Object.fromEntries(
    positions.map((position) => [position, 0]),
  ) as Record<PlayerPosition, number>;
  const draftedDemand = Object.fromEntries(
    positions.map((position) => [position, 0]),
  ) as Record<PlayerPosition, number>;

  for (const slot of league.rosterSlots) {
    const share = league.teamCount / Math.max(slot.eligiblePositions.length, 1);
    for (const position of slot.eligiblePositions) demand[position] += share;
  }

  for (const pick of picks) {
    const player = players.find((candidate) => candidate.id === pick.playerId);
    if (!player) continue;
    const share = 1 / Math.max(player.positions.length, 1);
    for (const position of player.positions) draftedDemand[position] += share;
  }

  return Object.fromEntries(
    positions.map((position) => {
      const positionalPlayers = available
        .filter((player) => player.positions.includes(position))
        .map((player) => calculateFantasyPoints(player, league.scoringRules))
        .sort((a, b) => b - a);
      const remainingStarterDemand = Math.max(
        1,
        Math.round(demand[position] - draftedDemand[position]),
      );
      const replacementIndex = Math.min(
        remainingStarterDemand - 1,
        Math.max(positionalPlayers.length - 1, 0),
      );
      return [position, positionalPlayers[replacementIndex] ?? 0];
    }),
  ) as Record<PlayerPosition, number>;
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
