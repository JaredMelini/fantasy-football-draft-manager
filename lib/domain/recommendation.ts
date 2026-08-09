import {
  assignedStarterCount,
  draftRosterSize,
  playerIdsForTeam,
  teamForOverallPick,
} from "./draft";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
} from "./scoring";
import {
  getPositionRank,
  getPositionRankValue,
  getPositionTier,
  getMarketAdp,
  primaryPosition,
} from "./rankings";
import { assessCandidateRosterFit } from "./roster";
import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  Player,
  PlayerPosition,
  PlayerRecommendation,
  RecommendationDecision,
  RiskTolerance,
} from "./types";

interface RecommendPlayersInput {
  players: Player[];
  league: LeagueSettings;
  picks: DraftPick[];
  userRoster: Player[];
  currentOverall: number;
  picksUntilNextTurn: number;
  teams?: DraftTeam[];
  seed?: string;
  riskTolerance?: RiskTolerance;
  simulationCount?: number;
  limit?: number;
}

interface CandidateAnalysis {
  player: Player;
  projectedPoints: number;
  replacementValue: number;
  personalRankValue: number;
  rosterFit: number;
  tierScarcity: number;
  returnProbability: number;
  availabilityUrgency: number;
  opponentDemand: number;
  recentPositionRun: number;
  upsideValue: number;
  riskPenalty: number;
  rosterFitReason: string;
  baseTotal: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
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

function overlapsPosition(first: Player, second: Player): boolean {
  return first.positions.some((position) => second.positions.includes(position));
}

function riskMultiplier(tolerance: RiskTolerance): number {
  if (tolerance === "safe") return 8;
  if (tolerance === "upside") return 2.5;
  return 5;
}

function upsideMultiplier(tolerance: RiskTolerance): number {
  if (tolerance === "safe") return 1.5;
  if (tolerance === "upside") return 5;
  return 3;
}

function buildOpponentTurnContexts(input: {
  players: Player[];
  picks: DraftPick[];
  teams?: DraftTeam[];
  league: LeagueSettings;
  currentOverall: number;
  picksUntilNextTurn: number;
}) {
  if (!input.teams || input.teams.length === 0) return [];
  const contexts = [];
  const horizon = input.currentOverall + Math.max(input.picksUntilNextTurn, 0);

  for (let overall = input.currentOverall + 1; overall < horizon; overall += 1) {
    const team = teamForOverallPick(overall, input.teams, input.league.draftType);
    if (team.isUser) continue;
    const rosterIds = playerIdsForTeam(input.picks, team.id);
    const roster = input.players.filter((player) => rosterIds.includes(player.id));
    contexts.push({
      roster,
      filledStarters: assignedStarterCount(roster, input.league.rosterSlots),
    });
  }

  return contexts;
}

function recentPositionRun(
  player: Player,
  picks: DraftPick[],
  players: Player[],
  teamCount: number,
): number {
  const recent = picks.slice(-Math.min(Math.max(teamCount, 6), 12));
  return recent.reduce((total, pick) => {
    const drafted = players.find((candidate) => candidate.id === pick.playerId);
    return total + (drafted && overlapsPosition(player, drafted) ? 1 : 0);
  }, 0);
}

function opponentNeedScore(
  player: Player,
  contexts: ReturnType<typeof buildOpponentTurnContexts>,
  league: LeagueSettings,
): number {
  if (contexts.length === 0) return 0;
  const needTurns = contexts.reduce((total, context) => {
    const filledAfter = assignedStarterCount(
      [...context.roster, player],
      league.rosterSlots,
    );
    if (filledAfter > context.filledStarters) return total + 1;
    if (context.roster.length < draftRosterSize(league)) return total + 0.2;
    return total;
  }, 0);
  return clamp((needTurns / contexts.length) * 6, 0, 6);
}

function waitDecision(
  returnProbability: number,
  opportunityLoss: number,
  opponentDemand: number,
): RecommendationDecision {
  if (
    returnProbability < 0.34 ||
    opportunityLoss >= 6 ||
    opponentDemand >= 4.75
  ) {
    return "draft-now";
  }
  if (
    returnProbability < 0.64 ||
    opportunityLoss >= 2.5 ||
    opponentDemand >= 3
  ) {
    return "lean-now";
  }
  return "can-wait";
}

function simulateWaiting(input: {
  candidate: CandidateAnalysis;
  candidates: CandidateAnalysis[];
  simulations: number;
  seed: string;
}) {
  const positionalPool = input.candidates.filter((other) =>
    overlapsPosition(input.candidate.player, other.player),
  );
  let candidateSurvives = 0;
  let expectedBestScore = 0;
  const fallbackCounts = new Map<string, number>();

  for (let run = 0; run < input.simulations; run += 1) {
    const survivors = positionalPool.filter((analysis) => {
      const draw = deterministicProbability(
        input.seed,
        `${input.candidate.player.id}:${run}:${analysis.player.id}`,
      );
      return draw <= analysis.returnProbability;
    });
    if (survivors.some(({ player }) => player.id === input.candidate.player.id)) {
      candidateSurvives += 1;
    }
    const best = survivors.sort((a, b) => b.baseTotal - a.baseTotal)[0];
    expectedBestScore += best?.baseTotal ?? 0;
    if (best && best.player.id !== input.candidate.player.id) {
      fallbackCounts.set(best.player.id, (fallbackCounts.get(best.player.id) ?? 0) + 1);
    }
  }

  const expectedScore = expectedBestScore / input.simulations;
  const fallbackId = [...fallbackCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  const fallback = input.candidates.find(({ player }) => player.id === fallbackId);

  return {
    simulatedReturnProbability: candidateSurvives / input.simulations,
    expectedAlternativeName: fallback?.player.name ?? null,
    expectedAlternativeScore: round(expectedScore),
    opportunityLoss: round(Math.max(0, input.candidate.baseTotal - expectedScore)),
  };
}

function rankOverrideReason(
  candidate: PlayerRecommendation,
  higherRanked: PlayerRecommendation,
  analysisById: Map<string, CandidateAnalysis>,
  players: Player[],
  riskTolerance: RiskTolerance,
): string | null {
  const candidateAnalysis = analysisById.get(candidate.player.id)!;
  const higherAnalysis = analysisById.get(higherRanked.player.id)!;
  const position = primaryPosition(candidate.player);
  const candidateRank = getPositionRank(candidate.player, players, position);
  const higherRank = getPositionRank(higherRanked.player, players, position);
  const projectionEdge =
    candidateAnalysis.projectedPoints - higherAnalysis.projectedPoints;
  const significantProjectionEdge = Math.max(
    18,
    higherAnalysis.projectedPoints * 0.06,
  );

  if (projectionEdge >= significantProjectionEdge) {
    return `Rank exception: ${position}${candidateRank} projects ${round(projectionEdge)} league points above ${position}${higherRank} ${higherRanked.player.name}`;
  }

  const riskEdge = higherRanked.player.risk - candidate.player.risk;
  if (
    riskTolerance === "safe" &&
    riskEdge >= 0.18 &&
    projectionEdge >= -10
  ) {
    return `Rank exception: ${position}${candidateRank} has a substantially safer profile than ${position}${higherRank} ${higherRanked.player.name}`;
  }

  const upsideEdge =
    (candidate.player.upside ?? 0.5) -
    (higherRanked.player.upside ?? 0.5);
  if (
    riskTolerance === "upside" &&
    upsideEdge >= 0.2 &&
    projectionEdge >= -10
  ) {
    return `Rank exception: ${position}${candidateRank} has a substantially stronger upside profile than ${position}${higherRank} ${higherRanked.player.name}`;
  }

  return null;
}

function applyPersonalRankingGuardrails(
  recommendations: PlayerRecommendation[],
  analyses: CandidateAnalysis[],
  players: Player[],
  riskTolerance: RiskTolerance,
): PlayerRecommendation[] {
  const analysisById = new Map(
    analyses.map((analysis) => [analysis.player.id, analysis]),
  );
  const byPosition = new Map<PlayerPosition, PlayerRecommendation[]>();

  for (const recommendation of recommendations) {
    const position = primaryPosition(recommendation.player);
    byPosition.set(position, [
      ...(byPosition.get(position) ?? []),
      recommendation,
    ]);
  }

  return [...byPosition.entries()].flatMap(([position, group]) => {
    const remaining = [...group].sort(
      (a, b) =>
        getPositionRank(a.player, players, position) -
          getPositionRank(b.player, players, position) ||
        a.player.name.localeCompare(b.player.name),
    );
    const ordered: PlayerRecommendation[] = [];
    const exceptionReasons = new Map<string, string>();

    while (remaining.length > 0) {
      const highestRanked = remaining[0];
      const eligibleReasons = new Map<string, string>();
      const eligible = remaining.filter((recommendation, index) => {
        if (index === 0) return true;
        const reason = rankOverrideReason(
          recommendation,
          highestRanked,
          analysisById,
          players,
          riskTolerance,
        );
        if (reason) eligibleReasons.set(recommendation.player.id, reason);
        return Boolean(reason);
      });
      const selected = [...eligible].sort(
        (a, b) =>
          b.breakdown.total - a.breakdown.total ||
          getPositionRank(a.player, players, position) -
            getPositionRank(b.player, players, position),
      )[0];
      const selectedException = eligibleReasons.get(selected.player.id);
      if (selectedException) {
        exceptionReasons.set(selected.player.id, selectedException);
      }
      ordered.push(selected);
      remaining.splice(
        remaining.findIndex(
          (recommendation) => recommendation.player.id === selected.player.id,
        ),
        1,
      );
    }

    let maximumAllowedScore = Number.POSITIVE_INFINITY;
    return ordered.map((recommendation, index) => {
      const rawTotal = recommendation.breakdown.total;
      const adjustedTotal = round(
        Math.min(rawTotal, maximumAllowedScore),
      );
      const rankGuardrail = round(Math.max(0, rawTotal - adjustedTotal));
      maximumAllowedScore = adjustedTotal - 0.1;
      const explanation = [...recommendation.explanation];
      const exceptionReason = exceptionReasons.get(recommendation.player.id);

      if (exceptionReason) explanation.unshift(exceptionReason);
      if (rankGuardrail > 0) {
        const blocker = ordered
          .slice(0, index)
          .reverse()
          .find(
            (higher) =>
              getPositionRank(higher.player, players, position) <
              getPositionRank(recommendation.player, players, position),
          );
        if (blocker) {
          explanation.unshift(
            `Personal ranking guardrail keeps ${position}${getPositionRank(recommendation.player, players, position)} behind available ${position}${getPositionRank(blocker.player, players, position)} ${blocker.player.name}`,
          );
        }
      }

      return {
        ...recommendation,
        breakdown: {
          ...recommendation.breakdown,
          rankGuardrail,
          total: adjustedTotal,
        },
        explanation,
      };
    });
  });
}

export function recommendPlayers({
  players,
  league,
  picks,
  userRoster,
  currentOverall,
  picksUntilNextTurn,
  teams,
  seed = "draft-intelligence",
  riskTolerance = "balanced",
  simulationCount = 128,
  limit = 8,
}: RecommendPlayersInput): PlayerRecommendation[] {
  const draftedPlayerIds = new Set(picks.map((pick) => pick.playerId));
  const available = players.filter(
    (player) => !draftedPlayerIds.has(player.id) && !player.excluded,
  );
  if (available.length === 0) return [];

  const baselines = estimateDynamicReplacementBaselines(players, league, picks);
  const filledBefore = assignedStarterCount(userRoster, league.rosterSlots);
  const nextUserPick = currentOverall + picksUntilNextTurn;
  const spread = Math.max(4, league.teamCount / 2);
  const opponentContexts = buildOpponentTurnContexts({
    players,
    picks,
    teams,
    league,
    currentOverall,
    picksUntilNextTurn,
  });

  const candidates: CandidateAnalysis[] = available.map((player) => {
    const projectedPoints = calculateFantasyPoints(player, league.scoringRules);
    const replacementBaseline = Math.min(
      ...player.positions.map((position) => baselines[position]),
    );
    const replacementValue = projectedPoints - replacementBaseline;
    const replacementContribution = clamp(replacementValue / 6, -8, 22);
    const rankingPosition = primaryPosition(player);
    const personalRankValue = getPositionRankValue(
      player,
      players,
      rankingPosition,
    );
    const rosterConstruction = assessCandidateRosterFit(
      userRoster,
      player,
      league.rosterSlots,
      filledBefore,
    );
    const rosterFit = rosterConstruction.score;
    const samePosition = available
      .filter(
        (candidate) =>
          candidate.id !== player.id &&
          candidate.positions.includes(rankingPosition),
      )
      .map((candidate) => ({
        player: candidate,
        points: calculateFantasyPoints(candidate, league.scoringRules),
      }))
      .sort(
        (a, b) =>
          getPositionRank(a.player, players, rankingPosition) -
          getPositionRank(b.player, players, rankingPosition),
      );
    const playerPositionRank = getPositionRank(player, players, rankingPosition);
    const nextBest = samePosition.find(
      (candidate) =>
        getPositionRank(candidate.player, players, rankingPosition) >
        playerPositionRank,
    );
    const pointDrop = projectedPoints - (nextBest?.points ?? replacementBaseline);
    const playerTier = getPositionTier(player, rankingPosition);
    const tierDrop = Math.max(
      0,
      (nextBest
        ? getPositionTier(nextBest.player, rankingPosition)
        : playerTier) - playerTier,
    );
    const tierScarcity = clamp(pointDrop / 3 + tierDrop * 1.25, 0, 8);
    const run = recentPositionRun(player, picks, players, league.teamCount);
    const needScore = opponentNeedScore(player, opponentContexts, league);
    const opponentDemand = clamp(needScore * 0.72 + run * 0.45, 0, 6);
    const adjustedAdp = getMarketAdp(player, league.teamCount) - opponentDemand * 1.4;
    const returnProbability = clamp(
      1 / (1 + Math.exp((nextUserPick - adjustedAdp) / spread)),
      0.02,
      0.98,
    );
    const availabilityUrgency = (1 - returnProbability) * 7;
    const upsideValue = (player.upside ?? 0.5) * upsideMultiplier(riskTolerance);
    const riskPenalty = player.risk * riskMultiplier(riskTolerance);
    const baseTotal =
      replacementContribution +
      personalRankValue +
      rosterFit +
      tierScarcity +
      availabilityUrgency +
      opponentDemand -
      riskPenalty +
      upsideValue;

    return {
      player,
      projectedPoints,
      replacementValue,
      personalRankValue,
      rosterFit,
      tierScarcity,
      returnProbability,
      availabilityUrgency,
      opponentDemand,
      recentPositionRun: run,
      upsideValue,
      riskPenalty,
      rosterFitReason: rosterConstruction.reason,
      baseTotal,
    };
  });

  const scoredRecommendations = candidates
    .map((candidate): PlayerRecommendation => {
      const wait = simulateWaiting({
        candidate,
        candidates,
        simulations: Math.max(32, Math.round(simulationCount)),
        seed: `${seed}:${currentOverall}:${picks.length}`,
      });
      const opportunityCost = clamp(wait.opportunityLoss, 0, 8);
      const total = candidate.baseTotal + opportunityCost;
      const decision = waitDecision(
        wait.simulatedReturnProbability,
        wait.opportunityLoss,
        candidate.opponentDemand,
      );
      const confidence = clamp(
        0.58 +
          Math.abs(wait.simulatedReturnProbability - 0.5) * 0.45 +
          Math.min(wait.opportunityLoss / 50, 0.1),
        0.58,
        0.92,
      );
      const fallback = wait.expectedAlternativeName
        ? `Waiting most often leaves ${wait.expectedAlternativeName} as the best comparable fallback`
        : "The comparable position pool is unlikely to offer a strong fallback";
      const pressure =
        candidate.opponentDemand >= 3
          ? `${round(candidate.opponentDemand)}/6 opponent pressure with ${candidate.recentPositionRun} recent comparable picks`
          : `Low opponent pressure before pick ${nextUserPick}`;

      return {
        player: candidate.player,
        breakdown: {
          projectedPoints: round(candidate.projectedPoints),
          replacementValue: round(candidate.replacementValue),
          personalRankValue: round(candidate.personalRankValue),
          rosterFit: round(candidate.rosterFit),
          tierScarcity: round(candidate.tierScarcity),
          availabilityUrgency: round(candidate.availabilityUrgency),
          opponentDemand: round(candidate.opponentDemand),
          opportunityCost: round(opportunityCost),
          rankGuardrail: 0,
          upsideValue: round(candidate.upsideValue),
          riskPenalty: round(candidate.riskPenalty),
          total: round(total),
        },
        returnProbability: wait.simulatedReturnProbability,
        decision,
        confidence,
        waitAnalysis: {
          simulations: Math.max(32, Math.round(simulationCount)),
          expectedAlternativeName: wait.expectedAlternativeName,
          expectedAlternativeScore: wait.expectedAlternativeScore,
          opportunityLoss: wait.opportunityLoss,
          recentPositionRun: candidate.recentPositionRun,
          opponentNeedScore: round(candidate.opponentDemand),
        },
        explanation: [
          `${rankingPositionLabel(candidate.player, players)} on your position-based board`,
          candidate.rosterFitReason,
          `${round(candidate.replacementValue)} league points above the live ${candidate.player.positions[0]} replacement line`,
          `${Math.round(wait.simulatedReturnProbability * 100)}% chance to reach pick ${nextUserPick} across ${Math.max(32, Math.round(simulationCount))} wait scenarios`,
          pressure,
          fallback,
        ],
      };
    });

  return applyPersonalRankingGuardrails(
    scoredRecommendations,
    candidates,
    players,
    riskTolerance,
  )
    .sort(
      (a, b) =>
        b.breakdown.total - a.breakdown.total ||
        getPositionRank(a.player, players) - getPositionRank(b.player, players),
    )
    .slice(0, limit);
}

function rankingPositionLabel(player: Player, players: Player[]): string {
  const position = primaryPosition(player);
  return `${position}${getPositionRank(player, players, position)} in tier ${getPositionTier(player, position)}`;
}
