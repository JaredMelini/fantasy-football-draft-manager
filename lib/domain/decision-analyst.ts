import { projectionModeForPlayer } from "./scoring";
import type { LeagueSettings, PlayerRecommendation } from "./types";

export interface DecisionAnalystInput {
  recommendation: PlayerRecommendation;
  league: LeagueSettings;
  newsNotes?: string[];
}

export interface DecisionBrief {
  headline: string;
  evidence: string[];
  cautions: string[];
  numericAuthority: "engine-v4";
}

/**
 * Structured boundary for a future AI analyst. It may summarize or flag news,
 * but cannot mutate engine scores, probabilities, or player availability.
 */
export function buildDecisionBrief(input: DecisionAnalystInput): DecisionBrief {
  const recommendation = input.recommendation;
  const interval = recommendation.confidenceInterval;
  const cautions: string[] = [];
  if (projectionModeForPlayer(recommendation.player) === "rank-only") {
    cautions.push("This player is rank-only; no numerical projection was available.");
  }
  if (interval && interval.high - interval.low > 0.25) {
    cautions.push("Availability uncertainty is wide; treat the wait call as fragile.");
  }
  if (input.newsNotes?.length) {
    cautions.push(
      ...input.newsNotes.map((note) => `Unscored news flag: ${note}`),
    );
  }
  return {
    headline: `${recommendation.decision === "can-wait" ? "Wait is viable" : "Priority target"}: ${recommendation.player.name}`,
    evidence: [
      `${recommendation.breakdown.replacementValue} projected points above the waiver replacement line`,
      `${Math.round(recommendation.returnProbability * 100)}% modeled chance to survive to the next turn`,
      `${Math.round((recommendation.breakdown.championshipProbability ?? 0) * 100)}% paired championship outcome`,
      `${input.league.teamCount}-team ${input.league.scoringLabel} context`,
    ],
    cautions,
    numericAuthority: "engine-v4",
  };
}

