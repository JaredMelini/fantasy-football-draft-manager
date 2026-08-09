import { draftRosterSize, teamForOverallPick } from "./draft";
import {
  buildOpponentProfiles,
  chooseModeledOpponentPlayer,
  updateOpponentProfiles,
} from "./opponent-model";
import { applyRosterCompletionPlan } from "./endgame";
import { getMarketAdp, getPositionRankValue, primaryPosition } from "./rankings";
import { assignOptimalRoster } from "./roster";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
} from "./scoring";
import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  OpponentProfile,
  Player,
  RiskTolerance,
} from "./types";

function riskPenalty(tolerance: RiskTolerance): number {
  return tolerance === "safe" ? 9 : tolerance === "upside" ? 2 : 5;
}

function userPolicyPick(input: {
  available: Player[];
  roster: Player[];
  league: LeagueSettings;
  players: Player[];
  picks: DraftPick[];
  riskTolerance: RiskTolerance;
  baselines: ReturnType<typeof estimateDynamicReplacementBaselines>;
}): Player | undefined {
  const assignment = assignOptimalRoster(
    input.roster,
    input.league.rosterSlots,
    (player) => calculateFantasyPoints(player, input.league.scoringRules),
  );
  const eligible = applyRosterCompletionPlan(input.available, input.roster, input.league);
  return eligible
    .map((player) => {
      const points = calculateFantasyPoints(player, input.league.scoringRules);
      const baseline = Math.min(...player.positions.map((position) => input.baselines[position]));
      const fillsOpenSlot = assignment.openSlots.some((slot) =>
        player.positions.some((position) => slot.eligiblePositions.includes(position)),
      );
      const position = primaryPosition(player);
      const duplicateOnesie =
        (position === "QB" || position === "TE") &&
        input.roster.some((rostered) => rostered.positions.includes(position));
      const fitScore = fillsOpenSlot ? 7 : duplicateOnesie ? -3 : 0.8;
      const rankPrior = getPositionRankValue(player, input.players) * 0.85;
      const marketDiscount = Math.max(-2, Math.min(4, (getMarketAdp(player, input.league.teamCount) - (input.picks.length + 1)) / 12));
      const upside = (player.upside ?? 0.5) * (input.riskTolerance === "upside" ? 4 : 2);
      return {
        player,
        score:
          (points - baseline) / 5.5 +
          fitScore * 1.4 +
          rankPrior +
          marketDiscount +
          upside -
          player.risk * riskPenalty(input.riskTolerance),
      };
    })
    .sort((a, b) => b.score - a.score || a.player.userRank - b.player.userRank)[0]?.player;
}

function rosters(input: {
  teams: DraftTeam[];
  picks: DraftPick[];
  players: Player[];
}): Map<string, Player[]> {
  const byId = new Map(input.players.map((player) => [player.id, player]));
  const result = new Map(input.teams.map((team) => [team.id, [] as Player[]]));
  for (const pick of input.picks) {
    const player = byId.get(pick.playerId);
    if (player) result.get(pick.teamId)?.push(player);
  }
  return result;
}

export interface SimulatedDraftWorld {
  picks: DraftPick[];
  rosters: Map<string, Player[]>;
  profiles: OpponentProfile[];
}

export type SimulatedUserPicker = (input: {
  available: Player[];
  roster: Player[];
  overall: number;
  picks: DraftPick[];
}) => Player | undefined;

/**
 * Runs a single exact snake-draft world. Players are removed once selected, so
 * independent-survival artifacts and player resurrection are impossible.
 */
export function simulateDraftWorld(input: {
  players: Player[];
  league: LeagueSettings;
  teams: DraftTeam[];
  initialPicks: DraftPick[];
  seed: string;
  userTeamId: string;
  forcedUserPick?: { overall: number; playerId: string };
  stopBeforeOverall?: number;
  opponentProfiles?: OpponentProfile[];
  riskTolerance?: RiskTolerance;
  userPicker?: SimulatedUserPicker;
}): SimulatedDraftWorld {
  const picks = [...input.initialPicks];
  const drafted = new Set(picks.map((pick) => pick.playerId));
  const rosterMap = rosters({ teams: input.teams, picks, players: input.players });
  const profiles = updateOpponentProfiles(
    buildOpponentProfiles(input.teams, input.seed, input.opponentProfiles),
    picks,
    input.players,
  );
  const baselines = estimateDynamicReplacementBaselines(
    input.players,
    input.league,
    input.initialPicks,
  );
  const maximum = Math.min(
    input.teams.length * draftRosterSize(input.league),
    input.players.filter((player) => !player.excluded).length,
  );

  while (picks.length < maximum) {
    const overall = picks.length + 1;
    if (input.stopBeforeOverall !== undefined && overall >= input.stopBeforeOverall) break;
    const team = teamForOverallPick(overall, input.teams, input.league.draftType);
    const available = input.players.filter(
      (player) => !player.excluded && !drafted.has(player.id),
    );
    if (available.length === 0) break;
    const teamRoster = rosterMap.get(team.id) ?? [];
    let selected: Player | undefined;
    if (
      team.id === input.userTeamId &&
      input.forcedUserPick?.overall === overall
    ) {
      selected = available.find((player) => player.id === input.forcedUserPick?.playerId);
    }
    if (!selected && team.id === input.userTeamId) {
      selected = input.userPicker?.({
        available,
        roster: teamRoster,
        overall,
        picks,
      }) ??
        userPolicyPick({
          available,
          roster: teamRoster,
          league: input.league,
          players: input.players,
          picks,
          riskTolerance: input.riskTolerance ?? "balanced",
          baselines,
        });
    }
    if (!selected) {
      const profile = profiles.find((candidate) => candidate.teamId === team.id);
      if (!profile) break;
      selected = chooseModeledOpponentPlayer({
        available,
        roster: teamRoster,
        league: input.league,
        overall,
        seed: input.seed,
        profile,
      });
    }
    if (!selected) break;
    picks.push({
      overall,
      round: Math.ceil(overall / input.teams.length),
      teamId: team.id,
      playerId: selected.id,
    });
    drafted.add(selected.id);
    rosterMap.set(team.id, [...teamRoster, selected]);
  }
  return { picks, rosters: rosterMap, profiles };
}

export interface AvailabilityEstimate {
  probability: number;
  low: number;
  high: number;
  simulations: number;
  fallbackPlayerId: string | null;
}

function wilson(successes: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function estimateSequentialAvailability(input: {
  player: Player;
  comparablePlayers: Player[];
  players: Player[];
  league: LeagueSettings;
  teams: DraftTeam[];
  picks: DraftPick[];
  userTeamId: string;
  nextUserOverall: number;
  seed: string;
  simulations: number;
  opponentProfiles?: OpponentProfile[];
  currentAlternativePlayerId?: string;
  currentOverall?: number;
}): AvailabilityEstimate {
  let successes = 0;
  const fallbackCounts = new Map<string, number>();
  const count = Math.max(16, Math.round(input.simulations));
  for (let run = 0; run < count; run += 1) {
    const world = simulateDraftWorld({
      players: input.players,
      league: input.league,
      teams: input.teams,
      initialPicks: input.picks,
      seed: `${input.seed}:availability:${run}`,
      userTeamId: input.userTeamId,
      forcedUserPick:
        input.currentAlternativePlayerId && input.currentOverall
          ? {
              overall: input.currentOverall,
              playerId: input.currentAlternativePlayerId,
            }
          : undefined,
      stopBeforeOverall: input.nextUserOverall,
      opponentProfiles: input.opponentProfiles,
    });
    const selected = new Set(world.picks.map((pick) => pick.playerId));
    if (!selected.has(input.player.id)) successes += 1;
    const fallback = input.comparablePlayers
      .filter((player) => !selected.has(player.id))
      .sort((a, b) => a.userRank - b.userRank)[0];
    if (fallback) fallbackCounts.set(fallback.id, (fallbackCounts.get(fallback.id) ?? 0) + 1);
  }
  const interval = wilson(successes, count);
  return {
    probability: successes / count,
    low: interval.low,
    high: interval.high,
    simulations: count,
    fallbackPlayerId:
      [...fallbackCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}
