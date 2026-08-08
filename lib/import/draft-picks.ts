import {
  createPickEvent,
  replayDraftEvents,
} from "../domain/draft-session";
import { roundForOverallPick, teamForOverallPick } from "../domain/draft";
import type {
  DraftEvent,
  DraftTeam,
  LeagueSettings,
  Player,
} from "../domain/types";

export interface CapturedPickMatch {
  line: string;
  playerId: string;
  playerName: string;
}

export interface DraftPickCaptureResult {
  matches: CapturedPickMatch[];
  unmatched: string[];
  duplicates: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseDraftPickCapture(
  text: string,
  players: Player[],
  draftedPlayerIds: Set<string> = new Set(),
): DraftPickCaptureResult {
  const result: DraftPickCaptureResult = {
    matches: [],
    unmatched: [],
    duplicates: [],
  };
  const seen = new Set(draftedPlayerIds);
  const searchablePlayers = players
    .map((player) => ({ player, normalizedName: normalize(player.name) }))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const normalizedLine = normalize(line);
      const candidates = searchablePlayers.filter(({ normalizedName }) =>
        normalizedLine.includes(normalizedName),
      );
      const longestLength = candidates[0]?.normalizedName.length ?? 0;
      const longest = candidates.filter(
        ({ normalizedName }) => normalizedName.length === longestLength,
      );
      if (longest.length !== 1) {
        result.unmatched.push(line);
        return;
      }
      const player = longest[0].player;
      if (seen.has(player.id)) {
        result.duplicates.push(player.name);
        return;
      }
      seen.add(player.id);
      result.matches.push({ line, playerId: player.id, playerName: player.name });
    });
  return result;
}

export function appendCapturedPicks(input: {
  events: DraftEvent[];
  matches: CapturedPickMatch[];
  teams: DraftTeam[];
  league: LeagueSettings;
  maximumPicks?: number;
}): DraftEvent[] {
  let events = [...input.events];
  for (const match of input.matches) {
    const picks = replayDraftEvents(events).picks;
    if (input.maximumPicks !== undefined && picks.length >= input.maximumPicks) break;
    const overall = picks.length + 1;
    const team = teamForOverallPick(overall, input.teams, input.league.draftType);
    events = [
      ...events,
      createPickEvent({
        events,
        source: "manual",
        pick: {
          overall,
          round: roundForOverallPick(overall, input.teams.length),
          teamId: team.id,
          playerId: match.playerId,
        },
      }),
    ];
  }
  return events;
}
