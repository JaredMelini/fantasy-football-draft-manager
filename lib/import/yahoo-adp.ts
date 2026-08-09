import type { Player, PlayerPosition } from "../domain/types";
import { parseDelimitedRankings, type RankingTable } from "./rankings";

export interface YahooAdpUpdate {
  playerId: string;
  sourceName: string;
  matchedName: string;
  yahooPlayerId?: string;
  allDraftsAdp?: number;
  recentAdp?: number;
  percentDrafted?: number;
  overallRank?: number;
  importedAt: string;
}

export interface YahooAdpSuggestion {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  score: number;
}

export interface YahooAdpReviewRow {
  id: string;
  rowNumber: number;
  sourceName: string;
  sourceTeam?: string;
  sourcePosition?: PlayerPosition;
  yahooPlayerId?: string;
  allDraftsAdp?: number;
  recentAdp?: number;
  percentDrafted?: number;
  overallRank?: number;
  importedAt: string;
  suggestions: YahooAdpSuggestion[];
}

export interface YahooAdpImportResult {
  updates: YahooAdpUpdate[];
  reviewRows: YahooAdpReviewRow[];
  duplicates: string[];
  errors: string[];
}

interface YahooColumns {
  player?: number;
  team?: number;
  position?: number;
  yahooPlayerId?: number;
  allDraftsAdp?: number;
  recentAdp?: number;
  percentDrafted?: number;
  overallRank?: number;
  importedAt?: number;
}

const aliases: Record<keyof YahooColumns, string[]> = {
  player: ["player", "player name", "name"],
  team: ["team", "nfl team", "tm"],
  position: ["position", "pos"],
  yahooPlayerId: ["yahoo player id", "yahoo id", "player id"],
  allDraftsAdp: ["all drafts adp", "all drafts", "yahoo adp all"],
  recentAdp: [
    "last 7 days adp",
    "last 7 days",
    "recent adp",
    "yahoo adp recent",
  ],
  percentDrafted: ["percent drafted", "% drafted", "%drafted"],
  overallRank: ["yahoo rank", "rank", "overall rank"],
  importedAt: ["imported at", "updated at", "refreshed at"],
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePosition(value: unknown): PlayerPosition | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace("D/ST", "DST")
    .replace(/^DEF$/, "DST")
    .replace(/^D$/, "DST");
  return (["QB", "RB", "WR", "TE", "K", "DST"] as string[]).includes(
    normalized,
  )
    ? (normalized as PlayerPosition)
    : undefined;
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

function columnsFor(headers: string[]): YahooColumns {
  const normalized = headers.map(normalize);
  return Object.fromEntries(
    (Object.keys(aliases) as Array<keyof YahooColumns>).flatMap((field) => {
      const index = normalized.findIndex((header) => aliases[field].includes(header));
      return index >= 0 ? [[field, index]] : [];
    }),
  );
}

function value(
  table: RankingTable,
  rowIndex: number,
  columns: YahooColumns,
  field: keyof YahooColumns,
) {
  const column = columns[field];
  return column === undefined ? undefined : table.rows[rowIndex]?.[column];
}

function suggestionsFor(
  sourceName: string,
  sourceTeam: string | undefined,
  sourcePosition: PlayerPosition | undefined,
  players: Player[],
): YahooAdpSuggestion[] {
  const normalizedName = normalize(sourceName);
  const normalizedTeam = normalize(sourceTeam);
  return players
    .map((player) => {
      const playerName = normalize(player.name);
      const longest = Math.max(normalizedName.length, playerName.length, 1);
      const nameScore = 1 - editDistance(normalizedName, playerName) / longest;
      const teamBonus =
        normalizedTeam && normalize(player.nflTeam) === normalizedTeam ? 0.14 : 0;
      const positionBonus =
        sourcePosition && player.positions.includes(sourcePosition) ? 0.14 : 0;
      return {
        playerId: player.id,
        playerName: player.name,
        team: player.nflTeam,
        position: player.positions.join("/"),
        score: Math.round(
          Math.max(0, Math.min(1, nameScore + teamBonus + positionBonus)) * 100,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName))
    .slice(0, 3);
}

function matchPlayer(
  players: Player[],
  sourceName: string,
  sourceTeam?: string,
  sourcePosition?: PlayerPosition,
  yahooPlayerId?: string,
): Player | undefined {
  if (yahooPlayerId) {
    const byId = players.find(
      (player) => player.externalIds?.yahoo === yahooPlayerId,
    );
    if (byId) return byId;
  }
  let matches = players.filter(
    (player) => normalize(player.name) === normalize(sourceName),
  );
  if (sourceTeam) {
    const teamMatches = matches.filter(
      (player) => normalize(player.nflTeam) === normalize(sourceTeam),
    );
    if (teamMatches.length > 0) matches = teamMatches;
  }
  if (sourcePosition) {
    const positionMatches = matches.filter((player) =>
      player.positions.includes(sourcePosition),
    );
    if (positionMatches.length > 0) matches = positionMatches;
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function updateFor(
  player: Player,
  row: Omit<YahooAdpReviewRow, "id" | "rowNumber" | "suggestions">,
): YahooAdpUpdate {
  return {
    playerId: player.id,
    sourceName: row.sourceName,
    matchedName: player.name,
    yahooPlayerId: row.yahooPlayerId,
    allDraftsAdp: row.allDraftsAdp,
    recentAdp: row.recentAdp,
    percentDrafted: row.percentDrafted,
    overallRank: row.overallRank,
    importedAt: row.importedAt,
  };
}

export function buildYahooAdpImport(
  tables: RankingTable[],
  players: Player[],
  importedAt = new Date().toISOString(),
): YahooAdpImportResult {
  const result: YahooAdpImportResult = {
    updates: [],
    reviewRows: [],
    duplicates: [],
    errors: [],
  };
  const seenPlayerIds = new Set<string>();
  const seenSourceRows = new Set<string>();

  tables.forEach((table, tableIndex) => {
    const columns = columnsFor(table.headers);
    if (columns.player === undefined) {
      result.errors.push(`File ${tableIndex + 1}: map a Player column.`);
      return;
    }
    if (columns.allDraftsAdp === undefined && columns.recentAdp === undefined) {
      result.errors.push(
        `File ${tableIndex + 1}: include All Drafts ADP or Last 7 Days ADP.`,
      );
      return;
    }

    table.rows.forEach((_row, rowIndex) => {
      const sourceName = String(value(table, rowIndex, columns, "player") ?? "").trim();
      if (!sourceName) return;
      const sourceTeam =
        String(value(table, rowIndex, columns, "team") ?? "").trim() || undefined;
      const sourcePosition = normalizePosition(
        value(table, rowIndex, columns, "position"),
      );
      const yahooPlayerId =
        String(value(table, rowIndex, columns, "yahooPlayerId") ?? "").trim() ||
        undefined;
      const allDraftsAdp = numeric(
        value(table, rowIndex, columns, "allDraftsAdp"),
      );
      const recentAdp = numeric(value(table, rowIndex, columns, "recentAdp"));
      if (
        (allDraftsAdp === undefined || allDraftsAdp <= 0) &&
        (recentAdp === undefined || recentAdp <= 0)
      ) {
        return;
      }
      const rowImportedAt = String(
        value(table, rowIndex, columns, "importedAt") ?? importedAt,
      ).trim();
      const validImportedAt = Number.isNaN(Date.parse(rowImportedAt))
        ? importedAt
        : new Date(rowImportedAt).toISOString();
      const parsedRow = {
        sourceName,
        sourceTeam,
        sourcePosition,
        yahooPlayerId,
        allDraftsAdp,
        recentAdp,
        percentDrafted: numeric(
          value(table, rowIndex, columns, "percentDrafted"),
        ),
        overallRank: numeric(value(table, rowIndex, columns, "overallRank")),
        importedAt: validImportedAt,
      };
      const sourceKey = `${normalize(sourceName)}:${sourcePosition ?? ""}`;
      if (seenSourceRows.has(sourceKey)) {
        result.duplicates.push(sourceName);
        return;
      }
      seenSourceRows.add(sourceKey);

      const matched = matchPlayer(
        players,
        sourceName,
        sourceTeam,
        sourcePosition,
        yahooPlayerId,
      );
      if (matched && !seenPlayerIds.has(matched.id)) {
        seenPlayerIds.add(matched.id);
        result.updates.push(updateFor(matched, parsedRow));
        return;
      }
      result.reviewRows.push({
        id: `yahoo-${tableIndex}-${rowIndex + 2}`,
        rowNumber: rowIndex + 2,
        ...parsedRow,
        suggestions: suggestionsFor(
          sourceName,
          sourceTeam,
          sourcePosition,
          players,
        ),
      });
    });
  });

  return result;
}

export function yahooAdpUpdateFromReview(
  row: YahooAdpReviewRow,
  player: Player,
): YahooAdpUpdate {
  return updateFor(player, row);
}

export function applyYahooAdpImport(
  players: Player[],
  updates: YahooAdpUpdate[],
): Player[] {
  const updatesByPlayer = new Map(
    updates.map((update) => [update.playerId, update]),
  );
  return players.map((player) => {
    const update = updatesByPlayer.get(player.id);
    if (!update) return player;
    return {
      ...player,
      yahooAdpAll: update.allDraftsAdp ?? player.yahooAdpAll,
      yahooAdpRecent: update.recentAdp ?? player.yahooAdpRecent,
      yahooPercentDrafted: update.percentDrafted ?? player.yahooPercentDrafted,
      yahooOverallRank: update.overallRank ?? player.yahooOverallRank,
      yahooAdpUpdatedAt: update.importedAt,
      yahooAdpAllUpdatedAt:
        update.allDraftsAdp === undefined
          ? player.yahooAdpAllUpdatedAt
          : update.importedAt,
      yahooAdpRecentUpdatedAt:
        update.recentAdp === undefined
          ? player.yahooAdpRecentUpdatedAt
          : update.importedAt,
      externalIds: update.yahooPlayerId
        ? { ...player.externalIds, yahoo: update.yahooPlayerId }
        : player.externalIds,
    };
  });
}

export function clearYahooAdp(players: Player[]): Player[] {
  return players.map((player) => {
    const cleared = { ...player };
    delete cleared.yahooAdpAll;
    delete cleared.yahooAdpRecent;
    delete cleared.yahooPercentDrafted;
    delete cleared.yahooOverallRank;
    delete cleared.yahooAdpUpdatedAt;
    delete cleared.yahooAdpAllUpdatedAt;
    delete cleared.yahooAdpRecentUpdatedAt;
    return cleared;
  });
}

export function parseYahooAdpText(text: string): RankingTable {
  const parsed = parseDelimitedRankings(text);
  const initialColumns = columnsFor(parsed.headers);
  if (
    initialColumns.player !== undefined &&
    (initialColumns.allDraftsAdp !== undefined ||
      initialColumns.recentAdp !== undefined)
  ) {
    return parsed;
  }

  const rows = [parsed.headers, ...parsed.rows];
  const headerIndex = rows.findIndex((row) => {
    const columns = columnsFor(row.map((item) => String(item ?? "")));
    return (
      columns.player !== undefined &&
      (columns.allDraftsAdp !== undefined || columns.recentAdp !== undefined)
    );
  });
  return headerIndex >= 0
    ? {
        headers: rows[headerIndex].map((item) => String(item ?? "")),
        rows: rows.slice(headerIndex + 1),
      }
    : parsed;
}

export interface YahooAdpPlayerCell {
  name: string;
  team: string;
  position: PlayerPosition;
  yahooPlayerId?: string;
}

/**
 * Parses the visible text in Yahoo's Player cell. Yahoo currently renders the
 * name as plain div text and uses the player link only for its notes icon.
 */
export function parseYahooAdpPlayerCell(
  text: string,
  playerHref = "",
): YahooAdpPlayerCell | undefined {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const metadataPattern =
    /\b([A-Za-z]{2,3})\s*-\s*(QB|RB|WR|TE|K|DEF|DST|D\/ST)\b/i;
  const metadataIndex = lines.findIndex((line) => metadataPattern.test(line));
  if (metadataIndex < 1) return undefined;

  const metadata = lines[metadataIndex].match(metadataPattern);
  const position = normalizePosition(metadata?.[2]);
  const name = lines.slice(0, metadataIndex).join(" ").trim();
  if (!metadata || !position || !name) return undefined;

  const yahooPlayerId = playerHref.match(/\/players\/(\d+)/)?.[1];
  return {
    name,
    team: metadata[1].toUpperCase(),
    position,
    ...(yahooPlayerId ? { yahooPlayerId } : {}),
  };
}

export const YAHOO_ADP_BOOKMARKLET = `javascript:(async()=>{const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));const findTable=()=>[...document.querySelectorAll('table')].find(x=>/Basic ADP/i.test(x.innerText||'')&&/All Drafts/i.test(x.innerText||''));const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const clean=c=>(c?.innerText||'').trim();const extract=t=>{const h=[...t.querySelectorAll('thead tr')].pop();const hs=h?[...h.querySelectorAll('th')].map(x=>clean(x)):[];const key=v=>v.replace(/\\s+/g,'').toLowerCase();const ix=n=>hs.findIndex(x=>key(x)===key(n));const value=(c,n)=>{const i=ix(n);return i>=0?clean(c[i]):''};return[...t.querySelectorAll('tbody tr')].map(r=>{const c=[...r.querySelectorAll('td')];if(c.length<2)return null;const pi=ix('Player');const pc=c[pi>=0?pi:0];const cell=clean(pc);const lines=cell.split(/\\n+/).map(x=>x.trim()).filter(Boolean);const pattern=/\\b([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|DST|D\\/ST)\\b/i;const mi=lines.findIndex(x=>pattern.test(x));const m=mi>=0?lines[mi].match(pattern):null;const name=mi>0?lines.slice(0,mi).join(' ').trim():'';if(!name||!m)return null;const link=pc?.querySelector('a[href*="/nfl/players/"],a[href*="/nfl/teams/"]');const id=((link?.getAttribute('href')||'').match(/\\/players\\/(\\d+)/)||[])[1]||'';const position=/^(DEF|DST|D\\/ST)$/i.test(m[2])?'DST':m[2].toUpperCase();return[id,name,m[1].toUpperCase(),position,value(c,'Rank'),value(c,'%Drafted'),value(c,'All Drafts'),value(c,'Last 7 Days'),new Date().toISOString()]}).filter(Boolean)};let table;let rows=[];for(let attempt=0;attempt<24;attempt+=1){table=findTable();if(table){rows=extract(table);if(rows.length)break}await sleep(250)}if(!table){alert('Open Yahoo Fantasy Draft Analysis first.');return}if(!rows.length){alert('Yahoo ADP is still loading. Wait until player names and ADP values are visible, then try the bookmark again.');return}const data=[['Yahoo Player ID','Player','Team','Position','Yahoo Rank','Percent Drafted','All Drafts ADP','Last 7 Days ADP','Imported At'],...rows].map(r=>r.map(q).join(',')).join('\\n');const b=new Blob([data],{type:'text/csv'});const a=document.createElement('a');const pos=(new URL(location.href).searchParams.get('pos')||rows[0][3]||'all').toLowerCase().replace(/[^a-z0-9]+/g,'-');a.href=URL.createObjectURL(b);a.download='yahoo-adp-'+pos+'-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})().catch(error=>alert('Yahoo ADP export failed: '+(error?.message||String(error))));void 0`;
