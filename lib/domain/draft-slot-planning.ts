import { simulateDraftWorld } from "./draft-simulator";
import { buildDemoTeams } from "../sample-data";
import type { LeagueSettings, Player } from "./types";

export interface DraftSlotPlaybook {
  slot: number;
  firstPickTargets: string[];
  openingPositions: string;
}

/** Precomputes a compact plan for every possible randomized draft slot. */
export function buildDraftSlotPlaybooks(input: {
  players: Player[];
  league: LeagueSettings;
  seed: string;
  simulationsPerSlot?: number;
}): DraftSlotPlaybook[] {
  if (input.players.length === 0) return [];
  const simulations = Math.max(2, Math.round(input.simulationsPerSlot ?? 4));
  return Array.from({ length: input.league.teamCount }, (_, index) => {
    const slot = index + 1;
    const teams = buildDemoTeams(input.league.teamCount, slot);
    const user = teams.find((team) => team.isUser)!;
    const firstCounts = new Map<string, number>();
    const openingCounts = new Map<string, number>();
    for (let run = 0; run < simulations; run += 1) {
      const world = simulateDraftWorld({
        players: input.players,
        league: input.league,
        teams,
        initialPicks: [],
        seed: `${input.seed}:slot:${slot}:run:${run}`,
        userTeamId: user.id,
      });
      const firstThree = world.picks
        .filter((pick) => pick.teamId === user.id)
        .slice(0, 3)
        .map((pick) => input.players.find((player) => player.id === pick.playerId))
        .filter((player): player is Player => Boolean(player));
      const first = firstThree[0];
      if (first) firstCounts.set(first.name, (firstCounts.get(first.name) ?? 0) + 1);
      const opening = firstThree.map((player) => player.positions[0]).join("-");
      if (opening) openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
    }
    return {
      slot,
      firstPickTargets: [...firstCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([name]) => name),
      openingPositions:
        [...openingCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Pending data",
    };
  });
}

