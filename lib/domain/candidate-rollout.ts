import { draftRosterSize, teamForOverallPick } from "./draft";
import { applyEndgameRosterPlan } from "./endgame";
import { assessCandidateRosterFit, assignRoster } from "./roster";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
} from "./scoring";
import {
  getMarketAdp,
  getPositionRank,
  getPositionRankValue,
  primaryPosition,
} from "./rankings";
import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  Player,
  PlayerRecommendation,
  RiskTolerance,
} from "./types";

export type RecommendationLens = "roster" | "safe" | "upside" | "pivot";

export interface CandidateRolloutSummary {
  playerId: string;
  simulations: number;
  averageRosterGrade: number;
  floorRosterGrade: number;
  ceilingRosterGrade: number;
  averageStarterPoints: number;
  completionRate: number;
  averageRosterRisk: number;
}

export interface RecommendationLensResult {
  key: RecommendationLens;
  label: string;
  playerId: string;
  metric: string;
  rationale: string;
}

export interface CandidateRolloutAnalysis {
  summaries: CandidateRolloutSummary[];
  lenses: RecommendationLensResult[];
}

interface CandidateRolloutInput {
  recommendations: PlayerRecommendation[];
  players: Player[];
  league: LeagueSettings;
  picks: DraftPick[];
  teams: DraftTeam[];
  userTeamId: string;
  userRoster: Player[];
  decisionOverall: number;
  seed: string;
  riskTolerance?: RiskTolerance;
  simulationCount?: number;
  candidateLimit?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function deterministicProbability(seed: string, key: string): number {
  let value = hash(`${seed}:${key}`) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function riskWeight(tolerance: RiskTolerance): number {
  if (tolerance === "safe") return 8;
  if (tolerance === "upside") return 1.5;
  return 4.5;
}

function futureUserPicks(input: {
  teams: DraftTeam[];
  league: LeagueSettings;
  userTeamId: string;
  decisionOverall: number;
  remainingSelections: number;
}): number[] {
  const picks: number[] = [];
  const maximumOverall =
    input.teams.length * Math.max(draftRosterSize(input.league), 1);
  for (
    let overall = input.decisionOverall + 1;
    overall <= maximumOverall && picks.length < input.remainingSelections;
    overall += 1
  ) {
    if (
      teamForOverallPick(overall, input.teams, input.league.draftType).id ===
      input.userTeamId
    ) {
      picks.push(overall);
    }
  }
  return picks;
}

function rosterOutcome(input: {
  roster: Player[];
  league: LeagueSettings;
  baselines: ReturnType<typeof estimateDynamicReplacementBaselines>;
}) {
  const assignment = assignRoster(input.roster, input.league.rosterSlots);
  const starterPoints = assignment.starters.reduce(
    (total, starter) =>
      total + calculateFantasyPoints(starter.player, input.league.scoringRules),
    0,
  );
  const starterValue = assignment.starters.reduce((total, starter) => {
    const points = calculateFantasyPoints(
      starter.player,
      input.league.scoringRules,
    );
    const baseline = Math.min(
      ...starter.player.positions.map((position) => input.baselines[position]),
    );
    return total + Math.max(0, points - baseline);
  }, 0);
  const benchValue = assignment.bench.reduce(
    (total, player) =>
      total + calculateFantasyPoints(player, input.league.scoringRules) * 0.04,
    0,
  );
  const completionRate =
    input.league.rosterSlots.length === 0
      ? 0
      : assignment.starters.length / input.league.rosterSlots.length;
  const averageRisk = average(input.roster.map((player) => player.risk));
  const starterValuePerSlot =
    starterValue / Math.max(input.league.rosterSlots.length, 1);
  const grade = clamp(
    32 +
      completionRate * 32 +
      starterValuePerSlot * 0.22 +
      benchValue * 0.25 -
      averageRisk * 6,
    0,
    100,
  );

  return {
    grade,
    starterPoints,
    completionRate,
    averageRisk,
  };
}

function chooseFuturePlayer(input: {
  pool: Player[];
  roster: Player[];
  league: LeagueSettings;
  baselines: ReturnType<typeof estimateDynamicReplacementBaselines>;
  strategy: "balanced" | "needs" | "value";
  riskTolerance: RiskTolerance;
}): Player | undefined {
  const filledBefore = assignRoster(
    input.roster,
    input.league.rosterSlots,
  ).starters.length;
  return [...input.pool]
    .map((player) => {
      const points = calculateFantasyPoints(player, input.league.scoringRules);
      const baseline = Math.min(
        ...player.positions.map((position) => input.baselines[position]),
      );
      const rosterFit = assessCandidateRosterFit(
        input.roster,
        player,
        input.league.rosterSlots,
        filledBefore,
      );
      const needMultiplier =
        input.strategy === "needs"
          ? 2.2
          : input.strategy === "balanced"
            ? 1.4
            : 0.7;
      const valueWeight = input.strategy === "value" ? 1.25 : 1;
      const personalRank =
        getPositionRankValue(player, input.pool) * 0.8;
      const byeCollision = input.roster.filter(
        (teammate) => teammate.byeWeek === player.byeWeek,
      ).length;
      return {
        player,
        score:
          ((points - baseline) / 6) * valueWeight +
          personalRank +
          rosterFit.score * needMultiplier -
          player.risk * riskWeight(input.riskTolerance) -
          byeCollision * 0.35,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        getPositionRank(a.player, input.pool) -
          getPositionRank(b.player, input.pool),
    )[0]?.player;
}

function summarizeCandidate(
  candidate: PlayerRecommendation,
  input: CandidateRolloutInput,
  simulations: number,
): CandidateRolloutSummary {
  const draftedIds = new Set(input.picks.map((pick) => pick.playerId));
  draftedIds.add(candidate.player.id);
  const baselines = estimateDynamicReplacementBaselines(
    input.players,
    input.league,
    input.picks,
  );
  const remainingSelections = Math.max(
    0,
    draftRosterSize(input.league) - input.userRoster.length - 1,
  );
  const userPicks = futureUserPicks({
    teams: input.teams,
    league: input.league,
    userTeamId: input.userTeamId,
    decisionOverall: input.decisionOverall,
    remainingSelections,
  });
  const grades: number[] = [];
  const starterPoints: number[] = [];
  const completionRates: number[] = [];
  const rosterRisks: number[] = [];
  const strategies = ["balanced", "needs", "value"] as const;

  for (let run = 0; run < simulations; run += 1) {
    const roster = [...input.userRoster, candidate.player];
    const selectedIds = new Set(draftedIds);
    const strategy = strategies[run % strategies.length];

    for (const overall of userPicks) {
      const availablePool = input.players.filter(
        (player) => !selectedIds.has(player.id) && !player.excluded,
      );
      const pool = applyEndgameRosterPlan(
        availablePool,
        roster,
        input.league,
      );
      const spread = Math.max(4, input.league.teamCount / 2);
      const survivors = pool.filter((player) => {
        const survivalProbability = clamp(
          1 / (1 + Math.exp((overall - getMarketAdp(player, input.league.teamCount)) / spread)),
          0.01,
          0.99,
        );
        return (
          deterministicProbability(
            input.seed,
            `${candidate.player.id}:${run}:${player.id}`,
          ) <= survivalProbability
        );
      });
      const selected = chooseFuturePlayer({
        pool: survivors.length > 0 ? survivors : pool,
        roster,
        league: input.league,
        baselines,
        strategy,
        riskTolerance: input.riskTolerance ?? "balanced",
      });
      if (!selected) break;
      roster.push(selected);
      selectedIds.add(selected.id);
    }

    const outcome = rosterOutcome({ roster, league: input.league, baselines });
    grades.push(outcome.grade);
    starterPoints.push(outcome.starterPoints);
    completionRates.push(outcome.completionRate);
    rosterRisks.push(outcome.averageRisk);
  }

  return {
    playerId: candidate.player.id,
    simulations,
    averageRosterGrade: round(average(grades)),
    floorRosterGrade: round(percentile(grades, 0.2)),
    ceilingRosterGrade: round(percentile(grades, 0.8)),
    averageStarterPoints: round(average(starterPoints)),
    completionRate: round(average(completionRates)),
    averageRosterRisk: round(average(rosterRisks)),
  };
}

function bestBy(
  summaries: CandidateRolloutSummary[],
  score: (summary: CandidateRolloutSummary) => number,
): CandidateRolloutSummary | undefined {
  return [...summaries].sort((a, b) => score(b) - score(a))[0];
}

function selectRolloutCandidates(
  recommendations: PlayerRecommendation[],
  candidateLimit: number,
): PlayerRecommendation[] {
  const selected: PlayerRecommendation[] = [];
  const selectedIds = new Set<string>();
  const add = (recommendation: PlayerRecommendation | undefined) => {
    if (!recommendation || selectedIds.has(recommendation.player.id)) return;
    selected.push(recommendation);
    selectedIds.add(recommendation.player.id);
  };

  recommendations.slice(0, Math.min(4, candidateLimit)).forEach(add);
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    if (selected.length >= candidateLimit) break;
    add(
      recommendations.find(
        (recommendation) =>
          primaryPosition(recommendation.player) === position &&
          recommendation.breakdown.rosterFit > 0,
      ),
    );
  }
  for (const recommendation of recommendations) {
    if (selected.length >= candidateLimit) break;
    add(recommendation);
  }

  return selected;
}

export function integrateRosterOutcomes(
  recommendations: PlayerRecommendation[],
  summaries: CandidateRolloutSummary[],
  riskTolerance: RiskTolerance = "balanced",
): PlayerRecommendation[] {
  if (recommendations.length === 0 || summaries.length === 0) {
    return recommendations;
  }

  const summaryById = new Map(
    summaries.map((summary) => [summary.playerId, summary]),
  );
  const analyzed = recommendations.filter((recommendation) =>
    summaryById.has(recommendation.player.id),
  );
  const immediateScores = analyzed.map(
    (recommendation) => recommendation.breakdown.total,
  );
  const minimumImmediate = Math.min(...immediateScores);
  const maximumImmediate = Math.max(...immediateScores);
  const immediateRange = maximumImmediate - minimumImmediate;
  const rosterWeights =
    riskTolerance === "safe"
      ? { average: 0.4, floor: 0.5, ceiling: 0.1 }
      : riskTolerance === "upside"
        ? { average: 0.45, floor: 0.15, ceiling: 0.4 }
        : { average: 0.55, floor: 0.3, ceiling: 0.15 };
  const baseIndex = new Map(
    recommendations.map((recommendation, index) => [
      recommendation.player.id,
      index,
    ]),
  );
  const blended = analyzed.map((recommendation) => {
    const summary = summaryById.get(recommendation.player.id)!;
    const immediateGrade =
      immediateRange === 0
        ? 85
        : 70 +
          ((recommendation.breakdown.total - minimumImmediate) /
            immediateRange) *
            30;
    const rosterUtility =
      summary.averageRosterGrade * rosterWeights.average +
      summary.floorRosterGrade * rosterWeights.floor +
      summary.ceilingRosterGrade * rosterWeights.ceiling -
      (1 - summary.completionRate) * 25;
    const total = round(rosterUtility * 0.65 + immediateGrade * 0.35);
    const outcomeSpread = Math.max(
      0,
      summary.ceilingRosterGrade - summary.floorRosterGrade,
    );
    const confidence = clamp(
      recommendation.confidence * 0.55 +
        summary.completionRate * 0.3 +
        Math.max(0, 1 - outcomeSpread / 25) * 0.15,
      0.55,
      0.93,
    );

    return {
      ...recommendation,
      breakdown: {
        ...recommendation.breakdown,
        immediateScore: recommendation.breakdown.total,
        expectedRosterGrade: summary.averageRosterGrade,
        rosterFloor: summary.floorRosterGrade,
        rosterCeiling: summary.ceilingRosterGrade,
        total,
      },
      confidence,
      explanation: [
        `Expected completed roster: ${summary.averageRosterGrade} average, ${summary.floorRosterGrade} floor, ${summary.ceilingRosterGrade} ceiling`,
        "Best-overall grade blends 65% completed-roster outcomes with 35% live pick value",
        ...recommendation.explanation,
      ],
    };
  });

  const byPosition = new Map<string, PlayerRecommendation[]>();
  for (const recommendation of blended) {
    const position = primaryPosition(recommendation.player);
    byPosition.set(position, [
      ...(byPosition.get(position) ?? []),
      recommendation,
    ]);
  }
  const guarded = [...byPosition.values()].flatMap((group) => {
    const ordered = [...group].sort(
      (a, b) =>
        (baseIndex.get(a.player.id) ?? Number.POSITIVE_INFINITY) -
        (baseIndex.get(b.player.id) ?? Number.POSITIVE_INFINITY),
    );
    let maximumAllowed = Number.POSITIVE_INFINITY;
    return ordered.map((recommendation) => {
      const total = round(
        Math.min(recommendation.breakdown.total, maximumAllowed),
      );
      maximumAllowed = total - 0.1;
      return {
        ...recommendation,
        breakdown: { ...recommendation.breakdown, total },
      };
    });
  });
  const guardedById = new Map(
    guarded.map((recommendation) => [recommendation.player.id, recommendation]),
  );
  const sortedAnalyzed = analyzed
    .map((recommendation) => guardedById.get(recommendation.player.id)!)
    .sort(
      (a, b) =>
        b.breakdown.total - a.breakdown.total ||
        (baseIndex.get(a.player.id) ?? 0) -
          (baseIndex.get(b.player.id) ?? 0),
    );
  const minimumAnalyzedScore = Math.min(
    ...sortedAnalyzed.map((recommendation) => recommendation.breakdown.total),
  );
  const remaining = recommendations
    .filter((recommendation) => !guardedById.has(recommendation.player.id))
    .map((recommendation, index) => ({
      ...recommendation,
      breakdown: {
        ...recommendation.breakdown,
        immediateScore: recommendation.breakdown.total,
        total: round(
          Math.min(
            recommendation.breakdown.total,
            minimumAnalyzedScore - 0.1 - index * 0.1,
          ),
        ),
      },
    }));

  return [...sortedAnalyzed, ...remaining];
}

export function analyzeCandidateRollouts(
  input: CandidateRolloutInput,
): CandidateRolloutAnalysis {
  const simulations = Math.max(18, Math.round(input.simulationCount ?? 36));
  const candidates = selectRolloutCandidates(
    input.recommendations,
    Math.max(4, Math.round(input.candidateLimit ?? 8)),
  );
  if (candidates.length === 0) return { summaries: [], lenses: [] };

  const summaries = candidates.map((candidate) =>
    summarizeCandidate(candidate, input, simulations),
  );
  const recommendationById = new Map(
    candidates.map((recommendation) => [recommendation.player.id, recommendation]),
  );
  const best = bestBy(summaries, (summary) => summary.averageRosterGrade)!;
  const safest = bestBy(
    summaries,
    (summary) =>
      summary.floorRosterGrade -
      (recommendationById.get(summary.playerId)?.player.risk ?? 0) * 4,
  )!;
  const upside = bestBy(
    summaries,
    (summary) =>
      summary.ceilingRosterGrade +
      (recommendationById.get(summary.playerId)?.player.upside ?? 0.5) * 4,
  )!;
  const bestPlayer = recommendationById.get(best.playerId)!.player;
  const pivotPool = summaries.filter((summary) => {
    const player = recommendationById.get(summary.playerId)!.player;
    return player.positions[0] !== bestPlayer.positions[0];
  });
  const pivot =
    bestBy(pivotPool, (summary) => summary.averageRosterGrade) ??
    bestBy(
      summaries.filter((summary) => summary.playerId !== best.playerId),
      (summary) => summary.averageRosterGrade,
    ) ??
    best;
  const pivotPlayer = recommendationById.get(pivot.playerId)!.player;

  return {
    summaries,
    lenses: [
      {
        key: "roster",
        label: "Best roster outcome",
        playerId: best.playerId,
        metric: `${best.averageRosterGrade} avg grade`,
        rationale: "Highest average completed-roster result",
      },
      {
        key: "safe",
        label: "Safest",
        playerId: safest.playerId,
        metric: `${safest.floorRosterGrade} floor`,
        rationale: "Strongest lower-range roster outcome",
      },
      {
        key: "upside",
        label: "Upside",
        playerId: upside.playerId,
        metric: `${upside.ceilingRosterGrade} ceiling`,
        rationale: "Highest ceiling after future picks",
      },
      {
        key: "pivot",
        label: "Position pivot",
        playerId: pivot.playerId,
        metric: `${pivotPlayer.positions[0]} · ${pivot.averageRosterGrade} avg`,
        rationale: `Best alternative away from ${bestPlayer.positions[0]}`,
      },
    ],
  };
}
