import assert from "node:assert/strict";
import test from "node:test";
import { playerIdsForTeam } from "../../lib/domain/draft";
import { evaluateUserDraft } from "../../lib/domain/draft-evaluation";
import {
  createPickEvent,
  createUndoEvent,
  eventsFromPicks,
  mergeDraftEvents,
  replayDraftEvents,
  validateNextPick,
} from "../../lib/domain/draft-session";
import { assignRoster } from "../../lib/domain/roster";
import { simulateDraftToEnd } from "../../lib/domain/simulation";
import {
  buildDemoTeams,
  buildInitialDemoPicks,
  demoLeague,
  demoPlayers,
} from "../../lib/sample-data";

test("reconstructs active picks from immutable pick and undo events", () => {
  const initial = eventsFromPicks(buildInitialDemoPicks(10), "provider");
  const pick = createPickEvent({
    events: initial,
    source: "manual",
    recommendedPlayerId: "amonra",
    pick: {
      overall: 7,
      round: 1,
      teamId: "user",
      playerId: "amonra",
    },
  });
  const withPick = [...initial, pick];
  const undo = createUndoEvent(withPick)!;
  const replayed = replayDraftEvents([...withPick, undo, pick]);

  assert.equal(replayed.picks.length, initial.length);
  assert.ok(!replayed.picks.some((draftPick) => draftPick.playerId === "amonra"));
  assert.equal(mergeDraftEvents(initial, [initial[0], pick]).length, initial.length + 1);
});

test("validates turn ownership, ordering, player existence, and duplicates", () => {
  const teams = buildDemoTeams(10);
  const currentPicks = buildInitialDemoPicks(10);
  const valid = validateNextPick({
    pick: { overall: 7, round: 1, teamId: "user", playerId: "amonra" },
    currentPicks,
    teams,
    draftType: "snake",
    players: demoPlayers,
  });
  assert.equal(valid.valid, true);

  const invalid = validateNextPick({
    pick: { overall: 8, round: 2, teamId: "team-1", playerId: "bijan" },
    currentPicks,
    teams,
    draftType: "snake",
    players: demoPlayers,
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 4);
});

test("assigns flexible starters and leaves ineligible excess players on the bench", () => {
  const roster = [
    demoPlayers.find((player) => player.id === "bowers")!,
    demoPlayers.find((player) => player.id === "amonra")!,
    demoPlayers.find((player) => player.id === "nacua")!,
  ];
  const assignment = assignRoster(roster, [
    { id: "WR", label: "WR", eligiblePositions: ["WR"] },
    { id: "FLEX", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
  ]);

  assert.equal(assignment.starters.length, 2);
  assert.equal(assignment.bench.length, 1);
  assert.equal(assignment.openSlots.length, 0);
});

test("produces a deterministic complete mock from the same seed", () => {
  const teams = buildDemoTeams(demoLeague.teamCount);
  const initial = eventsFromPicks(
    buildInitialDemoPicks(demoLeague.teamCount),
    "provider",
  );
  const input = {
    events: initial,
    teams,
    league: demoLeague,
    players: demoPlayers,
    seed: "repeatable-seed",
    strategy: "balanced" as const,
  };
  const first = simulateDraftToEnd(input);
  const second = simulateDraftToEnd(input);
  const firstPicks = replayDraftEvents(first).picks;
  const secondPicks = replayDraftEvents(second).picks;

  assert.equal(firstPicks.length, 70);
  assert.deepEqual(firstPicks, secondPicks);
  assert.equal(new Set(firstPicks.map((pick) => pick.playerId)).size, 70);

  const userTeam = teams.find((team) => team.isUser)!;
  const userIds = playerIdsForTeam(firstPicks, userTeam.id);
  assert.equal(userIds.length, demoLeague.rosterSlots.length);
  const evaluation = evaluateUserDraft({
    events: first,
    userTeamId: userTeam.id,
    players: demoPlayers,
    league: demoLeague,
  });
  assert.equal(evaluation.openStarterSlots, 0);
  assert.ok(evaluation.score >= 80);
});
