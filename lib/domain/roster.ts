import type { Player, RosterSlot } from "./types";

export interface AssignedStarter {
  slot: RosterSlot;
  player: Player;
}

export interface RosterAssignment {
  starters: AssignedStarter[];
  bench: Player[];
  openSlots: RosterSlot[];
}

export function assignRoster(
  roster: Player[],
  slots: RosterSlot[],
): RosterAssignment {
  const slotToPlayer = new Map<number, number>();

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
      const previousPlayer = slotToPlayer.get(slotIndex);
      if (previousPlayer === undefined || tryAssign(previousPlayer, visited)) {
        slotToPlayer.set(slotIndex, playerIndex);
        return true;
      }
    }
    return false;
  }

  const constrainedFirst = roster
    .map((player, index) => ({ player, index }))
    .sort((a, b) => a.player.positions.length - b.player.positions.length);
  constrainedFirst.forEach(({ index }) => tryAssign(index, new Set()));

  const assignedPlayerIndexes = new Set(slotToPlayer.values());
  const starters = [...slotToPlayer.entries()]
    .sort(([slotA], [slotB]) => slotA - slotB)
    .map(([slotIndex, playerIndex]) => ({
      slot: slots[slotIndex],
      player: roster[playerIndex],
    }));
  const filledSlotIndexes = new Set(slotToPlayer.keys());

  return {
    starters,
    bench: roster.filter((_, index) => !assignedPlayerIndexes.has(index)),
    openSlots: slots.filter((_, index) => !filledSlotIndexes.has(index)),
  };
}
