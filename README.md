# Fantasy Football Draft Manager

Fantasy Football Draft Manager is a personal, non-commercial web application for league-specific Yahoo Fantasy Football draft recommendations.

> **Project status:** Offline-first draft companion and Advanced Decision Engine complete; Yahoo API-access review pending.

The interface uses a dark, high-contrast shadcn design system with responsive navigation and consistent controls across every workflow.

## Purpose

The application will use league-specific settings and live draft state to produce transparent, data-driven draft recommendations. Recommendations will be advisory only; the application will not make selections or modify Yahoo rosters.

## Planned features

- Import league size, roster positions, scoring categories, scoring modifiers, teams, rosters, and documented draft results through the Yahoo Fantasy Sports API.
- Support user-supplied player rankings through CSV or spreadsheet imports, including suggested matches and manual review for unmatched or duplicate rows.
- Allow rankings, tiers, preferences, and player notes to be edited manually.
- Recalculate player value for the league's exact scoring and roster configuration.
- Track drafted players and each team's roster during a draft when supported by the Yahoo API.
- Provide manual draft tracking and an internal mock-draft simulator as fallbacks.
- Explain recommendations using value over replacement, positional scarcity, roster construction, market availability, and simulation results.
- Record picks in an append-only event log with undo history and exact replay.
- Run deterministic full mocks with configurable opponent strategies and post-draft evaluation.
- Save the active league and draft automatically on the current device.
- Export and restore a portable JSON backup containing settings, rankings, and draft history.
- Paste multiple copied or typed player names to capture live picks in order without API access.

## Yahoo Fantasy Sports API use

The project is requesting read-only Yahoo Fantasy Sports API access. After the account owner authorizes access with OAuth 2.0, the application intends to retrieve only the fantasy data needed for that user's draft assistant, including:

- League metadata and settings
- Team count and roster configuration
- Scoring categories and modifiers
- Teams, eligible players, and rosters
- Documented league draft results

The application will not submit draft picks, change rosters, scrape Yahoo web pages, or redistribute Yahoo data. Mock drafts will use supported API capabilities when available; otherwise, picks will be entered manually.

## Data and privacy approach

- Yahoo credentials and tokens will not be exposed to the browser or committed to this repository.
- Yahoo-derived data will be minimized, secured, and displayed only to the authorized account owner.
- API refresh guidance, rate limits, attribution requirements, and applicable retention requirements will be followed.
- Third-party rankings or projections will be user-supplied or obtained under an appropriate license.

## Availability

The foundation, league-settings audit, rankings workflow, event-sourced manual draft, internal Mock Lab, Offline Bridge, and Advanced Decision Engine are implemented. Recommendations account for live replacement levels, opponent needs, positional runs, risk preference, seeded wait scenarios, and completed-roster forecasts. Best Overall, Safest, Upside, and Positional Pivot views compare the leading candidates. Yahoo connectivity will be added behind the prepared provider adapter after API access and live-draft behavior are verified.

## Project plan

The detailed architecture, milestones, acceptance criteria, Yahoo feasibility gate, and current execution status are maintained in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
