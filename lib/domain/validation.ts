import { applyRosterCompletionPlan } from "./endgame";
import { simulateDraftWorld, type SimulatedUserPicker } from "./draft-simulator";
import { getMarketAdp } from "./rankings";
import { assignOptimalRoster } from "./roster";
import { calculateFantasyPoints, estimateLeagueReplacementLevels } from "./scoring";
import type { DraftTeam, LeagueSettings, Player } from "./types";

export interface ProbabilityForecast {
  probability: number;
  occurred: boolean;
}

export function scoreProbabilityForecasts(forecasts: ProbabilityForecast[]) {
  if (forecasts.length === 0) return { brier: 0, logLoss: 0 };
  const totals = forecasts.reduce(
    (result, forecast) => {
      const probability = Math.min(1 - 1e-9, Math.max(1e-9, forecast.probability));
      const outcome = forecast.occurred ? 1 : 0;
      result.brier += (probability - outcome) ** 2;
      result.logLoss += -(
        outcome * Math.log(probability) +
        (1 - outcome) * Math.log(1 - probability)
      );
      return result;
    },
    { brier: 0, logLoss: 0 },
  );
  return {
    brier: totals.brier / forecasts.length,
    logLoss: totals.logLoss / forecasts.length,
  };
}

export type BenchmarkStrategy = "engine-v4" | "udk-bpa" | "yahoo-bpa" | "static-vor";

export interface StrategyBenchmark {
  strategy: BenchmarkStrategy;
  averageStarterPoints: number;
  completionRate: number;
  averageRegret: number;
}

export function benchmarkDraftStrategies(input: {
  players: Player[];
  league: LeagueSettings;
  teams: DraftTeam[];
  userTeamId: string;
  seed: string;
  simulations?: number;
}): StrategyBenchmark[] {
  const simulations = Math.max(2, Math.min(12, Math.round(input.simulations ?? 6)));
  const replacement = estimateLeagueReplacementLevels(input.players, input.league).waiver;
  const strategies: BenchmarkStrategy[] = ["engine-v4", "udk-bpa", "yahoo-bpa", "static-vor"];
  const outcomes = new Map(strategies.map((strategy) => [strategy, [] as number[]]));
  const completions = new Map(strategies.map((strategy) => [strategy, [] as number[]]));

  const pickerFor = (strategy: BenchmarkStrategy): SimulatedUserPicker | undefined => {
    if (strategy === "engine-v4") return undefined;
    return ({ available, roster }) => {
      const eligible = applyRosterCompletionPlan(available, roster, input.league);
      return [...eligible].sort((a, b) => {
        if (strategy === "udk-bpa") return a.userRank - b.userRank;
        if (strategy === "yahoo-bpa") {
          return getMarketAdp(a, input.league.teamCount) - getMarketAdp(b, input.league.teamCount);
        }
        const aPoints = calculateFantasyPoints(a, input.league.scoringRules);
        const bPoints = calculateFantasyPoints(b, input.league.scoringRules);
        const aBaseline = Math.min(...a.positions.map((position) => replacement[position]));
        const bBaseline = Math.min(...b.positions.map((position) => replacement[position]));
        return (bPoints - bBaseline) - (aPoints - aBaseline);
      })[0];
    };
  };

  for (let run = 0; run < simulations; run += 1) {
    for (const strategy of strategies) {
      const world = simulateDraftWorld({
        players: input.players,
        league: input.league,
        teams: input.teams,
        initialPicks: [],
        seed: `${input.seed}:benchmark:${run}`,
        userTeamId: input.userTeamId,
        userPicker: pickerFor(strategy),
      });
      const roster = world.rosters.get(input.userTeamId) ?? [];
      const assignment = assignOptimalRoster(
        roster,
        input.league.rosterSlots,
        (player) => calculateFantasyPoints(player, input.league.scoringRules),
      );
      outcomes.get(strategy)!.push(
        assignment.starters.reduce(
          (total, starter) => total + calculateFantasyPoints(starter.player, input.league.scoringRules),
          0,
        ),
      );
      completions.get(strategy)!.push(
        assignment.starters.length / Math.max(1, input.league.rosterSlots.length),
      );
    }
  }
  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  const averages = new Map(strategies.map((strategy) => [strategy, average(outcomes.get(strategy)!)]));
  const best = Math.max(...averages.values());
  return strategies.map((strategy) => ({
    strategy,
    averageStarterPoints: Math.round(averages.get(strategy)! * 10) / 10,
    completionRate: Math.round(average(completions.get(strategy)!) * 1000) / 1000,
    averageRegret: Math.round((best - averages.get(strategy)!) * 10) / 10,
  }));
}

