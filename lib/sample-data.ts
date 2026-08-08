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

export const demoPlayers: Player[] = [
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

export const demoTeams: DraftTeam[] = Array.from({ length: 10 }, (_, index) => ({
  id: index === 6 ? "user" : `team-${index + 1}`,
  name: index === 6 ? "My Team" : `Team ${index + 1}`,
  draftSlot: index + 1,
  isUser: index === 6,
}));

export const initialDemoPicks: DraftPick[] = [
  { overall: 1, round: 1, teamId: "team-1", playerId: "bijan" },
  { overall: 2, round: 1, teamId: "team-2", playerId: "gibbs" },
  { overall: 3, round: 1, teamId: "team-3", playerId: "chase" },
  { overall: 4, round: 1, teamId: "team-4", playerId: "jefferson" },
  { overall: 5, round: 1, teamId: "team-5", playerId: "lamb" },
  { overall: 6, round: 1, teamId: "team-6", playerId: "saquon" },
];
