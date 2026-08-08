"use client";

import { useMemo } from "react";
import { auditLeagueSettings, auditSummary } from "@/lib/domain/audit";
import type {
  LeagueSettings as LeagueSettingsModel,
  Player,
  PlayerPosition,
  ProjectionStat,
} from "@/lib/domain/types";

interface LeagueSettingsProps {
  league: LeagueSettingsModel;
  players: Player[];
  onLeagueChange: (league: LeagueSettingsModel) => void;
  onReset: () => void;
}

const rosterOptions: Array<{
  key: string;
  label: string;
  eligiblePositions: PlayerPosition[];
}> = [
  { key: "QB", label: "QB", eligiblePositions: ["QB"] },
  { key: "RB", label: "RB", eligiblePositions: ["RB"] },
  { key: "WR", label: "WR", eligiblePositions: ["WR"] },
  { key: "TE", label: "TE", eligiblePositions: ["TE"] },
  { key: "FLEX", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
  { key: "SUPERFLEX", label: "SUPERFLEX", eligiblePositions: ["QB", "RB", "WR", "TE"] },
  { key: "K", label: "K", eligiblePositions: ["K"] },
  { key: "DST", label: "DST", eligiblePositions: ["DST"] },
];

const statDescriptions: Partial<Record<ProjectionStat, string>> = {
  passingYards: "per passing yard",
  passingTouchdowns: "per passing TD",
  interceptions: "per interception",
  rushingYards: "per rushing yard",
  rushingTouchdowns: "per rushing TD",
  receptions: "per reception",
  receivingYards: "per receiving yard",
  receivingTouchdowns: "per receiving TD",
  fumblesLost: "per fumble lost",
};

export function LeagueSettings({
  league,
  players,
  onLeagueChange,
  onReset,
}: LeagueSettingsProps) {
  const audit = useMemo(
    () => auditLeagueSettings(league, players),
    [league, players],
  );
  const summary = auditSummary(audit);

  function updateRosterCount(
    label: string,
    eligiblePositions: PlayerPosition[],
    count: number,
  ) {
    const retained = league.rosterSlots.filter((slot) => slot.label !== label);
    const added = Array.from({ length: Math.max(0, count) }, (_, index) => ({
      id: `${label}-${index + 1}`,
      label,
      eligiblePositions,
    }));
    const knownLabels = new Set(rosterOptions.map((option) => option.label));
    const ordered = [
      ...rosterOptions.flatMap((option) =>
        option.label === label
          ? added
          : retained.filter((slot) => slot.label === option.label),
      ),
      ...retained.filter((slot) => !knownLabels.has(slot.label)),
    ];
    onLeagueChange({ ...league, rosterSlots: ordered });
  }

  function updateScoringRule(stat: ProjectionStat, pointsPerUnit: number) {
    onLeagueChange({
      ...league,
      scoringRules: league.scoringRules.map((rule) =>
        rule.stat === stat ? { ...rule, pointsPerUnit } : rule,
      ),
    });
  }

  return (
    <section className="tool-page settings-page">
      <div className="tool-hero settings-hero">
        <div>
          <p className="eyebrow">League model</p>
          <h1>Audit every rule before it affects a pick.</h1>
          <p>
            These values flow directly into projected points, replacement
            demand, roster fit, and pick timing. Yahoo imports will land on
            this same review screen.
          </p>
        </div>
        <div className="audit-score-card">
          <span>Model readiness</span>
          <strong>{summary.modeled}/{audit.length}</strong>
          <small>{summary.errors > 0 ? `${summary.errors} errors need attention` : summary.warnings > 0 ? `${summary.warnings} warning to review` : "All current settings modeled"}</small>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-editor-stack">
          <section className="panel settings-card">
            <div className="section-heading">
              <div><p className="eyebrow">League basics</p><h2>Draft environment</h2></div>
              <button className="secondary-button" onClick={onReset}>Restore demo settings</button>
            </div>
            <div className="form-grid">
              <label><span>League name</span><input value={league.name} onChange={(event) => onLeagueChange({ ...league, name: event.target.value })} /></label>
              <label><span>Team count</span><input type="number" min="8" max="20" value={league.teamCount} onChange={(event) => onLeagueChange({ ...league, teamCount: Number(event.target.value) })} /></label>
              <label><span>Draft type</span><select value={league.draftType} onChange={(event) => onLeagueChange({ ...league, draftType: event.target.value as LeagueSettingsModel["draftType"] })}><option value="snake">Snake</option><option value="linear">Linear</option><option value="salary-cap">Salary cap</option></select></label>
              <label><span>Scoring label</span><input value={league.scoringLabel} onChange={(event) => onLeagueChange({ ...league, scoringLabel: event.target.value })} /></label>
            </div>
          </section>

          <section className="panel settings-card">
            <div className="section-heading">
              <div><p className="eyebrow">Starter demand</p><h2>Roster positions</h2></div>
              <span className="local-badge">{league.rosterSlots.length} starters</span>
            </div>
            <div className="roster-count-grid">
              {rosterOptions.map((option) => {
                const count = league.rosterSlots.filter((slot) => slot.label === option.label).length;
                return (
                  <label key={option.key}>
                    <span>{option.label}<small>{option.eligiblePositions.join(" / ")}</small></span>
                    <input type="number" min="0" max="5" value={count} aria-label={`${option.label} roster count`} onChange={(event) => updateRosterCount(option.label, option.eligiblePositions, Number(event.target.value))} />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="panel settings-card scoring-card">
            <div className="section-heading">
              <div><p className="eyebrow">Exact scoring</p><h2>Point modifiers</h2></div>
              <span className="local-badge">{league.scoringRules.length} rules</span>
            </div>
            <div className="scoring-rule-list">
              {league.scoringRules.map((rule) => (
                <label key={rule.stat}>
                  <span><strong>{rule.label}</strong><small>{statDescriptions[rule.stat] ?? rule.stat}</small></span>
                  <input type="number" step="0.01" value={rule.pointsPerUnit} aria-label={`${rule.label} points`} onChange={(event) => updateScoringRule(rule.stat, Number(event.target.value))} />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="audit-panel panel">
          <div className="section-heading">
            <div><p className="eyebrow">Settings audit</p><h2>Coverage report</h2></div>
            <span className={`audit-total ${summary.errors > 0 ? "error" : summary.warnings > 0 ? "warning" : "modeled"}`}>{summary.errors > 0 ? "Blocked" : summary.warnings > 0 ? "Review" : "Ready"}</span>
          </div>
          <div className="audit-list">
            {audit.map((item) => (
              <div className={`audit-item ${item.status}`} key={item.id}>
                <span className="audit-icon">{item.status === "modeled" ? "✓" : item.status === "warning" ? "!" : "×"}</span>
                <div><strong>{item.label}</strong><p>{item.detail}</p></div>
              </div>
            ))}
          </div>
          <div className="yahoo-placeholder">
            <span className="status-dot" />
            <div><strong>Yahoo import pending</strong><p>Once approved, imported values will be staged here for confirmation before they change the active draft model.</p></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
