import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  Player,
  RosterSlot,
} from "./types";

export function teamForOverallPick(
  overall: number,
  teams: DraftTeam[],
  draftType: LeagueSettings["draftType"],
): DraftTeam {
  const ordered = [...teams].sort((a, b) => a.draftSlot - b.draftSlot);
  const round = Math.ceil(overall / ordered.length);
  const indexWithinRound = (overall - 1) % ordered.length;
  const isReverseRound = draftType === "snake" && round % 2 === 0;
  const teamIndex = isReverseRound
    ? ordered.length - 1 - indexWithinRound
    : indexWithinRound;
  return ordered[teamIndex];
}

export function roundForOverallPick(overall: number, teamCount: number): number {
  return Math.ceil(overall / teamCount);
}

export function picksUntilTeamTurn(
  currentOverall: number,
  teamId: string,
  teams: DraftTeam[],
  draftType: LeagueSettings["draftType"],
): number {
  const maximumLookAhead = teams.length * 2;
  for (let offset = 0; offset <= maximumLookAhead; offset += 1) {
    if (teamForOverallPick(currentOverall + offset, teams, draftType).id === teamId) {
      return offset;
    }
  }
  return maximumLookAhead;
}

export function assignedStarterCount(
  roster: Player[],
  slots: RosterSlot[],
): number {
  const matches = new Map<number, number>();

  function tryAssign(playerIndex: number, visited: Set<number>): boolean {
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (visited.has(slotIndex)) continue;
      const player = roster[playerIndex];
      const slot = slots[slotIndex];
      if (
        !player.positions.some((position) =>
          slot.eligiblePositions.includes(position),
        )
      ) {
        continue;
      }

      visited.add(slotIndex);
      const previousPlayer = matches.get(slotIndex);
      if (
        previousPlayer === undefined ||
        tryAssign(previousPlayer, visited)
      ) {
        matches.set(slotIndex, playerIndex);
        return true;
      }
    }
    return false;
  }

  const constrainedFirst = roster
    .map((player, originalIndex) => ({ player, originalIndex }))
    .sort((a, b) => a.player.positions.length - b.player.positions.length);

  for (const { originalIndex } of constrainedFirst) {
    tryAssign(originalIndex, new Set());
  }

  return matches.size;
}

export function playerIdsForTeam(picks: DraftPick[], teamId: string): string[] {
  return picks
    .filter((pick) => pick.teamId === teamId)
    .sort((a, b) => a.overall - b.overall)
    .map((pick) => pick.playerId);
}
