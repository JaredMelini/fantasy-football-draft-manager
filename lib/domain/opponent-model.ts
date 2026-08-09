import { assignedStarterCount, draftRosterSize, playerIdsForTeam } from "./draft";
import { getMarketSignal, getPositionTier, primaryPosition } from "./rankings";
import type {
  DraftPick,
  DraftTeam,
  LeagueSettings,
  OpponentArchetype,
  OpponentProfile,
  Player,
  PlayerPosition,
} from "./types";

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function uniform(seed: string): number {
  let value = hash(seed) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return Math.max(1e-9, ((value ^ (value >>> 14)) >>> 0) / 4294967296);
}

function gumbel(seed: string): number {
  return -Math.log(-Math.log(uniform(seed)));
}

const archetypes: OpponentArchetype[] = [
  "adp-anchor",
  "yahoo-rank",
  "autopick",
  "rb-aggressive",
  "wr-heavy",
  "early-onesie",
  "tier-value",
  "high-variance",
];

function archetypeProfile(
  teamId: string,
  archetype: OpponentArchetype,
): OpponentProfile {
  const base: OpponentProfile = {
    teamId,
    archetype,
    adpWeight: 1,
    yahooRankWeight: 0.25,
    needWeight: 0.6,
    variance: 0.65,
    positionBias: {},
    observedPicks: 0,
    posteriorConfidence: 0,
  };
  if (archetype === "yahoo-rank") return { ...base, adpWeight: 0.85, yahooRankWeight: 0.8 };
  if (archetype === "autopick") return { ...base, adpWeight: 1.25, yahooRankWeight: 1, needWeight: 0.12, variance: 0.18 };
  if (archetype === "rb-aggressive") return { ...base, positionBias: { RB: 1.15 }, needWeight: 0.72 };
  if (archetype === "wr-heavy") return { ...base, positionBias: { WR: 1.05 }, needWeight: 0.68 };
  if (archetype === "early-onesie") return { ...base, positionBias: { QB: 0.7, TE: 0.7 }, needWeight: 0.8 };
  if (archetype === "tier-value") return { ...base, adpWeight: 0.8, needWeight: 0.55, variance: 0.45 };
  if (archetype === "high-variance") return { ...base, adpWeight: 0.72, needWeight: 0.5, variance: 1.3 };
  return base;
}

/** Creates one persistent drafting identity per manager for a simulated world. */
export function buildOpponentProfiles(
  teams: DraftTeam[],
  seed: string,
  overrides: OpponentProfile[] = [],
): OpponentProfile[] {
  const overrideByTeam = new Map(overrides.map((profile) => [profile.teamId, profile]));
  return teams
    .filter((team) => !team.isUser)
    .map((team) => {
      const override = overrideByTeam.get(team.id);
      if (override) return { ...override, positionBias: { ...override.positionBias } };
      const index = Math.floor(uniform(`${seed}:archetype:${team.id}`) * archetypes.length);
      return archetypeProfile(team.id, archetypes[Math.min(index, archetypes.length - 1)]);
    });
}

function observedPositionBias(
  teamId: string,
  picks: DraftPick[],
  players: Player[],
): Partial<Record<PlayerPosition, number>> {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const teamPicks = picks.filter((pick) => pick.teamId === teamId);
  const counts: Partial<Record<PlayerPosition, number>> = {};
  for (const pick of teamPicks) {
    const position = playerById.get(pick.playerId)?.positions[0];
    if (position) counts[position] = (counts[position] ?? 0) + 1;
  }
  const expected = teamPicks.length / 4;
  return Object.fromEntries(
    (["QB", "RB", "WR", "TE"] as PlayerPosition[]).map((position) => [
      position,
      Math.max(-0.55, Math.min(0.75, ((counts[position] ?? 0) - expected) * 0.22)),
    ]),
  );
}

/** Learns conservatively from observed picks; early picks do not erase priors. */
export function updateOpponentProfiles(
  profiles: OpponentProfile[],
  picks: DraftPick[],
  players: Player[],
): OpponentProfile[] {
  return profiles.map((profile) => {
    const observedPicks = picks.filter((pick) => pick.teamId === profile.teamId).length;
    if (observedPicks === 0) return profile;
    const confidence = Math.min(0.8, observedPicks / 10);
    const observed = observedPositionBias(profile.teamId, picks, players);
    return {
      ...profile,
      observedPicks,
      posteriorConfidence: confidence,
      positionBias: Object.fromEntries(
        (["QB", "RB", "WR", "TE", "K", "DST"] as PlayerPosition[]).map((position) => [
          position,
          (profile.positionBias[position] ?? 0) * (1 - confidence) +
            (observed[position] ?? 0) * confidence,
        ]),
      ),
    };
  });
}

function positionCount(roster: Player[], position: PlayerPosition): number {
  return roster.filter((player) => player.positions.includes(position)).length;
}

export function chooseModeledOpponentPlayer(input: {
  available: Player[];
  roster: Player[];
  league: LeagueSettings;
  overall: number;
  seed: string;
  profile: OpponentProfile;
}): Player | undefined {
  const { available, roster, league, overall, seed, profile } = input;
  const filledBefore = assignedStarterCount(roster, league.rosterSlots);
  const rosterSize = draftRosterSize(league);
  const rosterPick = roster.length + 1;

  return available
    .map((player) => {
      const position = primaryPosition(player);
      const market = getMarketSignal(player, league.teamCount);
      const overdue = overall - market.adp;
      const fillsNeed =
        assignedStarterCount([...roster, player], league.rosterSlots) > filledBefore ? 1 : 0;
      const rank = market.overallRank ?? market.adp;
      const draftedSupport = market.percentDrafted === undefined
        ? 0
        : Math.max(-0.6, Math.min(0.6, (market.percentDrafted - 60) / 70));
      const rosteredAtPosition = positionCount(roster, position);
      const dedicated = league.rosterSlots.filter(
        (slot) => slot.eligiblePositions.length === 1 && slot.eligiblePositions[0] === position,
      ).length;
      const overload = Math.max(0, rosteredAtPosition - dedicated + 1);
      const specialistEarly =
        (position === "K" || position === "DST") && rosterPick < rosterSize - 1 ? 4 : 0;
      const onesieDuplicate =
        (position === "QB" || position === "TE") && rosteredAtPosition >= 1 ? 1.4 : 0;
      const tierValue = profile.archetype === "tier-value"
        ? Math.max(0, 5 - getPositionTier(player, position)) * 0.22
        : 0;
      const coherentBoardNoise =
        gumbel(`${seed}:board:${profile.teamId}:${player.id}`) * profile.variance;
      const pickNoise =
        gumbel(`${seed}:pick:${profile.teamId}:${overall}:${player.id}`) * profile.variance * 0.28;

      // Crucially, overdue players become more attractive; they never lose value
      // merely because the room allowed them to slide past ADP.
      const score =
        -market.adp * 0.085 * profile.adpWeight -
        rank * 0.025 * profile.yahooRankWeight +
        Math.max(-8, Math.min(18, overdue)) * 0.24 * profile.adpWeight +
        draftedSupport +
        fillsNeed * profile.needWeight * 2.4 +
        (profile.positionBias[position] ?? 0) -
        overload * 0.72 -
        specialistEarly -
        onesieDuplicate +
        tierValue +
        coherentBoardNoise +
        pickNoise;
      return { player, score };
    })
    .sort((a, b) => b.score - a.score || a.player.userRank - b.player.userRank)[0]?.player;
}

export function rostersByTeam(
  teams: DraftTeam[],
  picks: DraftPick[],
  players: Player[],
): Map<string, Player[]> {
  const playerById = new Map(players.map((player) => [player.id, player]));
  return new Map(
    teams.map((team) => [
      team.id,
      playerIdsForTeam(picks, team.id)
        .map((id) => playerById.get(id))
        .filter((player): player is Player => Boolean(player)),
    ]),
  );
}
