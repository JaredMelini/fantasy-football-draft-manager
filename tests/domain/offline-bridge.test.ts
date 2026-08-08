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
  assert.deepEqual(picks.slice(-2).map((pick) => pick.overall), [7, 8]);
  assert.deepEqual(picks.slice(-2).map((pick) => pick.teamId), ["user", "team-8"]);
});

test("round-trips a complete portable offline package", () => {
  const original = packageForExport(createDefaultOfflinePackage());
  const parsed = parseOfflinePackage(JSON.stringify(original));

  assert.equal(parsed.version, 1);
  assert.equal(parsed.league.name, original.league.name);
  assert.equal(parsed.players.length, original.players.length);
  assert.equal(parsed.events.length, original.events.length);
});

test("default local rankings exclude synthetic depth players", () => {
  const state = createDefaultOfflinePackage();

  assert.equal(
    state.players.some((player) => player.id.startsWith("demo-")),
    false,
  );
});

test("rejects unknown or incomplete package formats", () => {
  assert.throws(
    () => parseOfflinePackage('{"version":2}'),
    /Expected offline package version 1/,
  );
  assert.throws(
    () => parseOfflinePackage('{"version":1}'),
    /Package export date is missing/,
  );
});
