export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export type ProjectionStat =
  | "passingYards"
  | "passingTouchdowns"
  | "interceptions"
  | "passing40YardCompletions"
  | "passing40YardTouchdowns"
  | "rushingYards"
  | "rushingTouchdowns"
  | "rushing40YardRuns"
  | "rushing40YardTouchdowns"
  | "receptions"
  | "receivingYards"
  | "receivingTouchdowns"
  | "receiving40YardReceptions"
  | "receiving40YardTouchdowns"
  | "returnTouchdowns"
  | "returnYards"
  | "twoPointConversions"
  | "fumblesLost"
  | "offensiveFumbleReturnTouchdowns"
  | "fieldGoalsMade"
  | "fieldGoals0To19"
  | "fieldGoals20To29"
  | "fieldGoals30To39"
  | "fieldGoals40To49"
  | "fieldGoals50Plus"
  | "extraPointsMade"
  | "defensePointsAllowed0"
  | "defensePointsAllowed1To6"
  | "defensePointsAllowed7To13"
  | "defensePointsAllowed14To20"
  | "defensePointsAllowed28To34"
  | "defensePointsAllowed35Plus"
  | "defenseSacks"
  | "defenseInterceptions"
  | "defenseFumbleRecoveries"
  | "defenseTouchdowns"
  | "defenseSafeties"
  | "defenseBlockedKicks"
  | "defenseReturnTouchdowns"
  | "defenseExtraPointReturns"
  | "defensePoints";

export type ProjectedStats = Partial<Record<ProjectionStat, number>>;

export interface ScoringRule {
  stat: ProjectionStat;
  label: string;
  pointsPerUnit: number;
}

export interface RosterSlot {
  id: string;
  label: string;
  eligiblePositions: PlayerPosition[];
}

export interface LeagueSettings {
  id: string;
  name: string;
  teamCount: number;
  draftType: "snake" | "linear" | "salary-cap";
  scoringLabel: string;
  scoringRules: ScoringRule[];
  rosterSlots: RosterSlot[];
  benchSlots?: number;
  irSlots?: number;
  fractionalPoints?: boolean;
  negativePoints?: boolean;
  providerLeagueId?: string;
  draftPickSeconds?: number;
  draftDateTime?: string;
  draftTimeZone?: string;
  draftOrderMode?: "randomize-later" | "randomized" | "custom";
  userDraftSlot?: number;
  keeperLeague?: boolean;
  draftPositionLimits?: Partial<Record<PlayerPosition, number>>;
}

export interface Player {
  id: string;
  name: string;
  nflTeam: string;
  positions: PlayerPosition[];
  byeWeek: number;
  adp: number;
  userRank: number;
  tier: number;
  risk: number;
  positionRanks?: Partial<Record<PlayerPosition, number>>;
  positionTiers?: Partial<Record<PlayerPosition, number>>;
  upside?: number;
  rankingSource?: string;
  sourceAdp?: string;
  sourceProjectedPoints?: number;
  excluded?: boolean;
  notes?: string;
  externalIds?: Record<string, string>;
  projectedStats: ProjectedStats;
}

export interface DraftTeam {
  id: string;
  name: string;
  draftSlot: number;
  isUser?: boolean;
}

export interface DraftPick {
  overall: number;
  round: number;
  teamId: string;
  playerId: string;
}

export type DraftEventSource = "manual" | "simulated" | "provider";

export interface DraftPickEvent {
  id: string;
  sequence: number;
  type: "pick_made";
  source: DraftEventSource;
  pick: DraftPick;
  recommendedPlayerId?: string;
}

export interface DraftUndoEvent {
  id: string;
  sequence: number;
  type: "pick_undone";
  source: DraftEventSource;
  targetEventId: string;
}

export type DraftEvent = DraftPickEvent | DraftUndoEvent;

export type OpponentStrategy = "balanced" | "best-available" | "needs-first";

export type RiskTolerance = "safe" | "balanced" | "upside";

export type RecommendationDecision = "draft-now" | "lean-now" | "can-wait";

export interface RecommendationBreakdown {
  projectedPoints: number;
  replacementValue: number;
  personalRankValue: number;
  rosterFit: number;
  tierScarcity: number;
  availabilityUrgency: number;
  opponentDemand: number;
  opportunityCost: number;
  upsideValue: number;
  riskPenalty: number;
  total: number;
}

export interface RecommendationWaitAnalysis {
  simulations: number;
  expectedAlternativeName: string | null;
  expectedAlternativeScore: number;
  opportunityLoss: number;
  recentPositionRun: number;
  opponentNeedScore: number;
}

export interface PlayerRecommendation {
  player: Player;
  breakdown: RecommendationBreakdown;
  returnProbability: number;
  decision: RecommendationDecision;
  confidence: number;
  waitAnalysis: RecommendationWaitAnalysis;
  explanation: string[];
}
