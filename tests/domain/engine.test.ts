import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedStarterCount,
  teamForOverallPick,
} from "../../lib/domain/draft";
import { analyzeCandidateRollouts } from "../../lib/domain/candidate-rollout";
import { recommendPlayers } from "../../lib/domain/recommendation";
import {
  calculateFantasyPoints,
  estimateDynamicReplacementBaselines,
  findUncoveredScoringStats,
} from "../../lib/domain/scoring";
import {
  demoLeague,
  demoPlayers,
  demoTeams,
  initialDemoPicks,
} from "../../lib/sample-data";

test("calculates exact full-PPR fantasy points from raw projections", () => {
  const bijan = demoPlayers.find((player) => player.id === "bijan")!;
  assert.equal(calculateFantasyPoints(bijan, demoLeague.scoringRules), 340);
  assert.deepEqual(
    findUncoveredScoringStats(demoPlayers, demoLeague.scoringRules),
    [],
  );
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
  const second = analyzeCandidateRollouts(input);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.lenses.map(({ key }) => key),
    ["best", "safe", "upside", "pivot"],
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
  assert.ok(performance.now() - started < 1000);
});
