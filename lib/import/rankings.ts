import type { Player, PlayerPosition } from "../domain/types";

export type RankingField = "player" | "rank" | "team" | "position" | "tier" | "adp" | "notes" | "externalId";

export type RankingColumnMap = Partial<Record<RankingField, number>>;

export interface RankingTable {
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

export interface RankingImportUpdate {
  playerId: string;
  sourceName: string;
  matchedName: string;
  rank: number;
  tier?: number;
  adp?: number;
  notes?: string;
}

export interface RankingImportResult {
  updates: RankingImportUpdate[];
  unmatched: string[];
  duplicates: string[];
  errors: string[];
}

const aliases: Record<RankingField, string[]> = {
  player: ["player", "player name", "name", "full name"],
  rank: ["rank", "overall rank", "overall", "rk", "my rank"],
  team: ["team", "nfl team", "tm"],
  position: ["position", "pos"],
  tier: ["tier", "group"],
  adp: ["adp", "average draft position", "avg pick"],
  notes: ["notes", "note", "comments"],
  externalId: ["yahoo id", "player id", "external id"],
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  return candidates.sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length,
  )[0];
}

export function parseDelimitedRankings(text: string): RankingTable {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const normalizedText = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    const next = normalizedText[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}

export function tableFromRows(
  rows: Array<Array<unknown>>,
): RankingTable {
  const [rawHeaders = [], ...dataRows] = rows;
  return {
    headers: rawHeaders.map((value) => String(value ?? "")),
    rows: dataRows.map((row) =>
      row.map((value) => {
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "string" || typeof value === "number") return value;
        if (typeof value === "boolean") return String(value);
        return value === null || value === undefined ? null : String(value);
      }),
    ),
  };
}

export function guessRankingColumnMap(headers: string[]): RankingColumnMap {
  const normalizedHeaders = headers.map(normalize);
  const map: RankingColumnMap = {};

  (Object.keys(aliases) as RankingField[]).forEach((field) => {
    const index = normalizedHeaders.findIndex((header) =>
      aliases[field].includes(header),
    );
    if (index >= 0) map[field] = index;
  });

  return map;
}

function cell(
  row: RankingTable["rows"][number],
  map: RankingColumnMap,
  field: RankingField,
): string | number | null | undefined {
  const index = map[field];
  return index === undefined ? undefined : row[index];
}

function matchPlayer(
  row: RankingTable["rows"][number],
  map: RankingColumnMap,
  players: Player[],
): Player | undefined {
  const externalId = normalize(cell(row, map, "externalId"));
  if (externalId) {
    const externalMatch = players.find((player) =>
      Object.values(player.externalIds ?? {}).some(
        (value) => normalize(value) === externalId,
      ),
    );
    if (externalMatch) return externalMatch;
  }

  const name = normalize(cell(row, map, "player"));
  if (!name) return undefined;
  let candidates = players.filter((player) => normalize(player.name) === name);
  const team = normalize(cell(row, map, "team"));
  const position = normalize(cell(row, map, "position")).toUpperCase() as PlayerPosition;

  if (team) {
    candidates = candidates.filter(
      (player) => normalize(player.nflTeam) === team,
    );
  }
  if (position) {
    candidates = candidates.filter((player) =>
      player.positions.includes(position),
    );
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function buildRankingImport(
  table: RankingTable,
  players: Player[],
  map: RankingColumnMap,
): RankingImportResult {
  const result: RankingImportResult = {
    updates: [],
    unmatched: [],
    duplicates: [],
    errors: [],
  };
  if (map.player === undefined && map.externalId === undefined) {
    result.errors.push("Map either a player-name or external-ID column.");
  }
  if (map.rank === undefined) {
    result.errors.push("Map a rank column.");
  }
  if (result.errors.length > 0) return result;

  const seenPlayerIds = new Set<string>();
  table.rows.forEach((row, rowIndex) => {
    const sourceName = String(cell(row, map, "player") ?? `Row ${rowIndex + 2}`).trim();
    const rank = numeric(cell(row, map, "rank"));
    if (!rank || rank < 1) {
      result.errors.push(`Row ${rowIndex + 2}: rank must be a positive number.`);
      return;
    }
    const matched = matchPlayer(row, map, players);
    if (!matched) {
      result.unmatched.push(sourceName);
      return;
    }
    if (seenPlayerIds.has(matched.id)) {
      result.duplicates.push(sourceName);
      return;
    }
    seenPlayerIds.add(matched.id);
    result.updates.push({
      playerId: matched.id,
      sourceName,
      matchedName: matched.name,
      rank,
      tier: numeric(cell(row, map, "tier")),
      adp: numeric(cell(row, map, "adp")),
      notes: String(cell(row, map, "notes") ?? "").trim() || undefined,
    });
  });

  return result;
}

export function applyRankingImport(
  players: Player[],
  updates: RankingImportUpdate[],
): Player[] {
  const byPlayerId = new Map(updates.map((update) => [update.playerId, update]));
  return players.map((player) => {
    const update = byPlayerId.get(player.id);
    if (!update) return player;
    return {
      ...player,
      userRank: update.rank,
      tier: update.tier ?? player.tier,
      adp: update.adp ?? player.adp,
      notes: update.notes ?? player.notes,
    };
  });
}
