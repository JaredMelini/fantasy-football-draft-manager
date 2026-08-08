import { findUncoveredScoringStats } from "./scoring";
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
            : `${league.rosterSlots.length} starting slots included in roster fit and replacement baselines.`,
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
