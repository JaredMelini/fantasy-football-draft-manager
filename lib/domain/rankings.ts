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
  const roundPick = player.sourceAdp?.match(/^(\d+)\.(\d{1,2})$/);
  if (!roundPick) return player.adp;
  const round = Number(roundPick[1]);
  const pick = Number(roundPick[2]);
  if (round < 1 || pick < 1) return player.adp;
  return (round - 1) * Math.max(1, teamCount) + pick;
}
