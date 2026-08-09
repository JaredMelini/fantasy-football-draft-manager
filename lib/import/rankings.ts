import type { Player, PlayerPosition } from "../domain/types";

export type RankingField = "player" | "rank" | "team" | "position" | "tier" | "adp" | "points" | "risk" | "upside" | "consistency" | "notes" | "externalId";

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
  position?: PlayerPosition;
  tier?: number;
  adp?: number;
  sourceAdp?: string;
  sourceProjectedPoints?: number;
  risk?: number;
  upside?: number;
  consistency?: number;
  source?: string;
  notes?: string;
}

export interface RankingReviewSuggestion {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  score: number;
}

export interface RankingReviewRow {
  id: string;
  status: "unmatched" | "duplicate";
  rowNumber: number;
  sourceName: string;
  sourceTeam?: string;
  sourcePosition?: string;
  rank: number;
  tier?: number;
  adp?: number;
  sourceProjectedPoints?: number;
  risk?: number;
  upside?: number;
  consistency?: number;
  notes?: string;
  suggestions: RankingReviewSuggestion[];
}

export interface RankingImportResult {
  updates: RankingImportUpdate[];
  newPlayers: Player[];
  unmatched: string[];
  duplicates: string[];
  reviewRows: RankingReviewRow[];
  errors: string[];
}

const aliases: Record<RankingField, string[]> = {
  player: ["player", "player name", "name", "full name"],
  rank: ["rank", "overall rank", "overall", "rk", "my rank"],
  team: ["team", "nfl team", "tm"],
  position: ["position", "pos"],
  tier: ["tier", "group"],
  adp: ["adp", "average draft position", "avg pick"],
  points: ["points", "projected points", "fantasy points", "fpts", "pts"],
  risk: ["risk", "risk rating"],
  upside: ["upside", "upside rating"],
  consistency: ["consistency", "consistency rating"],
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

function editDistance(first: string, second: string): number {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitution =
        previous[secondIndex - 1] +
        (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1);
      current[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        current[secondIndex - 1] + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length];
}

function suggestPlayers(
  row: RankingTable["rows"][number],
  map: RankingColumnMap,
  players: Player[],
): RankingReviewSuggestion[] {
  const sourceName = normalize(cell(row, map, "player"));
  const sourceTeam = normalize(cell(row, map, "team"));
  const sourcePosition = normalize(cell(row, map, "position")).toUpperCase();

  return players
    .map((player) => {
      const playerName = normalize(player.name);
      const longestName = Math.max(sourceName.length, playerName.length, 1);
      const nameScore = sourceName
        ? 1 - editDistance(sourceName, playerName) / longestName
        : 0;
      const teamBonus =
        sourceTeam && normalize(player.nflTeam) === sourceTeam ? 0.14 : 0;
      const positionBonus =
        sourcePosition &&
        player.positions.some((position) => position === sourcePosition)
          ? 0.14
          : 0;
      return {
        playerId: player.id,
        playerName: player.name,
        team: player.nflTeam,
        position: player.positions.join("/"),
        score: Math.round(Math.min(1, nameScore + teamBonus + positionBonus) * 100),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        players.find((player) => player.id === a.playerId)!.userRank -
          players.find((player) => player.id === b.playerId)!.userRank,
    )
    .slice(0, 3);
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
  const rawPosition = normalize(cell(row, map, "position")).toUpperCase();
  const position = (rawPosition === "D" || rawPosition === "D ST" ? "DST" : rawPosition) as PlayerPosition;

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
  options: { mode?: "overall" | "position"; source?: string } = {},
): RankingImportResult {
  const result: RankingImportResult = {
    updates: [],
    newPlayers: [],
    unmatched: [],
    duplicates: [],
    reviewRows: [],
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
    const sourceProjectedPoints = numeric(cell(row, map, "points"));
    if (!rank || rank < 1) {
      result.errors.push(`Row ${rowIndex + 2}: rank must be a positive number.`);
      return;
    }
    const sourcePosition = String(cell(row, map, "position") ?? "")
      .trim()
      .toUpperCase()
      .replace("D/ST", "DST")
      .replace(/^D$/, "DST") as PlayerPosition;
    if (
      options.mode === "position" &&
      !(["QB", "RB", "WR", "TE", "K", "DST"] as string[]).includes(sourcePosition)
    ) {
      result.errors.push(`Row ${rowIndex + 2}: a supported position is required.`);
      return;
    }
    if (
      options.source === "Fantasy Footballers UDK" &&
      sourcePosition !== "K" &&
      sourcePosition !== "DST" &&
      sourceProjectedPoints === undefined
    ) {
      result.errors.push(
        `Row ${rowIndex + 2}: projected points must be a number for ${sourcePosition}.`,
      );
      return;
    }
    const matched = matchPlayer(row, map, players);
    if (!matched) {
      result.unmatched.push(sourceName);
      result.reviewRows.push({
        id: `unmatched-${rowIndex + 2}`,
        status: "unmatched",
        rowNumber: rowIndex + 2,
        sourceName,
        sourceTeam: String(cell(row, map, "team") ?? "").trim() || undefined,
        sourcePosition: sourcePosition || undefined,
        rank,
        tier: numeric(cell(row, map, "tier")),
        adp: numeric(cell(row, map, "adp")),
        sourceProjectedPoints,
        risk: numeric(cell(row, map, "risk")),
        upside: numeric(cell(row, map, "upside")),
        consistency: numeric(cell(row, map, "consistency")),
        notes: String(cell(row, map, "notes") ?? "").trim() || undefined,
        suggestions: suggestPlayers(row, map, players),
      });
      return;
    }
    const duplicateKey = options.mode === "position" ? `${matched.id}:${sourcePosition}` : matched.id;
    if (seenPlayerIds.has(duplicateKey)) {
      result.duplicates.push(sourceName);
      const suggestions = suggestPlayers(row, map, players);
      const matchedSuggestion = suggestions.find(
        (suggestion) => suggestion.playerId === matched.id,
      ) ?? {
        playerId: matched.id,
        playerName: matched.name,
        team: matched.nflTeam,
        position: matched.positions.join("/"),
        score: 100,
      };
      result.reviewRows.push({
        id: `duplicate-${rowIndex + 2}`,
        status: "duplicate",
        rowNumber: rowIndex + 2,
        sourceName,
        sourceTeam: String(cell(row, map, "team") ?? "").trim() || undefined,
        sourcePosition: sourcePosition || undefined,
        rank,
        tier: numeric(cell(row, map, "tier")),
        adp: numeric(cell(row, map, "adp")),
        sourceProjectedPoints,
        risk: numeric(cell(row, map, "risk")),
        upside: numeric(cell(row, map, "upside")),
        consistency: numeric(cell(row, map, "consistency")),
        notes: String(cell(row, map, "notes") ?? "").trim() || undefined,
        suggestions: [
          matchedSuggestion,
          ...suggestions.filter(
            (suggestion) => suggestion.playerId !== matched.id,
          ),
        ].slice(0, 3),
      });
      return;
    }
    seenPlayerIds.add(duplicateKey);
    result.updates.push({
      playerId: matched.id,
      sourceName,
      matchedName: matched.name,
      rank,
      position: options.mode === "position" ? sourcePosition : undefined,
      tier: numeric(cell(row, map, "tier")),
      adp: options.mode === "position" ? undefined : numeric(cell(row, map, "adp")),
      sourceAdp:
        options.mode === "position"
          ? String(cell(row, map, "adp") ?? "").trim() || undefined
          : undefined,
      sourceProjectedPoints,
      risk: numeric(cell(row, map, "risk")),
      upside: numeric(cell(row, map, "upside")),
      consistency: numeric(cell(row, map, "consistency")),
      source: options.source,
      notes: String(cell(row, map, "notes") ?? "").trim() || undefined,
    });
  });

  return result;
}

export function rankingUpdateFromReview(
  row: RankingReviewRow,
  player: Player,
  options: { mode?: "overall" | "position"; source?: string } = {},
): RankingImportUpdate {
  const rawPosition = row.sourcePosition?.toUpperCase();
  const position = (rawPosition === "D" || rawPosition === "D/ST" ? "DST" : rawPosition) as PlayerPosition | undefined;
  return {
    playerId: player.id,
    sourceName: row.sourceName,
    matchedName: player.name,
    rank: row.rank,
    position: options.mode === "position" ? position : undefined,
    tier: row.tier,
    adp: row.adp,
    sourceAdp:
      options.mode === "position" && row.adp !== undefined
        ? String(row.adp)
        : undefined,
    sourceProjectedPoints: row.sourceProjectedPoints,
    risk: row.risk,
    upside: row.upside,
    consistency: row.consistency,
    source: options.source,
    notes: row.notes,
  };
}

export function applyRankingImport(
  players: Player[],
  updates: RankingImportUpdate[],
  newPlayers: Player[] = [],
): Player[] {
  const byPlayerId = new Map(updates.map((update) => [update.playerId, update]));
  const updatedPlayers = players.map((player) => {
    const update = byPlayerId.get(player.id);
    if (!update) return player;
    if (update.position) {
      return {
        ...player,
        positionRanks: {
          ...player.positionRanks,
          [update.position]: update.rank,
        },
        positionTiers: update.tier === undefined
          ? player.positionTiers
          : {
              ...player.positionTiers,
              [update.position]: update.tier,
            },
        risk: update.risk === undefined ? player.risk : Number(Math.min(1, Math.max(0, update.risk / 10)).toFixed(2)),
        upside: update.upside === undefined ? player.upside : Number(Math.min(1, Math.max(0, update.upside / 10)).toFixed(2)),
        consistency: update.consistency === undefined ? player.consistency : Number(Math.min(1, Math.max(0, update.consistency / 10)).toFixed(2)),
        rankingSource: update.source ?? player.rankingSource,
        sourceAdp: update.sourceAdp ?? player.sourceAdp,
        sourceProjectedPoints:
          update.sourceProjectedPoints ?? player.sourceProjectedPoints,
        projectionProvenance: update.sourceProjectedPoints === undefined
          ? player.projectionProvenance
          : {
              source: update.source ?? "Imported rankings",
              importedAt: new Date().toISOString(),
              mode: Object.keys(player.projectedStats).length > 0
                ? "raw-league-scored"
                : "source-total",
            },
        notes: update.notes ?? player.notes,
      };
    }
    return {
      ...player,
      userRank: update.rank,
      tier: update.tier ?? player.tier,
      adp: update.adp ?? player.adp,
      risk:
        update.risk === undefined
          ? player.risk
          : Number(Math.min(1, Math.max(0, update.risk / 10)).toFixed(2)),
      upside:
        update.upside === undefined
          ? player.upside
          : Number(Math.min(1, Math.max(0, update.upside / 10)).toFixed(2)),
      consistency:
        update.consistency === undefined
          ? player.consistency
          : Number(Math.min(1, Math.max(0, update.consistency / 10)).toFixed(2)),
      sourceProjectedPoints:
        update.sourceProjectedPoints ?? player.sourceProjectedPoints,
      projectionProvenance: update.sourceProjectedPoints === undefined
        ? player.projectionProvenance
        : {
            source: update.source ?? "Imported rankings",
            importedAt: new Date().toISOString(),
            mode: Object.keys(player.projectedStats).length > 0
              ? "raw-league-scored"
              : "source-total",
          },
      notes: update.notes ?? player.notes,
    };
  });
  const existingIds = new Set(updatedPlayers.map((player) => player.id));
  return [
    ...updatedPlayers,
    ...newPlayers.filter((player) => !existingIds.has(player.id)),
  ];
}

export function buildUdkRankingImport(
  tables: RankingTable[],
  players: Player[],
): RankingImportResult {
  const combined: RankingImportResult = {
    updates: [],
    newPlayers: [],
    unmatched: [],
    duplicates: [],
    reviewRows: [],
    errors: [],
  };
  tables.forEach((table, tableIndex) => {
    const result = buildRankingImport(
      table,
      players,
      guessRankingColumnMap(table.headers),
      { mode: "position", source: "Fantasy Footballers UDK" },
    );
    combined.updates.push(...result.updates);
    const map = guessRankingColumnMap(table.headers);
    const unmatchedRows = new Map(
      result.reviewRows
        .filter((row) => row.status === "unmatched")
        .map((row) => [row.rowNumber, row]),
    );
    table.rows.forEach((row, rowIndex) => {
      const review = unmatchedRows.get(rowIndex + 2);
      if (!review) return;
      const rawPosition = String(cell(row, map, "position") ?? "").toUpperCase();
      const position = (rawPosition === "D" || rawPosition === "D/ST" ? "DST" : rawPosition) as PlayerPosition;
      const name = String(cell(row, map, "player") ?? "").trim();
      const team = String(cell(row, map, "team") ?? "FA").trim() || "FA";
      if (!name || !(["QB", "RB", "WR", "TE", "K", "DST"] as string[]).includes(position)) return;
      const rank = numeric(cell(row, map, "rank")) ?? review.rank;
      const tier = numeric(cell(row, map, "tier")) ?? 1;
      const risk = numeric(cell(row, map, "risk"));
      const upside = numeric(cell(row, map, "upside"));
      const consistency = numeric(cell(row, map, "consistency"));
      const byeIndex = table.headers.findIndex((header) => normalize(header) === "bye week");
      const sourceAdp = String(cell(row, map, "adp") ?? "").trim() || undefined;
      const fallbackAdp = sourceAdp?.match(/^(\d+)\.(\d{1,2})$/);
      const slug = normalize(`${name}-${team}-${position}`).replace(/ /g, "-");
      combined.newPlayers.push({
        id: `udk-${slug}`,
        name,
        nflTeam: team,
        positions: [position],
        byeWeek: numeric(row[byeIndex]) ?? 0,
        adp: fallbackAdp
          ? (Number(fallbackAdp[1]) - 1) * 12 + Number(fallbackAdp[2])
          : 180 + rank,
        userRank: players.length + combined.newPlayers.length + 1,
        tier,
        risk: risk === undefined ? 0.5 : Number(Math.min(1, Math.max(0, risk / 10)).toFixed(2)),
        upside: upside === undefined ? 0.5 : Number(Math.min(1, Math.max(0, upside / 10)).toFixed(2)),
        consistency: consistency === undefined ? 0.5 : Number(Math.min(1, Math.max(0, consistency / 10)).toFixed(2)),
        positionRanks: { [position]: rank },
        positionTiers: { [position]: tier },
        rankingSource: "Fantasy Footballers UDK",
        sourceAdp,
        sourceProjectedPoints: numeric(cell(row, map, "points")),
        projectionProvenance: {
          source: "Fantasy Footballers UDK",
          importedAt: new Date().toISOString(),
          mode: numeric(cell(row, map, "points")) === undefined
            ? "rank-only"
            : "source-total",
        },
        projectedStats: {},
      });
    });
    combined.duplicates.push(...result.duplicates);
    combined.errors.push(...result.errors);
    combined.reviewRows.push(
      ...result.reviewRows.filter((row) => row.status !== "unmatched").map((row) => ({
        ...row,
        id: `udk-${tableIndex}-${row.id}`,
      })),
    );
  });
  return combined;
}
