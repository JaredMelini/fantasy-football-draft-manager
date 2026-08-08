import assert from "node:assert/strict";
import test from "node:test";
import { auditLeagueSettings, auditSummary } from "../../lib/domain/audit";
import {
  applyRankingImport,
  buildRankingImport,
  guessRankingColumnMap,
  parseDelimitedRankings,
  tableFromRows,
} from "../../lib/import/rankings";
import { demoLeague, demoPlayers } from "../../lib/sample-data";

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
});

test("normalizes spreadsheet rows into the universal ranking table", () => {
  const table = tableFromRows([
    ["Rank", "Player", "Active"],
    [1, "Bijan Robinson", true],
  ]);

  assert.deepEqual(table.headers, ["Rank", "Player", "Active"]);
  assert.deepEqual(table.rows, [[1, "Bijan Robinson", "true"]]);
});

test("audits modeled settings and flags unsupported projection coverage", () => {
  const baseline = auditLeagueSettings(demoLeague, demoPlayers);
  assert.deepEqual(auditSummary(baseline), {
    modeled: 4,
    warnings: 0,
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
