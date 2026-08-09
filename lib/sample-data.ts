import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  Player,
  ProjectedStats,
} from "./domain/types";

const pointsLeague: LeagueSettings["scoringRules"] = [
  { stat: "passingYards", label: "Passing yards", pointsPerUnit: 0.04 },
  { stat: "passingTouchdowns", label: "Passing touchdowns", pointsPerUnit: 4 },
  { stat: "interceptions", label: "Interceptions", pointsPerUnit: -2 },
  { stat: "rushingYards", label: "Rushing yards", pointsPerUnit: 0.1 },
  { stat: "rushingTouchdowns", label: "Rushing touchdowns", pointsPerUnit: 6 },
  { stat: "receptions", label: "Receptions", pointsPerUnit: 1 },
  { stat: "receivingYards", label: "Receiving yards", pointsPerUnit: 0.1 },
  { stat: "receivingTouchdowns", label: "Receiving touchdowns", pointsPerUnit: 6 },
  { stat: "fumblesLost", label: "Fumbles lost", pointsPerUnit: -2 },
];

export const demoLeague: LeagueSettings = {
  id: "demo-2026",
  name: "Sunday Night Strategists",
  teamCount: 10,
  draftType: "snake",
  scoringLabel: "Full PPR · 4 pt Pass TD",
  scoringRules: pointsLeague,
  rosterSlots: [
    { id: "QB", label: "QB", eligiblePositions: ["QB"] },
    { id: "RB1", label: "RB", eligiblePositions: ["RB"] },
    { id: "RB2", label: "RB", eligiblePositions: ["RB"] },
    { id: "WR1", label: "WR", eligiblePositions: ["WR"] },
    { id: "WR2", label: "WR", eligiblePositions: ["WR"] },
    { id: "TE", label: "TE", eligiblePositions: ["TE"] },
    { id: "FLEX", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
  ],
};

const yahooScoringRules: LeagueSettings["scoringRules"] = [
  { stat: "passingYards", label: "Passing yards", pointsPerUnit: 0.04 },
  { stat: "passingTouchdowns", label: "Passing touchdowns", pointsPerUnit: 6 },
  { stat: "interceptions", label: "Interceptions thrown", pointsPerUnit: -1 },
  { stat: "passing40YardCompletions", label: "40+ yard completions", pointsPerUnit: 2 },
  { stat: "passing40YardTouchdowns", label: "40+ yard passing touchdowns", pointsPerUnit: 2 },
  { stat: "rushingYards", label: "Rushing yards", pointsPerUnit: 0.1 },
  { stat: "rushingTouchdowns", label: "Rushing touchdowns", pointsPerUnit: 6 },
  { stat: "rushing40YardRuns", label: "40+ yard runs", pointsPerUnit: 2 },
  { stat: "rushing40YardTouchdowns", label: "40+ yard rushing touchdowns", pointsPerUnit: 2 },
  { stat: "receptions", label: "Receptions", pointsPerUnit: 1 },
  { stat: "receivingYards", label: "Receiving yards", pointsPerUnit: 0.1 },
  { stat: "receivingTouchdowns", label: "Receiving touchdowns", pointsPerUnit: 6 },
  { stat: "receiving40YardReceptions", label: "40+ yard receptions", pointsPerUnit: 2 },
  { stat: "receiving40YardTouchdowns", label: "40+ yard receiving touchdowns", pointsPerUnit: 2 },
  { stat: "returnTouchdowns", label: "Return touchdowns", pointsPerUnit: 6 },
  { stat: "returnYards", label: "Kick and punt return yards", pointsPerUnit: 0.04 },
  { stat: "twoPointConversions", label: "2-point conversions", pointsPerUnit: 2 },
  { stat: "fumblesLost", label: "Fumbles lost", pointsPerUnit: -2 },
  { stat: "offensiveFumbleReturnTouchdowns", label: "Offensive fumble return touchdowns", pointsPerUnit: 6 },
  { stat: "fieldGoals0To19", label: "Field goals: 0-19 yards", pointsPerUnit: 3 },
  { stat: "fieldGoals20To29", label: "Field goals: 20-29 yards", pointsPerUnit: 3 },
  { stat: "fieldGoals30To39", label: "Field goals: 30-39 yards", pointsPerUnit: 3 },
  { stat: "fieldGoals40To49", label: "Field goals: 40-49 yards", pointsPerUnit: 4 },
  { stat: "fieldGoals50Plus", label: "Field goals: 50+ yards", pointsPerUnit: 5 },
  { stat: "extraPointsMade", label: "Extra points made", pointsPerUnit: 1 },
  { stat: "defensePointsAllowed0", label: "DST points allowed: 0", pointsPerUnit: 10 },
  { stat: "defensePointsAllowed1To6", label: "DST points allowed: 1-6", pointsPerUnit: 7 },
  { stat: "defensePointsAllowed7To13", label: "DST points allowed: 7-13", pointsPerUnit: 4 },
  { stat: "defensePointsAllowed14To20", label: "DST points allowed: 14-20", pointsPerUnit: 1 },
  { stat: "defensePointsAllowed28To34", label: "DST points allowed: 28-34", pointsPerUnit: -1 },
  { stat: "defensePointsAllowed35Plus", label: "DST points allowed: 35+", pointsPerUnit: -4 },
  { stat: "defenseSacks", label: "DST sacks", pointsPerUnit: 1 },
  { stat: "defenseInterceptions", label: "DST interceptions", pointsPerUnit: 2 },
  { stat: "defenseFumbleRecoveries", label: "DST fumble recoveries", pointsPerUnit: 2 },
  { stat: "defenseTouchdowns", label: "DST touchdowns", pointsPerUnit: 6 },
  { stat: "defenseSafeties", label: "DST safeties", pointsPerUnit: 2 },
  { stat: "defenseBlockedKicks", label: "DST blocked kicks", pointsPerUnit: 2 },
  { stat: "defenseReturnTouchdowns", label: "DST kickoff/punt return touchdowns", pointsPerUnit: 6 },
  { stat: "defenseExtraPointReturns", label: "DST extra-point returns", pointsPerUnit: 2 },
];

export const yahooLeague: LeagueSettings = {
  id: "yahoo-595211",
  providerLeagueId: "595211",
  name: "Trip",
  teamCount: 8,
  draftType: "snake",
  draftPickSeconds: 90,
  draftDateTime: "2026-08-30T14:00",
  draftTimeZone: "America/New_York",
  draftOrderMode: "randomize-later",
  keeperLeague: false,
  draftPositionLimits: {},
  scoringLabel: "Yahoo Custom · Full PPR · 6 pt Pass TD",
  fractionalPoints: true,
  negativePoints: true,
  scoringRules: yahooScoringRules,
  rosterSlots: [
    { id: "QB-1", label: "QB", eligiblePositions: ["QB"] },
    { id: "WR-1", label: "WR", eligiblePositions: ["WR"] },
    { id: "WR-2", label: "WR", eligiblePositions: ["WR"] },
    { id: "RB-1", label: "RB", eligiblePositions: ["RB"] },
    { id: "RB-2", label: "RB", eligiblePositions: ["RB"] },
    { id: "TE-1", label: "TE", eligiblePositions: ["TE"] },
    { id: "FLEX-1", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
    { id: "K-1", label: "K", eligiblePositions: ["K"] },
    { id: "DST-1", label: "DST", eligiblePositions: ["DST"] },
  ],
  benchSlots: 6,
  irSlots: 1,
};

function player(
  id: string,
  name: string,
  nflTeam: string,
  position: Player["positions"][number],
  byeWeek: number,
  adp: number,
  userRank: number,
  tier: number,
  risk: number,
  projectedStats: ProjectedStats,
): Player {
  return {
    id,
    name,
    nflTeam,
    positions: [position],
    byeWeek,
    adp,
    userRank,
    tier,
    risk,
    projectedStats,
  };
}

const featuredPlayers: Player[] = [
  player("bijan", "Bijan Robinson", "ATL", "RB", 5, 1.3, 1, 1, 0.18, { rushingYards: 1320, rushingTouchdowns: 12, receptions: 64, receivingYards: 520, receivingTouchdowns: 4, fumblesLost: 2 }),
  player("gibbs", "Jahmyr Gibbs", "DET", "RB", 8, 2.4, 2, 1, 0.16, { rushingYards: 1210, rushingTouchdowns: 12, receptions: 68, receivingYards: 560, receivingTouchdowns: 5, fumblesLost: 1 }),
  player("chase", "Ja'Marr Chase", "CIN", "WR", 10, 3.1, 3, 1, 0.14, { receptions: 112, receivingYards: 1510, receivingTouchdowns: 12, rushingYards: 20, fumblesLost: 1 }),
  player("jefferson", "Justin Jefferson", "MIN", "WR", 6, 4.2, 4, 1, 0.16, { receptions: 105, receivingYards: 1490, receivingTouchdowns: 10, fumblesLost: 1 }),
  player("lamb", "CeeDee Lamb", "DAL", "WR", 10, 5.4, 5, 1, 0.17, { receptions: 108, receivingYards: 1430, receivingTouchdowns: 9, rushingYards: 45, rushingTouchdowns: 1, fumblesLost: 1 }),
  player("amonra", "Amon-Ra St. Brown", "DET", "WR", 8, 7.3, 6, 2, 0.12, { receptions: 111, receivingYards: 1320, receivingTouchdowns: 10, fumblesLost: 1 }),
  player("nabers", "Malik Nabers", "NYG", "WR", 9, 6.4, 7, 2, 0.2, { receptions: 104, receivingYards: 1370, receivingTouchdowns: 8, rushingYards: 35, fumblesLost: 1 }),
  player("saquon", "Saquon Barkley", "PHI", "RB", 9, 6.8, 8, 2, 0.24, { rushingYards: 1260, rushingTouchdowns: 11, receptions: 45, receivingYards: 360, receivingTouchdowns: 2, fumblesLost: 2 }),
  player("mccaffrey", "Christian McCaffrey", "SF", "RB", 14, 8.1, 9, 2, 0.42, { rushingYards: 1080, rushingTouchdowns: 10, receptions: 68, receivingYards: 570, receivingTouchdowns: 5, fumblesLost: 2 }),
  player("nacua", "Puka Nacua", "LAR", "WR", 8, 9.5, 10, 2, 0.21, { receptions: 103, receivingYards: 1380, receivingTouchdowns: 8, fumblesLost: 1 }),
  player("henry", "Derrick Henry", "BAL", "RB", 7, 11.2, 11, 2, 0.25, { rushingYards: 1310, rushingTouchdowns: 14, receptions: 22, receivingYards: 160, receivingTouchdowns: 1, fumblesLost: 2 }),
  player("bowers", "Brock Bowers", "LV", "TE", 8, 12.7, 12, 2, 0.13, { receptions: 101, receivingYards: 1190, receivingTouchdowns: 8, fumblesLost: 1 }),
  player("achane", "De'Von Achane", "MIA", "RB", 12, 13.4, 13, 3, 0.3, { rushingYards: 1040, rushingTouchdowns: 9, receptions: 68, receivingYards: 540, receivingTouchdowns: 4, fumblesLost: 2 }),
  player("nico", "Nico Collins", "HOU", "WR", 6, 14.8, 14, 3, 0.19, { receptions: 91, receivingYards: 1320, receivingTouchdowns: 9, fumblesLost: 1 }),
  player("ajbrown", "A.J. Brown", "PHI", "WR", 9, 15.6, 15, 3, 0.2, { receptions: 88, receivingYards: 1280, receivingTouchdowns: 9, fumblesLost: 1 }),
  player("joshallen", "Josh Allen", "BUF", "QB", 7, 19.2, 16, 3, 0.1, { passingYards: 4050, passingTouchdowns: 31, interceptions: 12, rushingYards: 540, rushingTouchdowns: 10, fumblesLost: 2 }),
  player("lamar", "Lamar Jackson", "BAL", "QB", 7, 22.1, 17, 3, 0.12, { passingYards: 3920, passingTouchdowns: 30, interceptions: 9, rushingYards: 790, rushingTouchdowns: 6, fumblesLost: 2 }),
  player("hurts", "Jalen Hurts", "PHI", "QB", 9, 27.4, 18, 4, 0.14, { passingYards: 3680, passingTouchdowns: 25, interceptions: 10, rushingYards: 610, rushingTouchdowns: 12, fumblesLost: 3 }),
  player("mcbride", "Trey McBride", "ARI", "TE", 8, 28.3, 19, 4, 0.12, { receptions: 94, receivingYards: 1040, receivingTouchdowns: 7, fumblesLost: 1 }),
  player("laporta", "Sam LaPorta", "DET", "TE", 8, 39.8, 20, 5, 0.16, { receptions: 80, receivingYards: 890, receivingTouchdowns: 8, fumblesLost: 1 }),
  player("cook", "James Cook", "BUF", "RB", 7, 24.2, 21, 4, 0.18, { rushingYards: 1050, rushingTouchdowns: 8, receptions: 46, receivingYards: 360, receivingTouchdowns: 3, fumblesLost: 2 }),
  player("wilson", "Garrett Wilson", "NYJ", "WR", 9, 25.8, 22, 4, 0.18, { receptions: 96, receivingYards: 1210, receivingTouchdowns: 7, fumblesLost: 1 }),
  player("harrison", "Marvin Harrison Jr.", "ARI", "WR", 8, 31.1, 23, 4, 0.2, { receptions: 87, receivingYards: 1180, receivingTouchdowns: 8, fumblesLost: 1 }),
  player("daniels", "Jayden Daniels", "WAS", "QB", 12, 33.4, 24, 4, 0.16, { passingYards: 3740, passingTouchdowns: 25, interceptions: 9, rushingYards: 720, rushingTouchdowns: 7, fumblesLost: 2 }),
];

function buildDepthPlayers(): Player[] {
  const teamCodes = ["BUF", "MIA", "NYJ", "BAL", "CIN", "CLE", "HOU", "IND", "JAX", "KC", "LV", "LAC", "DAL", "PHI", "CHI", "DET", "GB", "MIN", "ATL", "CAR", "LAR", "SEA", "ARI"];
  const positions: Array<{ position: Player["positions"][number]; count: number }> = [
    { position: "QB", count: 6 },
    { position: "RB", count: 18 },
    { position: "WR", count: 15 },
    { position: "TE", count: 7 },
  ];
  let overallIndex = 0;

  return positions.flatMap(({ position, count }) =>
    Array.from({ length: count }, (_, positionIndex) => {
      const rank = featuredPlayers.length + overallIndex + 1;
      const decline = overallIndex;
      const projectedStats: ProjectedStats =
        position === "QB"
          ? {
              passingYards: 3500 - decline * 14,
              passingTouchdowns: 23 - Math.floor(positionIndex / 3),
              interceptions: 11,
              rushingYards: 220 + positionIndex * 28,
              rushingTouchdowns: 2 + (positionIndex % 3),
              fumblesLost: 2,
            }
          : position === "RB"
            ? {
                rushingYards: 900 - positionIndex * 18,
                rushingTouchdowns: 7 - Math.floor(positionIndex / 7),
                receptions: 38 + (positionIndex % 5) * 4,
                receivingYards: 280 + (positionIndex % 4) * 25,
                receivingTouchdowns: 2,
                fumblesLost: 2,
              }
            : position === "WR"
              ? {
                  receptions: 76 - Math.floor(positionIndex / 3),
                  receivingYards: 980 - positionIndex * 20,
                  receivingTouchdowns: 7 - Math.floor(positionIndex / 6),
                  fumblesLost: 1,
                }
              : {
                  receptions: 62 - positionIndex * 2,
                  receivingYards: 720 - positionIndex * 24,
                  receivingTouchdowns: 6 - Math.floor(positionIndex / 4),
                  fumblesLost: 1,
                };
      const result = player(
        `demo-${position.toLowerCase()}-${positionIndex + 1}`,
        `Demo ${position} ${positionIndex + 1}`,
        teamCodes[overallIndex % teamCodes.length],
        position,
        5 + (overallIndex % 10),
        rank + (overallIndex % 4) * 0.2,
        rank,
        3 + Math.floor(overallIndex / 12),
        0.16 + (overallIndex % 5) * 0.03,
        projectedStats,
      );
      overallIndex += 1;
      return result;
    }),
  );
}

export const starterPlayers: Player[] = [];

const legacyStarterPlayerIds = new Set(
  featuredPlayers.map((player) => player.id),
);

export function isLegacyStarterPlayer(player: Player): boolean {
  return legacyStarterPlayerIds.has(player.id);
}

export function hasLegacyStarterProjection(player: Player): boolean {
  return (
    isLegacyStarterPlayer(player) &&
    Object.keys(player.projectedStats).length > 0
  );
}

export function isSyntheticDemoPlayer(player: Player): boolean {
  return player.id.startsWith("demo-");
}

export const demoPlayers: Player[] = [
  ...featuredPlayers,
  ...buildDepthPlayers(),
];

export function buildDemoTeams(
  teamCount: number,
  userDraftSlot?: number,
): DraftTeam[] {
  const userIndex =
    userDraftSlot === undefined
      ? Math.min(6, teamCount - 1)
      : Math.max(0, Math.min(teamCount - 1, userDraftSlot - 1));
  return Array.from({ length: teamCount }, (_, index) => ({
    id: index === userIndex ? "user" : `team-${index + 1}`,
    name: index === userIndex ? "My Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    isUser: index === userIndex,
  }));
}

export function buildInitialDemoPicks(teamCount: number): DraftPick[] {
  const teams = buildDemoTeams(teamCount);
  const playerIds = ["bijan", "gibbs", "chase", "jefferson", "lamb", "saquon"];
  const picksBeforeUser = Math.min(
    teams.find((team) => team.isUser)!.draftSlot - 1,
    playerIds.length,
  );
  return playerIds.slice(0, picksBeforeUser).map((playerId, index) => ({
    overall: index + 1,
    round: 1,
    teamId: teams[index].id,
    playerId,
  }));
}

export const demoTeams = buildDemoTeams(demoLeague.teamCount);
export const initialDemoPicks = buildInitialDemoPicks(demoLeague.teamCount);
