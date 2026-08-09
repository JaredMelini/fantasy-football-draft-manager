import assert from "node:assert/strict";
import test from "node:test";
import { auditLeagueSettings, auditSummary } from "../../lib/domain/audit";
import {
  applyRankingImport,
  buildRankingImport,
  buildUdkRankingImport,
  guessRankingColumnMap,
  parseDelimitedRankings,
  rankingUpdateFromReview,
  tableFromRows,
} from "../../lib/import/rankings";
import {
  demoLeague,
  demoPlayers,
  yahooLeague,
} from "../../lib/sample-data";

test("parses quoted ranking CSV and imports matched player edits", () => {
  const table = parseDelimitedRankings(
    [
      "Rank,Player,Team,Pos,Tier,ADP,Notes",
      '1,"Ja\'Marr Chase",CIN,WR,1,2.5,"Elite, safe floor"',
      "2,Jahmyr Gibbs,DET,RB,1,3.2,Target in PPR",
    ].join("\n"),
  );
  const result = buildRankingImport(
    table,
    demoPlayers,
    guessRankingColumnMap(table.headers),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.updates.length, 2);
  assert.equal(result.updates[0].notes, "Elite, safe floor");

  const updated = applyRankingImport(demoPlayers, result.updates);
  const chase = updated.find((player) => player.id === "chase")!;
  assert.equal(chase.userRank, 1);
  assert.equal(chase.adp, 2.5);
  assert.equal(chase.notes, "Elite, safe floor");
});

test("reports duplicate and unmatched ranking rows without silent discards", () => {
  const table = parseDelimitedRankings(
    "Rank,Player,Team,Pos\n1,Bijan Robinson,ATL,RB\n2,Bijan Robinson,ATL,RB\n3,Unknown Player,FA,RB",
  );
  const result = buildRankingImport(
    table,
    demoPlayers,
    guessRankingColumnMap(table.headers),
  );

  assert.deepEqual(result.duplicates, ["Bijan Robinson"]);
  assert.deepEqual(result.unmatched, ["Unknown Player"]);
  assert.equal(result.updates.length, 1);
  assert.deepEqual(
    result.reviewRows.map(({ status, rowNumber }) => ({ status, rowNumber })),
    [
      { status: "duplicate", rowNumber: 3 },
      { status: "unmatched", rowNumber: 4 },
    ],
  );
  assert.equal(result.reviewRows[0].suggestions[0].playerId, "bijan");
});

test("suggests close player matches and safely applies a reviewed row", () => {
  const table = parseDelimitedRankings(
    "Rank,Player,Team,Pos,Tier,ADP\n4,Bjan Robinson,ATL,RB,2,5.5",
  );
  const result = buildRankingImport(
    table,
    demoPlayers,
    guessRankingColumnMap(table.headers),
  );
  const review = result.reviewRows[0];

  assert.equal(review.status, "unmatched");
  assert.equal(review.suggestions[0].playerId, "bijan");
  assert.ok(review.suggestions[0].score >= 80);

  const bijan = demoPlayers.find((player) => player.id === "bijan")!;
  const update = rankingUpdateFromReview(review, bijan);
  const updated = applyRankingImport(demoPlayers, [update]);
  const imported = updated.find((player) => player.id === "bijan")!;
  assert.equal(imported.userRank, 4);
  assert.equal(imported.tier, 2);
  assert.equal(imported.adp, 5.5);
});

test("normalizes spreadsheet rows into the universal ranking table", () => {
  const table = tableFromRows([
    ["Rank", "Player", "Active"],
    [1, "Bijan Robinson", true],
  ]);

  assert.deepEqual(table.headers, ["Rank", "Player", "Active"]);
  assert.deepEqual(table.rows, [[1, "Bijan Robinson", "true"]]);
});

test("imports UDK ranks and tiers as position-specific values", () => {
  const table = parseDelimitedRankings(
    [
      "Name,Position,Team,Bye Week,Rank,Points,Risk,Upside,ADP,Tier",
      "Brock Bowers,TE,LV,8,1,260.3,2.5,9.8,3.04,1",
      "New Rookie,TE,FA,9,8,141.2,4.0,8.0,14.02,4",
    ].join("\n"),
  );
  const result = buildUdkRankingImport([table], demoPlayers);

  assert.equal(result.errors.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.newPlayers.length, 1);
  const updated = applyRankingImport(
    demoPlayers,
    result.updates,
    result.newPlayers,
  );
  const bowersBefore = demoPlayers.find((player) => player.id === "bowers")!;
  const bowers = updated.find((player) => player.id === "bowers")!;

  assert.equal(bowers.positionRanks?.TE, 1);
  assert.equal(bowers.positionTiers?.TE, 1);
  assert.equal(bowers.risk, 0.25);
  assert.equal(bowers.upside, 0.98);
  assert.equal(bowers.sourceAdp, "3.04");
  assert.equal(bowers.sourceProjectedPoints, 260.3);
  assert.deepEqual(bowers.projectedStats, {});
  assert.equal(bowers.rankingSource, "Fantasy Footballers UDK");
  assert.equal(bowers.userRank, bowersBefore.userRank);
  assert.equal(bowers.adp, bowersBefore.adp);
  const rookie = updated.find((player) => player.name === "New Rookie")!;
  assert.equal(rookie.positionRanks?.TE, 8);
  assert.equal(rookie.sourceProjectedPoints, 141.2);
  assert.equal(rookie.sourceAdp, "14.02");
});

test("accepts UDK kicker and defense exports without a points column", () => {
  const kickerTable = parseDelimitedRankings(
    [
      "Name,Position,Team,Bye Week,Rank,Risk,Upside,ADP,Tier",
      "Brandon Aubrey,K,DAL,10,1,2.0,9.0,13.02,1",
    ].join("\n"),
  );
  const defenseTable = parseDelimitedRankings(
    [
      "Name,Position,Team,Bye Week,Rank,Risk,Upside,ADP,Tier",
      "Denver Broncos,D/ST,DEN,12,1,2.5,8.5,14.03,1",
    ].join("\n"),
  );

  const result = buildUdkRankingImport(
    [kickerTable, defenseTable],
    demoPlayers,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.newPlayers.length, 2);
  assert.deepEqual(
    result.newPlayers.map((player) => player.positions[0]),
    ["K", "DST"],
  );
  assert.ok(
    result.newPlayers.every(
      (player) => player.sourceProjectedPoints === undefined,
    ),
  );
});

test("audits modeled settings and flags unsupported projection coverage", () => {
  const baseline = auditLeagueSettings(demoLeague, demoPlayers);
  assert.deepEqual(auditSummary(baseline), {
    modeled: 5,
    warnings: 1,
    errors: 0,
  });

  const withKickerRule = auditLeagueSettings(
    {
      ...demoLeague,
      scoringRules: [
        ...demoLeague.scoringRules,
        { stat: "fieldGoalsMade", label: "Field goals", pointsPerUnit: 3 },
      ],
    },
    demoPlayers,
  );
  assert.equal(
    withKickerRule.find((item) => item.id === "scoring")?.status,
    "warning",
  );
});

test("stores the fixed Yahoo league scoring and roster settings", () => {
  assert.equal(yahooLeague.id, "yahoo-595211");
  assert.equal(yahooLeague.name, "Trip");
  assert.equal(yahooLeague.teamCount, 8);
  assert.equal(yahooLeague.draftType, "snake");
  assert.equal(yahooLeague.draftPickSeconds, 90);
  assert.equal(yahooLeague.userDraftSlot, undefined);
  assert.equal(yahooLeague.rosterSlots.length, 9);
  assert.equal(yahooLeague.benchSlots, 6);
  assert.equal(yahooLeague.irSlots, 1);
  assert.equal(yahooLeague.keeperLeague, false);
  assert.deepEqual(yahooLeague.draftPositionLimits, {});
  assert.equal(yahooLeague.scoringRules.length, 39);
  assert.equal(
    auditLeagueSettings(yahooLeague, demoPlayers).find(
      (item) => item.id === "draft-slot",
    )?.status,
    "warning",
  );
  assert.equal(
    yahooLeague.scoringRules.find(
      (rule) => rule.stat === "passingTouchdowns",
    )?.pointsPerUnit,
    6,
  );
  assert.equal(
    yahooLeague.scoringRules.find(
      (rule) => rule.stat === "defensePointsAllowed35Plus",
    )?.pointsPerUnit,
    -4,
  );
});

test("blocks invalid league size and duplicate roster-slot identifiers", () => {
  const audit = auditLeagueSettings(
    {
      ...demoLeague,
      teamCount: 3,
      rosterSlots: [demoLeague.rosterSlots[0], demoLeague.rosterSlots[0]],
    },
    demoPlayers,
  );

  assert.equal(audit.find((item) => item.id === "teams")?.status, "error");
  assert.equal(audit.find((item) => item.id === "roster")?.status, "error");
});
