import {
  findUncoveredScoringStats,
  projectionCoverageForPlayer,
  projectionModeForPlayer,
} from "./scoring";
import type { LeagueSettings, Player } from "./types";

export type AuditStatus = "modeled" | "warning" | "error";

export interface LeagueAuditItem {
  id: string;
  label: string;
  status: AuditStatus;
  detail: string;
}

export function auditLeagueSettings(
  league: LeagueSettings,
  players: Player[],
): LeagueAuditItem[] {
  const items: LeagueAuditItem[] = [];

  items.push({
    id: "teams",
    label: "League size",
    status:
      Number.isInteger(league.teamCount) &&
      league.teamCount >= 4 &&
      league.teamCount <= 20
        ? "modeled"
        : "error",
    detail:
      league.teamCount >= 4 && league.teamCount <= 20
        ? `${league.teamCount} teams included in replacement demand and pick timing.`
        : "Team count must be a whole number from 4 through 20.",
  });

  items.push({
    id: "draft-type",
    label: "Draft format",
    status: league.draftType === "salary-cap" ? "warning" : "modeled",
    detail:
      league.draftType === "salary-cap"
        ? "Salary-cap valuation requires the separate auction engine planned for M6."
        : `${league.draftType === "snake" ? "Snake" : "Linear"} pick ownership is modeled.`,
  });

  const duplicateSlotIds = league.rosterSlots.filter(
    (slot, index, slots) =>
      slots.findIndex((candidate) => candidate.id === slot.id) !== index,
  );
  const invalidSlots = league.rosterSlots.filter(
    (slot) => slot.eligiblePositions.length === 0,
  );
  items.push({
    id: "roster",
    label: "Roster positions",
    status:
      league.rosterSlots.length === 0 ||
      duplicateSlotIds.length > 0 ||
      invalidSlots.length > 0
        ? "error"
        : "modeled",
    detail:
      league.rosterSlots.length === 0
        ? "Add at least one starting roster position."
        : duplicateSlotIds.length > 0
          ? "Roster slot identifiers must be unique."
          : invalidSlots.length > 0
            ? "Every roster slot needs at least one eligible player position."
            : `${league.rosterSlots.length} starters, ${league.benchSlots ?? 0} bench, and ${league.irSlots ?? 0} IR slots modeled.`,
  });

  items.push({
    id: "draft-timing",
    label: "Draft timing",
    status:
      (league.draftPickSeconds ?? 0) > 0 && Boolean(league.draftDateTime)
        ? "modeled"
        : "warning",
    detail:
      (league.draftPickSeconds ?? 0) > 0 && league.draftDateTime
        ? `${league.draftPickSeconds}-second picks scheduled for ${league.draftDateTime.replace("T", " ")} (${league.draftTimeZone ?? "local time"}).`
        : "Add the scheduled draft time and pick clock for session preparation.",
  });

  if (league.providerLeagueId) {
    items.push({
      id: "draft-slot",
      label: "Your draft slot",
      status: league.userDraftSlot ? "modeled" : "warning",
      detail: league.userDraftSlot
        ? `Your team is assigned to draft slot ${league.userDraftSlot}.`
        : "Yahoo will randomize the order 30 minutes before the draft. Enter your slot here when it is announced.",
    });
  }

  const hasPositionLimits = Object.keys(
    league.draftPositionLimits ?? {},
  ).length > 0;
  items.push({
    id: "keepers-limits",
    label: "Keepers and draft limits",
    status: league.keeperLeague || hasPositionLimits ? "warning" : "modeled",
    detail:
      league.keeperLeague || hasPositionLimits
        ? "Keeper costs or position caps require additional draft constraints."
        : "No keepers and no positional draft limits.",
  });

  const uncovered = findUncoveredScoringStats(players, league.scoringRules);
  items.push({
    id: "scoring",
    label: "Scoring and projections",
    status:
      league.scoringRules.length === 0
        ? "error"
        : uncovered.length > 0
          ? "warning"
          : "modeled",
    detail:
      league.scoringRules.length === 0
        ? "Add at least one scoring rule."
        : uncovered.length > 0
          ? `Missing projections for: ${uncovered.join(", ")}.`
          : `${league.scoringRules.length} scoring rules have projection coverage.`,
  });

  const duplicatePlayerIds = players.filter(
    (player, index) => players.findIndex((candidate) => candidate.id === player.id) !== index,
  );
  const minimumPool = league.teamCount *
    (league.rosterSlots.length + (league.benchSlots ?? 0));
  items.push({
    id: "player-pool",
    label: "Player identity and pool",
    status:
      duplicatePlayerIds.length > 0 || players.length < minimumPool
        ? "error"
        : "modeled",
    detail:
      duplicatePlayerIds.length > 0
        ? `${duplicatePlayerIds.length} duplicate player IDs must be resolved before simulation.`
        : players.length < minimumPool
          ? `${players.length} players cannot fill ${minimumPool} league roster spots.`
          : `${players.length} uniquely identified players cover ${minimumPool} draft selections.`,
  });

  const rawPlayers = players.filter(
    (player) => projectionModeForPlayer(player) === "raw-league-scored",
  );
  const sourceTotalPlayers = players.filter(
    (player) => projectionModeForPlayer(player) === "source-total",
  );
  const incompleteRaw = rawPlayers.filter(
    (player) => projectionCoverageForPlayer(player, league.scoringRules) < 0.6,
  );
  items.push({
    id: "projection-provenance",
    label: "Projection provenance",
    status:
      players.length === 0
        ? "warning"
        : incompleteRaw.length > 0
          ? "warning"
          : "modeled",
    detail:
      players.length === 0
        ? "Import rankings and projections before drafting."
        : `${rawPlayers.length} league-scored raw projections, ${sourceTotalPlayers.length} source totals, and ${players.length - rawPlayers.length - sourceTotalPlayers.length} rank-only players.${incompleteRaw.length > 0 ? ` ${incompleteRaw.length} raw rows have under 60% scoring-category coverage.` : ""}`,
  });

  const yahooPlayers = players.filter(
    (player) => player.yahooAdpAll !== undefined || player.yahooAdpRecent !== undefined,
  );
  const staleYahooPlayers = yahooPlayers.filter((player) => {
    const timestamp = player.yahooAdpUpdatedAt;
    return !timestamp || Date.now() - Date.parse(timestamp) > 14 * 86_400_000;
  });
  items.push({
    id: "yahoo-market",
    label: "Yahoo opponent market",
    status:
      players.length === 0 || yahooPlayers.length / Math.max(1, players.length) < 0.7
        ? "warning"
        : staleYahooPlayers.length > yahooPlayers.length * 0.2
          ? "warning"
          : "modeled",
    detail: `${yahooPlayers.length}/${players.length} players have Yahoo ADP; ${staleYahooPlayers.length} are older than 14 days or undated.`,
  });

  return items;
}

export function auditSummary(items: LeagueAuditItem[]): {
  modeled: number;
  warnings: number;
  errors: number;
} {
  return items.reduce(
    (summary, item) => {
      if (item.status === "modeled") summary.modeled += 1;
      if (item.status === "warning") summary.warnings += 1;
      if (item.status === "error") summary.errors += 1;
      return summary;
    },
    { modeled: 0, warnings: 0, errors: 0 },
  );
}
