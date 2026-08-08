import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedStarterCount,
  teamForOverallPick,
} from "../../lib/domain/draft";
import { recommendPlayers } from "../../lib/domain/recommendation";
import {
  calculateFantasyPoints,
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
