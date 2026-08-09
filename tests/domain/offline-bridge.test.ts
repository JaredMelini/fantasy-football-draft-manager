import assert from "node:assert/strict";
import test from "node:test";
import { replayDraftEvents } from "../../lib/domain/draft-session";
import {
  appendCapturedPicks,
  parseDraftPickCapture,
} from "../../lib/import/draft-picks";
import {
  createDefaultOfflinePackage,
  packageForExport,
  parseOfflinePackage,
} from "../../lib/offline-package";
import { buildDemoTeams, demoLeague, demoPlayers } from "../../lib/sample-data";

test("matches player names inside copied draft-log lines", () => {
  const result = parseDraftPickCapture(
    [
      "1.07 — Amon-Ra St. Brown — My Team",
      "Pick 8: Puka Nacua (LAR)",
      "Amon-Ra St. Brown",
      "Unknown Player",
    ].join("\n"),
    demoPlayers,
  );

  assert.deepEqual(
    result.matches.map((match) => match.playerId),
    ["amonra", "nacua"],
  );
  assert.deepEqual(result.duplicates, ["Amon-Ra St. Brown"]);
  assert.deepEqual(result.unmatched, ["Unknown Player"]);
});

test("turns captured names into ordered event-sourced picks", () => {
  const state = createDefaultOfflinePackage();
  const existingPicks = replayDraftEvents(state.events).picks;
  const draftedIds = new Set(existingPicks.map((pick) => pick.playerId));
  const capture = parseDraftPickCapture(
    "Amon-Ra St. Brown\nPuka Nacua",
    demoPlayers,
    draftedIds,
  );
  const events = appendCapturedPicks({
    events: state.events,
    matches: capture.matches,
    teams: buildDemoTeams(demoLeague.teamCount),
    league: demoLeague,
  });
  const picks = replayDraftEvents(events).picks;

  assert.equal(picks.length, existingPicks.length + 2);
  assert.deepEqual(picks.slice(-2).map((pick) => pick.overall), [1, 2]);
  assert.deepEqual(picks.slice(-2).map((pick) => pick.teamId), ["team-1", "team-2"]);
});

test("round-trips a complete portable offline package", () => {
  const original = packageForExport(createDefaultOfflinePackage());
  const parsed = parseOfflinePackage(JSON.stringify(original));

  assert.equal(parsed.version, 2);
  assert.equal(parsed.league.name, original.league.name);
  assert.equal(parsed.players.length, original.players.length);
  assert.equal(parsed.events.length, original.events.length);
});

test("default local player board starts empty", () => {
  const state = createDefaultOfflinePackage();

  assert.deepEqual(state.players, []);
});

test("rejects unknown or incomplete package formats", () => {
  assert.throws(
    () => parseOfflinePackage('{"version":3}'),
    /Expected offline package version 2/,
  );
  assert.throws(
    () => parseOfflinePackage('{"version":1}'),
    /Package export date is missing/,
  );
});

test("migrates v1 packages with safe v4 defaults", () => {
  const current = packageForExport(createDefaultOfflinePackage());
  const legacy = { ...current, version: 1 } as Record<string, unknown>;
  delete legacy.opponentProfiles;
  delete legacy.dataSnapshots;
  const parsed = parseOfflinePackage(JSON.stringify(legacy));
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.opponentProfiles, []);
  assert.deepEqual(parsed.dataSnapshots, []);
});
