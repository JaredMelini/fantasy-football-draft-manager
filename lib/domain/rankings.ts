import type { Player, PlayerPosition } from "./types";

export function primaryPosition(player: Player): PlayerPosition {
  return player.positions[0];
}

export function getPositionRank(
  player: Player,
  players: Player[],
  position: PlayerPosition = primaryPosition(player),
): number {
  const explicit = player.positionRanks?.[position];
  if (explicit !== undefined) return explicit;
  const ordered = players
    .filter((candidate) => candidate.positions.includes(position))
    .sort((a, b) => a.userRank - b.userRank || a.name.localeCompare(b.name));
  const index = ordered.findIndex((candidate) => candidate.id === player.id);
  return index >= 0 ? index + 1 : player.userRank;
}

export function getPositionTier(
  player: Player,
  position: PlayerPosition = primaryPosition(player),
): number {
  return player.positionTiers?.[position] ?? player.tier;
}

export function getPositionRankValue(
  player: Player,
  players: Player[],
  position: PlayerPosition = primaryPosition(player),
): number {
  const pool = players
    .filter((candidate) => candidate.positions.includes(position))
    .sort(
      (a, b) =>
        getPositionRank(a, players, position) -
          getPositionRank(b, players, position) ||
        a.name.localeCompare(b.name),
    );
  const index = pool.findIndex((candidate) => candidate.id === player.id);
  if (index < 0 || pool.length === 0) return 0;
  return ((pool.length - index) / pool.length) * 10;
}

export function getMarketAdp(player: Player, teamCount: number): number {
  const market = getMarketSignal(player, teamCount);
  if (market.source !== "UDK" && market.source !== "Manual fallback") {
    return market.adp;
  }
  const roundPick = player.sourceAdp?.match(/^(\d+)\.(\d{1,2})$/);
  if (!roundPick) return player.adp;
  const round = Number(roundPick[1]);
  const pick = Number(roundPick[2]);
  if (round < 1 || pick < 1) return player.adp;
  return (round - 1) * Math.max(1, teamCount) + pick;
}

function ageInDays(timestamp?: string, now = Date.now()): number {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed)
    ? Math.max(0, (now - parsed) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

export interface MarketSignal {
  adp: number;
  source:
    | "Yahoo blended"
    | "Yahoo last 7 days"
    | "Yahoo all drafts"
    | "UDK"
    | "Manual fallback";
  freshness: number;
  recentWeight: number;
  overallRank?: number;
  percentDrafted?: number;
}

/**
 * Yahoo's seven-day sample is useful but noisy. Shrink it toward the all-draft
 * market and decay stale inputs instead of letting one import overwrite the
 * other. The returned ADP is opponent price only; it never changes our board.
 */
export function getMarketSignal(
  player: Player,
  teamCount: number,
  now = Date.now(),
): MarketSignal {
  const recent =
    player.yahooAdpRecent !== undefined && player.yahooAdpRecent > 0
      ? player.yahooAdpRecent
      : undefined;
  const all =
    player.yahooAdpAll !== undefined && player.yahooAdpAll > 0
      ? player.yahooAdpAll
      : undefined;
  const recentAge = ageInDays(
    player.yahooAdpRecentUpdatedAt ?? player.yahooAdpUpdatedAt,
    now,
  );
  const allAge = ageInDays(
    player.yahooAdpAllUpdatedAt ?? player.yahooAdpUpdatedAt,
    now,
  );
  const recentFreshness = Math.exp(-recentAge / 10);
  const allFreshness = Math.exp(-allAge / 35);
  const draftedSupport = Math.min(
    1,
    Math.max(0.25, (player.yahooPercentDrafted ?? 50) / 70),
  );

  if (recent !== undefined && all !== undefined) {
    const recentWeight = Math.min(
      0.72,
      Math.max(0.12, 0.58 * recentFreshness * draftedSupport),
    );
    return {
      adp: recent * recentWeight + all * (1 - recentWeight),
      source: "Yahoo blended",
      freshness: Math.max(recentFreshness, allFreshness),
      recentWeight,
      overallRank: player.yahooOverallRank,
      percentDrafted: player.yahooPercentDrafted,
    };
  }
  if (recent !== undefined) {
    return {
      adp: recent,
      source: "Yahoo last 7 days",
      freshness: recentFreshness,
      recentWeight: 1,
      overallRank: player.yahooOverallRank,
      percentDrafted: player.yahooPercentDrafted,
    };
  }
  if (all !== undefined) {
    return {
      adp: all,
      source: "Yahoo all drafts",
      freshness: allFreshness,
      recentWeight: 0,
      overallRank: player.yahooOverallRank,
      percentDrafted: player.yahooPercentDrafted,
    };
  }

  const roundPick = player.sourceAdp?.match(/^(\d+)\.(\d{1,2})$/);
  const fallback = roundPick
    ? (Number(roundPick[1]) - 1) * Math.max(1, teamCount) +
      Number(roundPick[2])
    : player.adp;
  return {
    adp: Number.isFinite(fallback) && fallback > 0 ? fallback : player.userRank,
    source: player.sourceAdp ? "UDK" : "Manual fallback",
    freshness: 0,
    recentWeight: 0,
  };
}

export function getMarketAdpSource(player: Player):
  | "Yahoo blended"
  | "Yahoo last 7 days"
  | "Yahoo all drafts"
  | "UDK"
  | "Manual fallback" {
  return getMarketSignal(player, 1).source;
}
