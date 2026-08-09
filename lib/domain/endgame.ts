import { draftRosterSize } from "./draft";
import { assignRoster } from "./roster";
import type { LeagueSettings, Player, PlayerPosition } from "./types";

const endgamePositions = ["DST", "K"] as const;
const endgamePositionSet = new Set<PlayerPosition>(endgamePositions);

export interface RosterCompletionPlan {
  mode:
    | "open"
    | "defer-specialists"
    | "force-starters"
    | "force-specialists";
  missingSpecialPositions: PlayerPosition[];
  openCoreSlotLabels: string[];
  remainingPicks: number;
}

export function getRosterCompletionPlan(
  roster: Player[],
  league: LeagueSettings,
): RosterCompletionPlan {
  const assignment = assignRoster(roster, league.rosterSlots);
  const missingSpecialPositions = endgamePositions.filter((position) =>
    assignment.openSlots.some(
      (slot) => slot.eligiblePositions.includes(position),
    ),
  );
  const openCoreSlots = assignment.openSlots.filter(
    (slot) =>
      !slot.eligiblePositions.some((position) =>
        endgamePositionSet.has(position),
      ),
  );
  const remainingPicks = Math.max(0, draftRosterSize(league) - roster.length);
  const picksBeforeSpecialists = Math.max(
    0,
    remainingPicks - missingSpecialPositions.length,
  );

  if (
    openCoreSlots.length > 0 &&
    picksBeforeSpecialists <= openCoreSlots.length
  ) {
    return {
      mode: "force-starters",
      missingSpecialPositions,
      openCoreSlotLabels: openCoreSlots.map((slot) => slot.label),
      remainingPicks,
    };
  }

  if (missingSpecialPositions.length === 0) {
    return {
      mode: "open",
      missingSpecialPositions,
      openCoreSlotLabels: openCoreSlots.map((slot) => slot.label),
      remainingPicks,
    };
  }

  return {
    mode:
      remainingPicks <= missingSpecialPositions.length
        ? "force-specialists"
        : "defer-specialists",
    missingSpecialPositions,
    openCoreSlotLabels: openCoreSlots.map((slot) => slot.label),
    remainingPicks,
  };
}

export function applyRosterCompletionPlan(
  players: Player[],
  roster: Player[],
  league: LeagueSettings,
): Player[] {
  const plan = getRosterCompletionPlan(roster, league);
  if (plan.mode === "open") return players;

  if (plan.mode === "force-starters") {
    const filledBefore = assignRoster(roster, league.rosterSlots).starters.length;
    const required = players.filter(
      (player) =>
        !player.positions.some((position) => endgamePositionSet.has(position)) &&
        assignRoster([...roster, player], league.rosterSlots).starters.length >
          filledBefore,
    );
    return required.length > 0 ? required : players;
  }

  if (plan.mode === "force-specialists") {
    const required = players.filter((player) =>
      player.positions.some((position) =>
        plan.missingSpecialPositions.includes(position),
      ),
    );
    return required.length > 0 ? required : players;
  }

  const nonEndgamePlayers = players.filter(
    (player) =>
      !player.positions.some((position) => endgamePositionSet.has(position)),
  );
  return nonEndgamePlayers.length > 0 ? nonEndgamePlayers : players;
}
