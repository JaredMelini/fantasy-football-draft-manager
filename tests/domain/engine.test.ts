import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedStarterCount,
  teamForOverallPick,
} from "../../lib/domain/draft";
import {
  analyzeCandidateRollouts,
  integrateRosterOutcomes,
} from "../../lib/domain/candidate-rollout";
import { recommendPlayers } from "../../lib/domain/recommendation";
import { chooseOpponentPlayer } from "../../lib/domain/simulation";
import { simulateDraftWorld } from "../../lib/domain/draft-simulator";
import { assignOptimalRoster } from "../../lib/domain/roster";
import { getMarketSignal } from "../../lib/domain/rankings";
import {
  benchmarkDraftStrategies,
  scoreProbabilityForecasts,
} from "../../lib/domain/validation";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
  findUncoveredScoringStats,
} from "../../lib/domain/scoring";
import {
  demoLeague,
  demoPlayers,
  demoTeams,
  buildDemoTeams,
  initialDemoPicks,
  yahooLeague,
} from "../../lib/sample-data";

test("calculates exact full-PPR fantasy points from raw projections", () => {
  const bijan = demoPlayers.find((player) => player.id === "bijan")!;
  assert.equal(calculateFantasyPoints(bijan, demoLeague.scoringRules), 340);
  assert.deepEqual(
    findUncoveredScoringStats(demoPlayers, demoLeague.scoringRules),
    [],
  );
});

test("league-scored raw projections take precedence and source totals remain a fallback", () => {
  const bijan = demoPlayers.find((player) => player.id === "bijan")!;
  const imported = { ...bijan, sourceProjectedPoints: 287.6 };

  assert.equal(calculateFantasyPoints(imported, demoLeague.scoringRules), 340);
  assert.equal(
    calculateFantasyPoints(
      { ...imported, projectedStats: {} },
      demoLeague.scoringRules,
    ),
    287.6,
  );
});

test("calculates Yahoo big-play and DST categories independently", () => {
  const template = demoPlayers[0];
  const player = {
    ...template,
    projectedStats: {
      passingTouchdowns: 1,
      passing40YardTouchdowns: 1,
      fieldGoals50Plus: 1,
      defenseSacks: 2,
      defensePointsAllowed35Plus: 1,
    },
  };
  const selectedStats = new Set(Object.keys(player.projectedStats));
  const rules = yahooLeague.scoringRules.filter((rule) =>
    selectedStats.has(rule.stat),
  );

  assert.equal(calculateFantasyPoints(player, rules), 11);
});

test("reverses team order in the second round of a snake draft", () => {
  assert.equal(teamForOverallPick(1, demoTeams, "snake").draftSlot, 1);
  assert.equal(teamForOverallPick(10, demoTeams, "snake").draftSlot, 10);
  assert.equal(teamForOverallPick(11, demoTeams, "snake").draftSlot, 10);
  assert.equal(teamForOverallPick(20, demoTeams, "snake").draftSlot, 1);
});

test("assigns players to eligible starter slots without double counting", () => {
  const roster = [
    demoPlayers.find((player) => player.id === "amonra")!,
    demoPlayers.find((player) => player.id === "nacua")!,
    demoPlayers.find((player) => player.id === "bowers")!,
  ];
  assert.equal(assignedStarterCount(roster, demoLeague.rosterSlots), 3);
});

test("optimal lineup assignment starts the highest-value legal players", () => {
  const [low, high, middle] = [
    { ...demoPlayers[2], id: "low", sourceProjectedPoints: 100, projectedStats: {} },
    { ...demoPlayers[3], id: "high", sourceProjectedPoints: 300, projectedStats: {} },
    { ...demoPlayers[4], id: "middle", sourceProjectedPoints: 200, projectedStats: {} },
  ];
  const assignment = assignOptimalRoster(
    [low, high, middle],
    [
      { id: "WR", label: "WR", eligiblePositions: ["WR"] },
      { id: "FLEX", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
    ],
    (player) => player.sourceProjectedPoints ?? 0,
  );
  assert.deepEqual(
    new Set(assignment.starters.map(({ player }) => player.id)),
    new Set(["high", "middle"]),
  );
  assert.equal(assignment.bench[0].id, "low");
});

test("Yahoo recent ADP is shrunk toward the all-draft market", () => {
  const player = {
    ...demoPlayers[0],
    yahooAdpRecent: 10,
    yahooAdpAll: 30,
    yahooPercentDrafted: 80,
    yahooAdpUpdatedAt: "2026-08-09T12:00:00.000Z",
  };
  const signal = getMarketSignal(player, 8, Date.parse("2026-08-09T12:00:00.000Z"));
  assert.equal(signal.source, "Yahoo blended");
  assert.ok(signal.adp > 10 && signal.adp < 30);
  assert.ok(signal.recentWeight < 0.75);
});

test("an overdue elite becomes more attractive to modeled opponents", () => {
  const elite = {
    ...demoPlayers[0],
    id: "overdue-elite",
    yahooAdpAll: 1,
    yahooAdpRecent: 1,
  };
  const onTime = {
    ...demoPlayers[1],
    id: "on-time-player",
    yahooAdpAll: 50,
    yahooAdpRecent: 50,
  };
  const selected = chooseOpponentPlayer({
    available: [elite, onTime],
    roster: [],
    league: yahooLeague,
    overall: 50,
    seed: "overdue-hazard",
    teamId: "opponent",
    strategy: "best-available",
  });
  assert.equal(selected?.id, elite.id);
});

test("sequential draft worlds never duplicate or resurrect players", () => {
  const teams = buildDemoTeams(demoLeague.teamCount, 3);
  const world = simulateDraftWorld({
    players: demoPlayers,
    league: demoLeague,
    teams,
    initialPicks: [],
    seed: "coherent-world",
    userTeamId: "user",
  });
  const playerIds = world.picks.map((pick) => pick.playerId);
  assert.equal(new Set(playerIds).size, playerIds.length);
  assert.deepEqual(
    world.picks.map((pick) => pick.overall),
    Array.from({ length: world.picks.length }, (_, index) => index + 1),
  );
});

test("validation scores forecasts and benchmarks transparent baselines", () => {
  const calibration = scoreProbabilityForecasts([
    { probability: 0.8, occurred: true },
    { probability: 0.2, occurred: false },
  ]);
  assert.ok(Math.abs(calibration.brier - 0.04) < 1e-9);
  assert.ok(Math.abs(calibration.logLoss - -Math.log(0.8)) < 1e-9);
  const teams = buildDemoTeams(demoLeague.teamCount, 3);
  const benchmark = benchmarkDraftStrategies({
    players: demoPlayers,
    league: demoLeague,
    teams,
    userTeamId: "user",
    seed: "baseline-benchmark",
    simulations: 2,
  });
  assert.deepEqual(
    benchmark.map(({ strategy }) => strategy),
    ["engine-v4", "udk-bpa", "yahoo-bpa", "static-vor"],
  );
  assert.ok(benchmark.every((result) => result.completionRate > 0.8));
  assert.equal(Math.min(...benchmark.map((result) => result.averageRegret)), 0);
});

test("recommendations exclude drafted players and are ordered by utility", () => {
  const recommendations = recommendPlayers({
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    userRoster: [],
    currentOverall: 7,
    picksUntilNextTurn: 7,
  });
  const drafted = new Set(initialDemoPicks.map((pick) => pick.playerId));

  assert.ok(recommendations.length > 3);
  assert.ok(recommendations.every(({ player }) => !drafted.has(player.id)));
  assert.ok(
    recommendations.every(
      (recommendation, index) =>
        index === 0 ||
        recommendations[index - 1].breakdown.total >=
          recommendation.breakdown.total,
    ),
  );
});

test("mock opponents prefer Yahoo ADP over fallback ADP", () => {
  const template = demoPlayers.find((player) => player.id === "bijan")!;
  const staleFallbackFavorite = {
    ...template,
    id: "stale-fallback-favorite",
    name: "Stale Fallback Favorite",
    adp: 50,
    yahooAdpRecent: 115,
    userRank: 1,
    positionRanks: { RB: 1 },
  };
  const yahooFavorite = {
    ...template,
    id: "yahoo-favorite",
    name: "Yahoo Favorite",
    adp: 115,
    yahooAdpRecent: 50,
    userRank: 2,
    positionRanks: { RB: 2 },
  };

  const selected = chooseOpponentPlayer({
    available: [staleFallbackFavorite, yahooFavorite],
    roster: [],
    league: yahooLeague,
    overall: 50,
    seed: "yahoo-adp-source",
    teamId: "team-2",
    strategy: "best-available",
  });

  assert.equal(selected?.id, yahooFavorite.id);
});

test("does not recommend an immediate second tight end over open starter needs", () => {
  const teams = buildDemoTeams(yahooLeague.teamCount, 1);
  const bijan = demoPlayers.find((player) => player.id === "bijan")!;
  const bowers = demoPlayers.find((player) => player.id === "bowers")!;
  const recommendations = recommendPlayers({
    players: demoPlayers,
    league: yahooLeague,
    picks: [
      { overall: 1, round: 1, teamId: "user", playerId: bijan.id },
      { overall: 16, round: 2, teamId: "user", playerId: bowers.id },
    ],
    userRoster: [bijan, bowers],
    currentOverall: 17,
    picksUntilNextTurn: 15,
    teams,
    seed: "turn-test",
    limit: demoPlayers.length,
  });
  const mcbride = recommendations.find(
    ({ player }) => player.id === "mcbride",
  )!;

  assert.notEqual(recommendations[0].player.id, "mcbride");
  assert.ok(mcbride.breakdown.rosterFit <= -12);
  assert.ok(
    mcbride.explanation.some((reason) => reason.includes("second TE")),
  );
});

test("reserves the final two roster picks for defense and kicker", () => {
  const template = demoPlayers.find((player) => player.id === "bijan")!;
  const kicker = {
    ...template,
    id: "kicker-test",
    name: "Top Kicker",
    positions: ["K" as const],
    positionRanks: { K: 1 },
    positionTiers: { K: 1 },
    sourceProjectedPoints: undefined,
    projectedStats: {},
  };
  const defense = {
    ...template,
    id: "defense-test",
    name: "Top Defense",
    positions: ["DST" as const],
    positionRanks: { DST: 1 },
    positionTiers: { DST: 1 },
    sourceProjectedPoints: undefined,
    projectedStats: {},
  };
  const players = [...demoPlayers, kicker, defense];
  const teams = buildDemoTeams(yahooLeague.teamCount, 1);
  const corePlayerIds = [
    "joshallen",
    "bijan",
    "gibbs",
    "chase",
    "jefferson",
    "lamb",
    "bowers",
  ];
  const corePlayers = corePlayerIds.map(
    (id) => demoPlayers.find((player) => player.id === id)!,
  );
  const depthPlayers = demoPlayers
    .filter((player) => !corePlayerIds.includes(player.id))
    .slice(0, 6);
  const completeNonSpecialRoster = [...corePlayers, ...depthPlayers];
  const rosterBeforeFinalThree = completeNonSpecialRoster.slice(0, 12);
  const earlyPicks = rosterBeforeFinalThree.map((player, index) => ({
    overall: index + 1,
    round: index + 1,
    teamId: "user",
    playerId: player.id,
  }));
  const beforeFinalTwo = recommendPlayers({
    players,
    league: yahooLeague,
    picks: earlyPicks,
    userRoster: rosterBeforeFinalThree,
    currentOverall: 97,
    picksUntilNextTurn: 15,
    teams,
    seed: "endgame-before-window",
    limit: players.length,
  });

  assert.ok(
    beforeFinalTwo.every(
      ({ player }) => !player.positions.includes("K") && !player.positions.includes("DST"),
    ),
  );

  const rosterWithTwoPicksLeft = completeNonSpecialRoster;
  const twoPickPicks = [
    ...earlyPicks,
    {
      overall: 98,
      round: 13,
      teamId: "user",
      playerId: completeNonSpecialRoster[12].id,
    },
  ];
  const finalTwo = recommendPlayers({
    players,
    league: yahooLeague,
    picks: twoPickPicks,
    userRoster: rosterWithTwoPicksLeft,
    currentOverall: 105,
    picksUntilNextTurn: 15,
    teams,
    seed: "endgame-final-two",
    limit: players.length,
  });

  assert.deepEqual(
    new Set(finalTwo.map(({ player }) => player.positions[0])),
    new Set(["K", "DST"]),
  );
  assert.ok(
    finalTwo.every(({ explanation }) =>
      explanation.some((reason) => reason.includes("Endgame roster plan")),
    ),
  );

  const selectedSpecialist = finalTwo[0].player;
  const lastPick = recommendPlayers({
    players,
    league: yahooLeague,
    picks: [
      ...twoPickPicks,
      {
        overall: 105,
        round: 14,
        teamId: "user",
        playerId: selectedSpecialist.id,
      },
    ],
    userRoster: [...rosterWithTwoPicksLeft, selectedSpecialist],
    currentOverall: 120,
    picksUntilNextTurn: 0,
    teams,
    seed: "endgame-last-pick",
    limit: players.length,
  });
  const stillMissing = selectedSpecialist.positions.includes("K") ? "DST" : "K";

  assert.ok(
    lastPick.every(({ player }) => player.positions.includes(stillMissing)),
  );
});

test("waits on quarterback value but forces every starter before specialists", () => {
  const template = demoPlayers.find((player) => player.id === "bijan")!;
  const kicker = {
    ...template,
    id: "deadline-kicker",
    name: "Deadline Kicker",
    positions: ["K" as const],
    positionRanks: { K: 1 },
    positionTiers: { K: 1 },
    sourceProjectedPoints: undefined,
    projectedStats: {},
  };
  const defense = {
    ...template,
    id: "deadline-defense",
    name: "Deadline Defense",
    positions: ["DST" as const],
    positionRanks: { DST: 1 },
    positionTiers: { DST: 1 },
    sourceProjectedPoints: undefined,
    projectedStats: {},
  };
  const starterIds = [
    "bijan",
    "gibbs",
    "chase",
    "jefferson",
    "lamb",
    "bowers",
  ];
  const nonQuarterbacks = demoPlayers.filter(
    (player) => !player.positions.includes("QB"),
  );
  const completedNonQuarterbackStarters = starterIds.map(
    (id) => demoPlayers.find((player) => player.id === id)!,
  );
  const depthPlayers = nonQuarterbacks.filter(
    (player) => !starterIds.includes(player.id),
  );
  const rosterWithFourPicksLeft = [
    ...completedNonQuarterbackStarters,
    ...depthPlayers.slice(0, 5),
  ];
  const flexPlayer = depthPlayers[5];
  const rosterWithThreePicksLeft = [...rosterWithFourPicksLeft, flexPlayer];
  const players = [...demoPlayers, kicker, defense];
  const teams = buildDemoTeams(yahooLeague.teamCount, 1);
  const recommendationsFor = (roster: typeof rosterWithFourPicksLeft) => {
    const picks = roster.map((player, index) => ({
      overall: index + 1,
      round: index + 1,
      teamId: "user",
      playerId: player.id,
    }));
    return recommendPlayers({
      players,
      league: yahooLeague,
      picks,
      userRoster: roster,
      currentOverall: 90 + roster.length,
      picksUntilNextTurn: 15,
      teams,
      seed: `starter-deadline-${roster.length}`,
      limit: players.length,
    });
  };

  const beforeDeadline = recommendationsFor(rosterWithFourPicksLeft);
  assert.ok(
    beforeDeadline.some(
      ({ player }) => !player.positions.includes("QB"),
    ),
  );
  const quarterbackBeforeDeadline = beforeDeadline.find(({ player }) =>
    player.positions.includes("QB"),
  )!;
  assert.ok(quarterbackBeforeDeadline.breakdown.rosterFit <= 1.5);
  assert.ok(
    quarterbackBeforeDeadline.explanation.some((reason) =>
      reason.includes("enough later picks remain"),
    ),
  );

  const atDeadline = recommendationsFor(rosterWithThreePicksLeft);
  assert.ok(atDeadline.length > 0);
  assert.ok(
    atDeadline.every(({ player }) => player.positions.includes("QB")),
  );
  assert.ok(
    atDeadline.every(({ explanation }) =>
      explanation.some((reason) =>
        reason.includes("Roster completion deadline"),
      ),
    ),
  );
});

test("personal position rank is a soft prior rather than a hard outcome veto", () => {
  const template = demoPlayers.find((player) => player.id === "bijan")!;
  const kyren = {
    ...template,
    id: "kyren-test",
    name: "Kyren Williams",
    adp: 100,
    positionRanks: { RB: 14 },
    positionTiers: { RB: 4 },
    risk: 0.15,
    upside: 0.6,
    projectedStats: {
      rushingYards: 1000,
      rushingTouchdowns: 8,
      receptions: 50,
      receivingYards: 400,
      receivingTouchdowns: 3,
    },
  };
  const breece = {
    ...kyren,
    id: "breece-test",
    name: "Breece Hall",
    adp: 1,
    positionRanks: { RB: 17 },
    projectedStats: {
      ...kyren.projectedStats,
      rushingYards: 1100,
    },
  };
  const shared = {
    league: yahooLeague,
    picks: [],
    userRoster: [],
    currentOverall: 17,
    picksUntilNextTurn: 15,
    teams: buildDemoTeams(yahooLeague.teamCount, 1),
    seed: "position-rank-guardrail",
    limit: 2,
  };
  const guarded = recommendPlayers({
    ...shared,
    players: [kyren, breece],
  });
  const guardedBreece = guarded.find(
    ({ player }) => player.id === breece.id,
  )!;

  assert.equal(guarded[0].player.id, breece.id);
  assert.equal(guardedBreece.breakdown.rankGuardrail, 0);
  const rosterGuarded = integrateRosterOutcomes(
    guarded,
    [
      {
        playerId: kyren.id,
        simulations: 24,
        averageRosterGrade: 70,
        floorRosterGrade: 68,
        ceilingRosterGrade: 72,
        averageStarterPoints: 1200,
        completionRate: 1,
        averageRosterRisk: 0.15,
        downsideLineupPoints: 100,
        playoffProbability: 0.5,
        championshipProbability: 0.1,
        expectedRegret: 25,
        confidenceLow: 68,
        confidenceHigh: 72,
      },
      {
        playerId: breece.id,
        simulations: 24,
        averageRosterGrade: 95,
        floorRosterGrade: 92,
        ceilingRosterGrade: 98,
        averageStarterPoints: 1300,
        completionRate: 1,
        averageRosterRisk: 0.15,
        downsideLineupPoints: 110,
        playoffProbability: 0.8,
        championshipProbability: 0.3,
        expectedRegret: 0,
        confidenceLow: 92,
        confidenceHigh: 98,
      },
    ],
    "balanced",
  );
  assert.equal(rosterGuarded[0].player.id, breece.id);

  const projectionException = recommendPlayers({
    ...shared,
    players: [
      kyren,
      {
        ...breece,
        projectedStats: {
          ...breece.projectedStats,
          rushingYards: 1400,
        },
      },
    ],
  });

  assert.equal(projectionException[0].player.id, breece.id);
  assert.equal(projectionException[0].breakdown.rankGuardrail, 0);
});

test("advanced recommendations model live baselines, opponents, and deterministic wait scenarios", () => {
  const baselines = estimateDynamicReplacementBaselines(
    demoPlayers,
    demoLeague,
    initialDemoPicks,
  );
  assert.ok(baselines.RB > 0);
  assert.ok(baselines.WR > 0);

  const input = {
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    userRoster: [],
    currentOverall: 7,
    picksUntilNextTurn: 7,
    teams: demoTeams,
    seed: "advanced-engine",
    simulationCount: 160,
    limit: demoPlayers.length,
  };
  const first = recommendPlayers(input);
  const second = recommendPlayers(input);

  assert.deepEqual(first, second);
  assert.equal(first[0].waitAnalysis.simulations, 160);
  assert.ok(first[0].waitAnalysis.opponentNeedScore > 0);
  assert.ok(first[0].confidence >= 0.58 && first[0].confidence <= 0.92);
  assert.ok(["draft-now", "lean-now", "can-wait"].includes(first[0].decision));
  assert.ok(first[0].explanation.some((reason) => reason.includes("wait scenarios")));
});

test("risk preferences change the penalty without changing player data", () => {
  const shared = {
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    userRoster: [],
    currentOverall: 7,
    picksUntilNextTurn: 7,
    teams: demoTeams,
    seed: "risk-profile",
    limit: demoPlayers.length,
  };
  const safe = recommendPlayers({ ...shared, riskTolerance: "safe" });
  const upside = recommendPlayers({ ...shared, riskTolerance: "upside" });
  const safeMccaffrey = safe.find(({ player }) => player.id === "mccaffrey")!;
  const upsideMccaffrey = upside.find(({ player }) => player.id === "mccaffrey")!;

  assert.ok(safeMccaffrey.breakdown.riskPenalty > upsideMccaffrey.breakdown.riskPenalty);
  assert.equal(safeMccaffrey.player.risk, upsideMccaffrey.player.risk);
});

test("completed-roster rollouts produce deterministic comparison lenses", () => {
  const recommendations = recommendPlayers({
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    userRoster: [],
    currentOverall: 7,
    picksUntilNextTurn: 7,
    teams: demoTeams,
    seed: "roster-rollout",
    limit: demoPlayers.length,
  });
  const input = {
    recommendations,
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    teams: demoTeams,
    userTeamId: "user",
    userRoster: [],
    decisionOverall: 7,
    seed: "roster-rollout",
    simulationCount: 24,
    candidateLimit: 8,
  };
  const started = performance.now();
  const first = analyzeCandidateRollouts(input);
  const firstDuration = performance.now() - started;
  const second = analyzeCandidateRollouts(input);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.lenses.map(({ key }) => key),
    ["roster", "safe", "upside", "pivot"],
  );
  assert.equal(first.summaries.length, 8);
  assert.ok(first.summaries.every((summary) => summary.completionRate >= 0.8));
  assert.ok(first.summaries.every((summary) => summary.floorRosterGrade <= summary.ceilingRosterGrade));
  const bestPlayer = demoPlayers.find(
    (player) => player.id === first.lenses[0].playerId,
  )!;
  const pivotPlayer = demoPlayers.find(
    (player) => player.id === first.lenses[3].playerId,
  )!;
  assert.notEqual(bestPlayer.positions[0], pivotPlayer.positions[0]);
  assert.ok(firstDuration < 1500);
});

test("unified decisions prioritize expected roster outcomes over a small live-score edge", () => {
  const base = recommendPlayers({
    players: demoPlayers,
    league: demoLeague,
    picks: initialDemoPicks,
    userRoster: [],
    currentOverall: 7,
    picksUntilNextTurn: 7,
    teams: demoTeams,
    seed: "unified-decision",
    limit: demoPlayers.length,
  });
  const immediateBest = base[0];
  const alternate = base.find(
    (recommendation) =>
      recommendation.player.positions[0] !==
      immediateBest.player.positions[0],
  )!;
  const unified = integrateRosterOutcomes(
    [immediateBest, alternate],
    [
      {
        playerId: immediateBest.player.id,
        simulations: 24,
        averageRosterGrade: 72,
        floorRosterGrade: 68,
        ceilingRosterGrade: 76,
        averageStarterPoints: 1200,
        completionRate: 1,
        averageRosterRisk: 0.2,
      },
      {
        playerId: alternate.player.id,
        simulations: 24,
        averageRosterGrade: 90,
        floorRosterGrade: 86,
        ceilingRosterGrade: 94,
        averageStarterPoints: 1300,
        completionRate: 1,
        averageRosterRisk: 0.2,
      },
    ],
    "balanced",
  );

  assert.equal(unified[0].player.id, alternate.player.id);
  assert.equal(unified[0].breakdown.expectedRosterGrade, 90);
  assert.equal(
    unified[0].breakdown.immediateScore,
    alternate.breakdown.total,
  );
  assert.ok(
    unified[0].explanation.some((reason) => reason.includes("65%")),
  );
});
