import {
  assignedStarterCount,
  playerIdsForTeam,
  teamForOverallPick,
} from "./draft";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
} from "./scoring";
import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  Player,
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
  riskPenalty: number;
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
    if (context.roster.length < league.rosterSlots.length) return total + 0.2;
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
  const maximumRank = Math.max(...players.map((player) => player.userRank), 1);
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
    const personalRankValue =
      ((maximumRank - player.userRank + 1) / maximumRank) * 10;
    const filledAfter = assignedStarterCount(
      [...userRoster, player],
      league.rosterSlots,
    );
    const rosterFit =
      filledAfter > filledBefore
        ? 7
        : userRoster.length < league.rosterSlots.length
          ? 1.2
          : 0.4;
    const samePosition = available
      .filter(
        (candidate) =>
          candidate.id !== player.id && overlapsPosition(player, candidate),
      )
      .map((candidate) => ({
        player: candidate,
        points: calculateFantasyPoints(candidate, league.scoringRules),
      }))
      .sort((a, b) => b.points - a.points);
    const nextBest = samePosition.find((candidate) => candidate.points <= projectedPoints);
    const pointDrop = projectedPoints - (nextBest?.points ?? replacementBaseline);
    const tierDrop = Math.max(0, (nextBest?.player.tier ?? player.tier) - player.tier);
    const tierScarcity = clamp(pointDrop / 3 + tierDrop * 1.25, 0, 8);
    const run = recentPositionRun(player, picks, players, league.teamCount);
    const needScore = opponentNeedScore(player, opponentContexts, league);
    const opponentDemand = clamp(needScore * 0.72 + run * 0.45, 0, 6);
    const adjustedAdp = player.adp - opponentDemand * 1.4;
    const returnProbability = clamp(
      1 / (1 + Math.exp((nextUserPick - adjustedAdp) / spread)),
      0.02,
      0.98,
    );
    const availabilityUrgency = (1 - returnProbability) * 7;
    const riskPenalty = player.risk * riskMultiplier(riskTolerance);
    const baseTotal =
      replacementContribution +
      personalRankValue +
      rosterFit +
      tierScarcity +
      availabilityUrgency +
      opponentDemand -
      riskPenalty;

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
      riskPenalty,
      baseTotal,
    };
  });

  return candidates
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
          `${round(candidate.replacementValue)} league points above the live ${candidate.player.positions[0]} replacement line`,
          `${Math.round(wait.simulatedReturnProbability * 100)}% chance to reach pick ${nextUserPick} across ${Math.max(32, Math.round(simulationCount))} wait scenarios`,
          pressure,
          fallback,
        ],
      };
    })
    .sort(
      (a, b) =>
        b.breakdown.total - a.breakdown.total ||
        a.player.userRank - b.player.userRank,
    )
    .slice(0, limit);
}
