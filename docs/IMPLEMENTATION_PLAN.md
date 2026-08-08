# Fantasy Football Draft Manager — Implementation Plan

Last updated: August 8, 2026

## 1. Product objective

Build a private, read-only draft assistant for Yahoo Fantasy Football that:

1. Imports the user's real league settings and team context.
2. Accepts editable custom rankings and raw-stat projections.
3. Tracks picks and rosters during real and mock drafts.
4. Recommends the player who produces the highest expected improvement to the user's completed roster.
5. Explains every recommendation without depending on an AI model for the underlying calculation.

The application is advisory. It will not submit picks or change a Yahoo roster.

## 2. Product principles

- **League-specific:** scoring, roster slots, team count, keepers, draft order, and format are first-class inputs.
- **User-controlled:** personal rankings and overrides take precedence over provider rankings.
- **Projection-aware:** exact custom scoring requires raw projected stats, not only ordinal rankings.
- **Deterministic core:** scoring, roster assignment, and recommendation calculations are reproducible and testable.
- **Probabilistic decisions:** ADP estimates whether a player will be available later; it never dictates player quality.
- **Explainable:** each recommendation exposes its component values and alternatives.
- **Resilient:** manual pick capture works whenever Yahoo synchronization is delayed or unavailable.
- **Compliant:** use supported APIs, read-only access, minimal retention, required attribution, and no Yahoo page scraping.

## 3. Supported formats

### Initial target

- NFL season-long redraft
- Head-to-head points
- Snake and non-snake drafts
- Standard offensive positions, flex, and superflex
- Fractional and negative scoring
- Manual mocks and internal simulated mocks

### Designed for later support

- Keepers and traded/custom picks
- Salary-cap drafts
- IDP
- Best ball, dynasty, and Guillotine-specific strategies

Unsupported settings must be shown to the user. They must never be silently ignored.

## 4. Architecture

### Application layers

1. **Provider adapters**
   - Yahoo OAuth and Fantasy API
   - CSV/XLSX ranking and projection imports
   - Optional licensed ranking/projection providers
   - Manual and simulated draft event sources
2. **Normalization**
   - Canonical players and external IDs
   - League settings and scoring rules
   - Projection stat keys and data-coverage warnings
3. **Domain engine**
   - Fantasy point calculation
   - Eligible roster-slot assignment
   - Replacement baselines and positional scarcity
   - Recommendation scoring
   - Seeded opponent and draft simulations
4. **Application services**
   - Draft event log and state reconstruction
   - Recommendation snapshots
   - Sync health and reconciliation
5. **Interface**
   - Setup and settings audit
   - Rankings studio
   - Live draft room
   - Mock lab
   - Draft replay and evaluation
6. **Optional AI analyst**
   - Receives structured recommendation results only
   - Explains changes, alternatives, and scenarios
   - Never supplies authoritative player values or mutates draft state

### Runtime shape

- Responsive React/Next-style application using the Sites-compatible vinext runtime.
- Persistent worker for Yahoo polling once approved.
- Server-Sent Events for draft updates.
- Durable database for user-authored rankings and settings once persistence is introduced.
- Encrypted Yahoo refresh tokens stored server-side only.
- Pure domain modules shared by the interface, worker, tests, and simulations.

## 5. Core data model

### League

- Provider and external league key
- Season, team count, draft type, and scoring type
- Draft time, pick timer, and round/pick ownership
- Roster slots and eligible positions
- Position limits
- Scoring rules and projection-coverage status
- Keeper and traded-pick assignments

### Player

- Stable internal ID
- Display name, NFL team, eligible positions, bye week, and status
- External IDs for Yahoo and ranking/projection providers
- Injury, suspension, and role-risk metadata

### Rankings and projections

- Versioned ranking set and source
- Rank, position rank, tier, notes, pin/fade/exclude flags
- Immutable imported baseline plus user overrides
- Versioned raw-stat projection set
- Floor, median, ceiling, and uncertainty where available

### Draft

- Draft session and source
- Ordered, idempotent pick events
- Team rosters reconstructed from events
- Corrections and undo events
- Sync status and last provider update
- Recommendation snapshot at every user decision

## 6. Recommendation methodology

### Stage A — exact league scoring

For each player, multiply every supported projected statistic by the corresponding league scoring rule. Report rules without a matching projection field.

### Stage B — roster-aware value

Use roster-slot eligibility to calculate:

- Projected points
- Value over replacement
- Value over the last expected starter
- Tier drop and remaining positional supply
- User roster need and legal-roster feasibility

Flex and superflex baselines must be calculated through eligible-slot assignment rather than fixed positional counts.

### Stage C — market and opportunity cost

Use ADP and opponent roster needs to estimate:

- Probability the player survives to the user's next pick
- Likelihood of a positional run
- Expected next-available player at each position
- Cost of selecting a player earlier than necessary

### Stage D — candidate rollouts

For the strongest candidates, run seeded draft simulations. Evaluate the optimized completed roster produced after selecting each candidate now.

Conceptual utility:

```text
expected optimized starter value above replacement
+ bench contingency and upside value
+ scarcity and value protected before the next pick
+ user preference
- injury and projection uncertainty
- roster completion penalties
- opportunity cost
```

The interface should present best overall, safest, upside, and positional-pivot recommendations with confidence and a component breakdown.

## 7. Yahoo integration feasibility gate

Yahoo approval is pending. Before live synchronization is considered reliable:

1. Complete OAuth 2.0 authorization and token refresh.
2. Import a real league and compare every setting with Yahoo's interface.
3. Verify live visibility and latency of the documented `draftresults` resource.
4. Respect returned refresh guidance and observe throttling behavior.
5. Test keeper and custom draft-order coverage.
6. Determine whether any documented mock-draft resource is available.
7. Reconcile provider results with a manually recorded test draft.

If live results are delayed, automatic mode will show its age and manual capture will remain immediately available.

## 8. Ranking and projection import plan

### Universal import

- CSV, XLSX, and copy/paste
- Column mapping preview
- ID-first player matching
- Name/team/position fallback matching
- Duplicate, ambiguous, and unmatched review queue
- No silent discards

### Editing

- Direct rank and tier edits
- Drag-and-drop reordering
- Multi-select tier changes
- Pin, fade, exclude, sleeper, and do-not-draft flags
- Notes, undo, and version history
- Provider refresh that preserves manual overrides

### Provider policy

- Only documented APIs or user-supplied files
- Provider-specific adapters isolated from the domain engine
- Licensing and attribution recorded with each imported data set

## 9. Interface plan

### Setup

- Yahoo connection status
- League selection
- Settings audit with modeled/warning/unsupported status
- Draft order, keeper, and positional-limit confirmation

### Rankings Studio

- Import and mapping workflow
- Editable tiered player table
- Projection coverage and source freshness
- Personal preference tools

### Draft Room

- Pick history and draft board
- Searchable available-player table
- User roster and open slots
- Current and upcoming pick context
- Recommendation card and alternatives
- Sync health, undo, and manual-mode controls

### Mock Lab

- Internal simulated opponents
- Manual Yahoo mock companion mode
- Repeatable seeds and strategy presets
- Recommendation-versus-choice review

## 10. Security, privacy, and compliance

- Request Yahoo read-only access.
- Never store client secrets or OAuth tokens in browser code or source control.
- Encrypt refresh tokens at rest.
- Apply OAuth state, PKCE where supported, and CSRF protection.
- Minimize Yahoo-derived data and enforce documented retention requirements.
- Do not expose opponent or account data to unrelated users.
- Do not send manager identities, OAuth data, or raw Yahoo payloads to an AI service.
- Provide disconnect and delete-data controls.
- Display required Yahoo Fantasy attribution.
- Do not automate Yahoo picks or scrape Yahoo pages.

## 11. Testing strategy

### Domain tests

- Standard, half-PPR, full-PPR, and custom scoring
- Fractional and negative values
- Six-point passing touchdowns and bonuses
- Flex and superflex replacement baselines
- Drafted/excluded player filtering
- Legal roster completion
- Deterministic seeded simulations

### Import tests

- Column mapping and validation
- Duplicate and ambiguous player handling
- External ID matching
- Manual override preservation

### Draft-state tests

- Duplicate and out-of-order events
- Undo and correction
- Reconnect and reconciliation
- Provider delay and manual fallback

### Product acceptance criteria

- Every scoring setting is modeled or visibly flagged.
- A drafted or excluded player is never recommended.
- Recommendation calculation completes within one second for the target league size.
- Ranking edits immediately update recommendations.
- The app remains usable without Yahoo or AI availability.
- A completed draft can be replayed exactly from its event log.

## 12. Delivery milestones

### M0 — Foundation (complete)

- Project runtime and design system
- Domain types
- Exact scoring engine
- Baseline recommendation engine
- Sample league and player fixtures
- Interactive manual draft demo
- Unit and rendered-output tests

### M1 — Settings and rankings (complete)

- League settings editor and audit
- CSV import and player matching
- Rankings Studio and saved overrides
- Projection coverage reporting

### M2 — Draft state and internal mocks (complete)

- Event-sourced draft session
- Full manual draft workflow
- Roster assignment and validation
- Seeded internal opponent simulator
- Replay and evaluation

### M3 — Yahoo connector

- OAuth and encrypted token storage
- League discovery and settings normalization
- Teams, rosters, and draft-result synchronization
- Sync health and reconciliation
- Yahoo feasibility report from real test drafts

### M4 — Advanced decision engine

- Dynamic replacement baselines
- ADP availability model
- Opponent-needs model
- Candidate rollouts
- Risk preferences and explanations

### M5 — Production hardening

- Privacy and deletion controls
- Provider attribution and retention jobs
- Performance, accessibility, and failure-mode testing
- Private production deployment and operational monitoring

### M6 — Advanced formats

- Keepers and traded picks
- Salary-cap valuation, inflation, bidding, and nomination strategy
- IDP and additional Yahoo formats

## 13. Current execution log

- [x] Product and Yahoo API research completed.
- [x] Yahoo Fantasy Sports API application submitted.
- [x] Public project repository created.
- [x] Sites-compatible application scaffold initialized.
- [x] M0 domain types, scoring, roster assignment, and baseline recommendations.
- [x] Interactive manual draft demo with opponent simulation, undo, and reset.
- [x] Domain tests and rendered-output build verification.
- [x] First tested milestone committed and pushed on `codex/foundation`.
- [x] Shared application shell with live navigation and shared league/player state.
- [x] League settings editor with modeled, warning, and error coverage audit.
- [x] Local CSV, TSV, and XLSX rankings import with column mapping and match review.
- [x] Editable personal ranks, tiers, ADP values, and player notes.
- [x] M1 import, audit, type, domain, and rendered-output verification.
- [x] Append-only draft event model with deterministic replay, idempotent merge, and undo history.
- [x] Complete manual draft workflow with search, position filters, roster-slot assignment, and correction controls.
- [x] Seeded opponent simulator with balanced, best-available, and needs-first presets.
- [x] Mock Lab with full-draft automation, replay slider, team boards, and decision evaluation.
- [x] Expanded 70-player demo pool for complete ten-team starter mocks.
- [x] M2 event, simulator, roster, evaluation, type, lint, and rendered-output verification.
