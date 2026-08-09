import type {
  DraftPick,
  LeagueSettings,
  Player,
  PlayerPosition,
  ProjectionMode,
  ProjectionStat,
} from "./types";

const positions: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const specialistPositions = new Set<PlayerPosition>(["K", "DST"]);

function emptyPositionRecord(): Record<PlayerPosition, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
}

export function projectionModeForPlayer(player: Player): ProjectionMode {
  if (Object.keys(player.projectedStats).length > 0) {
    return "raw-league-scored";
  }
  if (player.sourceProjectedPoints !== undefined) return "source-total";
  return "rank-only";
}

export function calculateFantasyPoints(
  player: Player,
  scoringRules: LeagueSettings["scoringRules"],
): number {
  const hasModeledStats = scoringRules.some(
    (rule) => player.projectedStats[rule.stat] !== undefined,
  );
  if (hasModeledStats) {
    return scoringRules.reduce((total, rule) => {
      const projectedValue = player.projectedStats[rule.stat] ?? 0;
      return total + projectedValue * rule.pointsPerUnit;
    }, 0);
  }
  return player.sourceProjectedPoints ?? 0;
}

export interface ReplacementLevels {
  lastStarter: Record<PlayerPosition, number>;
  waiver: Record<PlayerPosition, number>;
  starterDemand: Record<PlayerPosition, number>;
  benchDemand: Record<PlayerPosition, number>;
}

/**
 * Solves dedicated slots first, then allocates FLEX/SUPERFLEX demand to the
 * highest-valued remaining eligible players. Bench demand is allocated by
 * marginal value above the last starter, producing a true first-waiver-player
 * line rather than relabeling the last starter as replacement.
 */
export function estimateLeagueReplacementLevels(
  players: Player[],
  league: LeagueSettings,
): ReplacementLevels {
  const eligible = players.filter((player) => !player.excluded);
  const scoredByPosition = Object.fromEntries(
    positions.map((position) => [
      position,
      eligible
        .filter((player) => player.positions.includes(position))
        .map((player) => ({
          player,
          points: calculateFantasyPoints(player, league.scoringRules),
        }))
        .sort(
          (a, b) =>
            b.points - a.points ||
            a.player.userRank - b.player.userRank ||
            a.player.name.localeCompare(b.player.name),
        ),
    ]),
  ) as Record<
    PlayerPosition,
    Array<{ player: Player; points: number }>
  >;
  const starterDemand = emptyPositionRecord();
  const selectedStarterIds = new Set<string>();

  const dedicatedSlots = league.rosterSlots.filter(
    (slot) => slot.eligiblePositions.length === 1,
  );
  for (const slot of dedicatedSlots) {
    const position = slot.eligiblePositions[0];
    let filled = 0;
    for (const candidate of scoredByPosition[position]) {
      if (selectedStarterIds.has(candidate.player.id)) continue;
      selectedStarterIds.add(candidate.player.id);
      starterDemand[position] += 1;
      filled += 1;
      if (filled >= league.teamCount) break;
    }
  }

  const flexibleSlots = league.rosterSlots
    .filter((slot) => slot.eligiblePositions.length > 1)
    .flatMap((slot) =>
      Array.from({ length: league.teamCount }, () => slot),
    )
    .sort(
      (a, b) => a.eligiblePositions.length - b.eligiblePositions.length,
    );

  for (const slot of flexibleSlots) {
    const candidate = slot.eligiblePositions
      .flatMap((position) => scoredByPosition[position])
      .filter(({ player }) => !selectedStarterIds.has(player.id))
      .sort(
        (a, b) =>
          b.points - a.points ||
          a.player.userRank - b.player.userRank ||
          a.player.name.localeCompare(b.player.name),
      )[0];
    if (!candidate) continue;
    selectedStarterIds.add(candidate.player.id);
    const assignedPosition = candidate.player.positions.find((position) =>
      slot.eligiblePositions.includes(position),
    );
    if (assignedPosition) starterDemand[assignedPosition] += 1;
  }

  const lastStarter = emptyPositionRecord();
  for (const position of positions) {
    const positionalStarters = scoredByPosition[position].filter(({ player }) =>
      selectedStarterIds.has(player.id),
    );
    lastStarter[position] =
      positionalStarters.length === 0
        ? 0
        : Math.min(...positionalStarters.map(({ points }) => points));
  }

  const benchCount = Math.max(0, league.benchSlots ?? 0) * league.teamCount;
  const benchCandidates = eligible
    .filter(
      (player) =>
        !selectedStarterIds.has(player.id) &&
        !player.positions.every((position) => specialistPositions.has(position)),
    )
    .map((player) => {
      const points = calculateFantasyPoints(player, league.scoringRules);
      const baseline = Math.min(
        ...player.positions.map((position) => lastStarter[position]),
      );
      return { player, points, marginal: points - baseline };
    })
    .sort(
      (a, b) =>
        b.marginal - a.marginal ||
        b.points - a.points ||
        a.player.userRank - b.player.userRank,
    )
    .slice(0, benchCount);
  const selectedBenchIds = new Set(
    benchCandidates.map(({ player }) => player.id),
  );
  const benchDemand = emptyPositionRecord();
  benchCandidates.forEach(({ player }) => {
    const position = player.positions[0];
    benchDemand[position] += 1;
  });

  const rosteredIds = new Set([...selectedStarterIds, ...selectedBenchIds]);
  const waiver = emptyPositionRecord();
  for (const position of positions) {
    waiver[position] =
      scoredByPosition[position].find(
        ({ player }) => !rosteredIds.has(player.id),
      )?.points ?? lastStarter[position];
  }

  return { lastStarter, waiver, starterDemand, benchDemand };
}

export function estimateDynamicReplacementBaselines(
  players: Player[],
  league: LeagueSettings,
  _picks?: DraftPick[],
): Record<PlayerPosition, number> {
  void _picks;
  return estimateLeagueReplacementLevels(players, league).waiver;
}

export function findUncoveredScoringStats(
  players: Player[],
  scoringRules: LeagueSettings["scoringRules"],
): ProjectionStat[] {
  return scoringRules
    .map((rule) => rule.stat)
    .filter(
      (stat) =>
        !players.some((player) => player.projectedStats[stat] !== undefined),
    );
}

export function projectionCoverageForPlayer(
  player: Player,
  scoringRules: LeagueSettings["scoringRules"],
): { modeled: number; total: number; ratio: number } {
  const relevant = scoringRules.filter(
    (rule) => player.projectedStats[rule.stat] !== undefined,
  ).length;
  const total = scoringRules.length;
  return { modeled: relevant, total, ratio: total === 0 ? 0 : relevant / total };
}

export function estimateReplacementBaselines(
  players: Player[],
  league: LeagueSettings,
): Record<PlayerPosition, number> {
  return estimateLeagueReplacementLevels(players, league).waiver;
}
