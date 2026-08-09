import { draftRosterSize } from "./draft";
import type { LeagueSettings, Player, PlayerPosition } from "./types";

const endgamePositions = ["DST", "K"] as const;

export interface EndgameRosterPlan {
  mode: "open" | "defer" | "force";
  missingPositions: PlayerPosition[];
  remainingPicks: number;
}

export function getEndgameRosterPlan(
  roster: Player[],
  league: LeagueSettings,
): EndgameRosterPlan {
  const requiredPositions = endgamePositions.filter((position) =>
    league.rosterSlots.some(
      (slot) =>
        slot.eligiblePositions.length === 1 &&
        slot.eligiblePositions[0] === position,
    ),
  );
  const missingPositions = requiredPositions.filter(
    (position) =>
      !roster.some((player) => player.positions.includes(position)),
  );
  const remainingPicks = Math.max(0, draftRosterSize(league) - roster.length);

  if (missingPositions.length === 0) {
    return { mode: "open", missingPositions, remainingPicks };
  }

  return {
    mode:
      remainingPicks <= missingPositions.length ? "force" : "defer",
    missingPositions,
    remainingPicks,
  };
}

export function applyEndgameRosterPlan(
  players: Player[],
  roster: Player[],
  league: LeagueSettings,
): Player[] {
  const plan = getEndgameRosterPlan(roster, league);
  if (plan.mode === "open") return players;

  if (plan.mode === "force") {
    const required = players.filter((player) =>
      player.positions.some((position) =>
        plan.missingPositions.includes(position),
      ),
    );
    return required.length > 0 ? required : players;
  }

  const nonEndgamePlayers = players.filter(
    (player) =>
      !player.positions.some((position) =>
        endgamePositions.includes(position as (typeof endgamePositions)[number]),
      ),
  );
  return nonEndgamePlayers.length > 0 ? nonEndgamePlayers : players;
}
