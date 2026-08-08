import type { Player, PlayerPosition, RosterSlot } from "./types";

export interface AssignedStarter {
  slot: RosterSlot;
  player: Player;
}

export interface RosterAssignment {
  starters: AssignedStarter[];
  bench: Player[];
  openSlots: RosterSlot[];
}

export interface CandidateRosterFit {
  score: number;
  fillsStarter: boolean;
  reason: string;
}

export function assessCandidateRosterFit(
  roster: Player[],
  candidate: Player,
  slots: RosterSlot[],
  filledStarterCount?: number,
): CandidateRosterFit {
  const filledBefore =
    filledStarterCount ?? assignRoster(roster, slots).starters.length;
  const filledAfter = assignRoster([...roster, candidate], slots).starters.length;
  const fillsStarter = filledAfter > filledBefore;
  const position = candidate.positions[0];
  const dedicatedSlots = slots.filter(
    (slot) =>
      slot.eligiblePositions.length === 1 &&
      slot.eligiblePositions[0] === position,
  ).length;
  const rosteredAtPosition = roster.filter((player) =>
    player.positions.includes(position),
  ).length;
  const openDedicatedNeeds = new Map<PlayerPosition, number>();

  for (const slot of slots) {
    if (slot.eligiblePositions.length !== 1) continue;
    const slotPosition = slot.eligiblePositions[0];
    openDedicatedNeeds.set(
      slotPosition,
      (openDedicatedNeeds.get(slotPosition) ?? 0) + 1,
    );
  }
  for (const [slotPosition, required] of openDedicatedNeeds) {
    const rostered = roster.filter((player) =>
      player.positions.includes(slotPosition),
    ).length;
    openDedicatedNeeds.set(slotPosition, Math.max(0, required - rostered));
  }

  const openOtherDedicatedSlots = [...openDedicatedNeeds.entries()].reduce(
    (total, [slotPosition, count]) =>
      slotPosition === position ? total : total + count,
    0,
  );
  const isFlexOnlyDuplicate =
    fillsStarter &&
    dedicatedSlots > 0 &&
    rosteredAtPosition >= dedicatedSlots;
  const isSingleStarterDuplicate =
    dedicatedSlots === 1 && rosteredAtPosition >= dedicatedSlots;

  if (isFlexOnlyDuplicate && isSingleStarterDuplicate) {
    if (openOtherDedicatedSlots > 0) {
      return {
        score: -12 - Math.min(6, openOtherDedicatedSlots * 1.5),
        fillsStarter,
        reason: `A second ${position} would consume FLEX while ${openOtherDedicatedSlots} dedicated starter need${openOtherDedicatedSlots === 1 ? " remains" : "s remain"}`,
      };
    }
    return {
      score: 1,
      fillsStarter,
      reason: `A second ${position} is only being considered for the FLEX spot`,
    };
  }

  if (fillsStarter) {
    const remainingPositionNeed = Math.max(
      0,
      dedicatedSlots - rosteredAtPosition - 1,
    );
    return {
      score:
        dedicatedSlots === 0
          ? 5
          : isFlexOnlyDuplicate
            ? 3
            : 7 + remainingPositionNeed * 3,
      fillsStarter,
      reason: isFlexOnlyDuplicate
        ? `${position} adds flexible starting depth`
        : `${position} fills an open dedicated starter need`,
    };
  }

  if (isSingleStarterDuplicate) {
    return {
      score: openOtherDedicatedSlots > 0 ? -14 : -3,
      fillsStarter,
      reason:
        openOtherDedicatedSlots > 0
          ? `A backup ${position} would leave ${openOtherDedicatedSlots} dedicated starter need${openOtherDedicatedSlots === 1 ? " unfilled" : "s unfilled"}`
          : `${position} would be bench depth behind an existing starter`,
    };
  }

  return {
    score: roster.length < slots.length ? 1.2 : 0.4,
    fillsStarter,
    reason: `${position} adds roster depth without filling a starter slot`,
  };
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
