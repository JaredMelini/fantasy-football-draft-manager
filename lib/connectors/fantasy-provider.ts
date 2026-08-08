import type { DraftEvent, LeagueSettings, Player } from "../domain/types";

export interface NormalizedLeagueSnapshot {
  league: LeagueSettings;
  players: Player[];
  events: DraftEvent[];
  provider: "manual" | "yahoo";
  importedAt: string;
}

export interface FantasyProviderConnector {
  id: "yahoo";
  connectionMode: "oauth2";
  discoverLeagues(): Promise<Array<{ key: string; name: string }>>;
  importLeague(leagueKey: string): Promise<NormalizedLeagueSnapshot>;
  importDraftEvents(leagueKey: string): Promise<DraftEvent[]>;
}

export const yahooConnectorReadiness = {
  status: "awaiting-credentials" as const,
  authorization: "OAuth 2.0 authorization-code flow",
  access: "Read-only Fantasy Sports",
  plannedResources: ["league settings", "teams", "players", "rosters", "draft results"],
};
