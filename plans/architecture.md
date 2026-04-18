# Journal App — Architecture Plan

## 1. Product Overview

A personal PWA for daily journaling and note-taking, inspired by writingstreak.io but less prescriptive. The core loop is: write an entry (or multiple) for today → optionally add supplementary notes and tags → review history in a calendar view → track writing streaks and word count over time.

Primary device: laptop. Secondary: iPhone (iOS). Single user only for now.

---

## 2. Naming

Landing nav label for today's entries: **"Today"** — clean, direct, universally understood.

App internal name: `journal-app`. No public branding needed for personal use.

---

## 3. MVP Scope

**In scope:**
- Auth (reuse Cognito User Pool from meditation-timer)
- Landing page: today's entries summary, create new entry, history, account
- Create/edit entries with title, body, notes, tags
- **Markdown throughout**: entries stored as Markdown strings in DynamoDB; edited via a Markdown editor (formatting toolbar + raw Markdown toggle); rendered as Markdown in all view contexts
- "Today" page: list today's entries; auto-redirect to entry if only one exists
- History page: calendar grid view with entry cards, week-row selection, **tag filtering**
- Entry detail: read-only Markdown-rendered view with edit mode toggle
- Writing streak tracking (consecutive days with at least one entry)
- Word count saved per entry, visible in stats
- Draft auto-save to localStorage (so you never lose work mid-write)
- Tag autocomplete from existing tags
- PWA installable on iPhone

**Out of scope (future):**
- Rich text editor (WYSIWYG — e.g. Tiptap) — high priority V2
- Search across entries
- Export (Markdown / CSV)
- Mood/energy fields
- Multiple users
- Push notifications or reminders
- Language tagging (Spanish practice mode)

---

## 4. User Flow

```
App opens
    │
    ▼
Login (if no valid session)
    │
    ▼
Landing page
  ├─ Streak badge + today's word count
  ├─ [Today] → Today page (or direct to entry if exactly 1 today)
  ├─ [+ New Entry] → Entry editor (new entry for today)
  ├─ [History] → History page
  └─ [Account] → Account page

Today page
  ├─ 0 entries today → redirect to new entry editor (or show empty + prompt)
  ├─ 1 entry today  → navigate directly to entry editor for that entry
  └─ 2+ entries     → list of entry cards; tap to open editor

Entry editor (new or edit)
  ├─ Title field (auto-filled if blank, see §7)
  ├─ Body textarea (required — cannot save if empty)
  ├─ Notes textarea (optional)
  ├─ Tag input with autocomplete
  ├─ Word count live display
  ├─ [Save] → writes to DynamoDB, clears draft from localStorage
  └─ [Cancel/Back] → warns if unsaved changes

Entry detail (read-only from History)
  ├─ Shows title, date, tags, body, notes
  └─ [Edit] → opens entry editor for this entry

History page
  ├─ Calendar grid (month view, Sunday-start)
  ├─ Days with entries shaded; streak days highlighted
  ├─ Left/right arrows navigate months
  │   ├─ Left hidden at/before earliest entry month
  │   └─ Right hidden at current month
  ├─ Clicking a week row → shows entry cards below calendar
  └─ Each card: title, date, tags | body preview | notes preview (if any)

Account page
  ├─ Email display
  ├─ Streak + total entries + total words
  └─ [Log out]
```

---

## 5. Functional Requirements

### Landing Page
- Show current writing streak (days) and today's word count (sum of all today's entries)
- [Today] navigates to `/today`
- [+ New Entry] navigates to `/entries/new`
- Streak and today's stats derived from DynamoDB data, cached in localStorage for fast paint
- `localStorage.lastEntryDate` used to decide whether to fetch today's stats on mount

### Today Page (`/today`)
- Fetches all entries where `date === today`
- 0 entries: show "Nothing yet today" with a prominent [Write] button
- 1 entry: navigate directly to `/entries/:entryId/edit`
- 2+ entries: show list of entry cards (title, time, word count), tap to open

### Entry Editor (`/entries/new`, `/entries/:entryId/edit`)
- **Title**: optional free text. If blank on save, auto-generate: `"Weekday, Month Day"` (e.g. `"Thursday, April 17"`). If a second entry exists for that day, append ` — #2`, `#3`, etc.
- **Body**: required. Markdown editor (see §7 stack — `@uiw/react-md-editor` or equivalent) with a formatting toolbar and a raw Markdown toggle. [Save] disabled until body has at least one non-whitespace character. Live word count displayed below.
- **Notes**: optional. Same Markdown editor component. Placeholder: `"Vocabulary, corrections, references…"`
- **Tags**: free-form input. As you type, a dropdown shows matching existing tags (from all prior entries). Press Enter or comma to add. Tags normalized to lowercase on save.
- **Draft auto-save**: body, notes, and title saved to `localStorage.draft_<entryId_or_"new">` on every keystroke (debounced 500ms). Restored on mount if present. Cleared on successful save or explicit discard.
- **Unsaved changes guard**: if navigating away with unsaved edits, show a confirmation prompt.

### History Page (`/history`)
- Fetches all entries, groups by date
- Renders month-at-a-glance calendar grids, newest first
- Sunday-start, 7 columns
- Days with entries: shaded (e.g. indigo tint). Days without: gray. Today: bordered.
- Streak days (consecutive from today backwards): a subtle streak color or underline
- Left/right arrows: navigate months. Left arrow hidden when at the earliest entry month. Right arrow hidden when at current month.
- **Tag filter bar**: above the calendar, shows all used tags as clickable pills. Selecting a tag filters the calendar to only shade days that have at least one entry with that tag; entry cards below also filter to matching entries only. Multiple tags can be selected (OR logic — show entries with any selected tag). Selecting a tag that's already selected deselects it. "Clear" button resets filter.
- Clicking anywhere in a **week row** selects that week, collapses any previously selected week, and renders entry cards below the calendar
- Entry cards: `title` + `date` + `tags` on top, horizontal rule, `body` rendered as Markdown, optional second horizontal rule + `notes` rendered as Markdown if present
- Entry ordering within a day: **newest first** (by `createdAt` descending)
- Clicking a card: opens `/entries/:entryId` (read-only detail with an [Edit] button)

### Account Page (`/account`)
- Shows email
- Stats section: current streak, longest streak, total entries, total words
- [Log out] button

---

## 6. Questions & Answers

### What other DB fields would be helpful?

Beyond the user-facing fields, these metadata fields are worth saving:

| Field | Rationale |
|-------|-----------|
| `wordCount` | Saved at write time from body only (not notes). Powers stats without re-scanning text. |
| `updatedAt` | ISO timestamp of last save. Useful for "last edited" display and future conflict detection. |
| `entryId` | Stable UUID used in URLs and localStorage draft keys — doesn't expose creation timestamp in routes. |
| `createdAt` | ISO timestamp of first save (the SK). Allows multiple entries per day ordered by creation time. |
| `date` | YYYY-MM-DD. Denormalized from `createdAt` for efficient date grouping client-side. |

**Is `wordCount` enough for stats?** Largely yes. Every other useful stat is derivable from `wordCount` + `createdAt` + `date` at query time:

| Stat | How derived |
|------|-------------|
| Total words written | Sum all `wordCount` |
| Total entries | Count records |
| Average words/entry | Total words ÷ total entries |
| Average words/active day | Total words ÷ unique dates |
| Words over time | Group `wordCount` by `date` or month |
| Most-used tags | Flatten all `tags` arrays, count occurrences |
| Longest entry | Max `wordCount` |
| Best writing day | Max sum of `wordCount` per `date` |
| Time-of-day patterns | Hour extracted from `createdAt` |

The only field worth considering beyond `wordCount` is `noteWordCount` (word count of the notes field separately), if you ever want to distinguish "writing practice words" from "annotation words." Deferred for now — single `wordCount` on body is sufficient for V1.

Fields considered but deferred:
- `language` — useful for Spanish practice context but too early to standardize
- `mood` — common in journal apps but adds UI friction; better as a free-form tag

### What other features would be helpful?

**Near-term (V2, prioritized):**
- **Search** — full-text search across body/title client-side over the full fetched entry list
- **Export** — download all entries as a single Markdown file or JSON dump
- **Streak goals** — daily word count target (e.g. 250 words) with visual progress on landing
- **Stats page** — word count over time chart, best streak, most-used tags, longest entries

**Longer-term:**
- **Language mode** — tag an entry with a language; notes field could be labelled "Corrections / Vocabulary" in that mode
- **Linked entries** — link today's entry to a past one ("following up on…")
- **Stats page** — word count over time chart, most-used tags, longest entries

---

## 7. Technical Architecture

### Stack
Identical to meditation-timer, plus one library:
- **Vite + React 18**
- **React Router v7** (client-side, `basename="/journal"`)
- **AWS SDK v3**: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`
- **AWS Cognito**: reuse existing User Pool + same IAM credentials
- **DynamoDB**: dedicated `journal_entries` table
- **[`@uiw/react-md-editor`](https://github.com/uiwjs/react-md-editor)** — Markdown editor with formatting toolbar, live preview pane, and raw Markdown toggle. Used for body and notes in `EntryEditor`. Also exports a `<MDEditor.Markdown>` render component used for view-only display in cards and detail pages. Single library handles both editing and rendering. Saves as plain Markdown strings — no proprietary format.
- **vite-plugin-pwa**: service worker + installability
- **GitHub Actions → GitHub Pages**: deploy on push to main

### File Structure

```
journal-app/
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              ← AuthProvider + auth-gated routes
│   │   ├── context/
│   │   │   └── AuthContext.jsx  ← authState, user, login, logout (copy from meditation-timer)
│   │   ├── lib/
│   │   │   ├── auth.js          ← Cognito SDK wrapper (copy from meditation-timer)
│   │   │   ├── entries.js       ← DynamoDB read/write for journal entries
│   │   │   └── tags.js          ← tag utilities (normalize, extract all tags from entries)
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Today.jsx
│   │   │   ├── EntryEditor.jsx  ← new + edit (mode determined by entryId param)
│   │   │   ├── EntryDetail.jsx  ← read-only; has [Edit] button
│   │   │   ├── History.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Account.jsx
│   │   ├── components/
│   │   │   ├── MonthGrid.jsx    ← calendar grid, accepts selectedWeek + onWeekClick
│   │   │   ├── EntryCard.jsx    ← card used in Today, History week rows
│   │   │   └── TagInput.jsx     ← tag input with dropdown autocomplete
│   │   └── styles/
│   │       └── (per-page CSS files)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── create-user.sh           ← gitignored (reuse from meditation-timer if user already exists)
├── plans/
│   └── architecture.md
└── .github/workflows/deploy.yml
```

---

## 8. Authentication

**Reuse the existing Cognito User Pool and IAM credentials from meditation-timer verbatim.** Copy `lib/auth.js` and `context/AuthContext.jsx` unchanged. The same `VITE_COGNITO_CLIENT_ID` works — the App Client is not app-specific.

New IAM permissions needed: `PutItem`, `UpdateItem`, and `Query` on the new `journal_entries` table (see §18).

See `../meditation-timer/plans/architecture.md §15` for the complete auth implementation reference.

---

## 9. Data Model

### Table: `journal_entries` (dedicated table)

A dedicated DynamoDB table, separate from `meditation_sessions` and the workout tracker. Same AWS account, region, and IAM credentials — just a new table. Clean separation: no shared schema concerns, no SK prefix hacks, no cross-app data in queries.

| Attribute | Type | Notes |
|-----------|------|-------|
| `userId` (PK) | String | `USER#<cognito-sub>` — same convention as meditation-timer |
| `createdAt` (SK) | String | ISO 8601 timestamp of first save — sort key |
| `entryId` | String | UUID — stable identifier used in URLs and draft cache keys |
| `date` | String | `YYYY-MM-DD` — denormalized for client-side date grouping |
| `updatedAt` | String | ISO timestamp of last edit |
| `title` | String | User-provided or auto-generated |
| `body` | String | Main entry text |
| `notes` | String | Optional supplementary notes |
| `tags` | List<String> | Lowercase-normalized tag array |
| `wordCount` | Number | Word count of `body` only, computed client-side at save time |

**Access patterns:**
- All entries for user: `Query` PK=`USER#<sub>` — returns everything
- Entries for a specific date: query all and filter client-side by `date` (personal app, volume is low)
- Single entry: `GetItem` by PK=`USER#<sub>` + SK=`createdAt`

**Why no GSI?** For a single user with a few hundred entries, client-side grouping by date is fast and keeps the schema simple. Add a GSI on `date` if query performance becomes a concern.

**AWS setup:** Create the table in the same region as `meditation_sessions`. PK: `userId` (String), SK: `createdAt` (String). No additional indexes for MVP. Add the table ARN to the IAM policy (see §18).

---

## 10. `lib/entries.js` API

```js
// Create a new entry
export async function createEntry({ userId, entryId, date, createdAt, title, body, notes, tags, wordCount })

// Update an existing entry (title, body, notes, tags, wordCount, updatedAt)
export async function updateEntry({ userId, createdAt, title, body, notes, tags, wordCount })

// Fetch all entries for user (returns newest first)
export async function fetchEntries({ userId })

// Fetch entries for a specific date
export async function fetchEntriesForDate({ userId, date })
// Implementation: fetchEntries() filtered by date, or targeted query with begins_with if volume warrants it
```

`TABLE = 'journal_entries'`. `isDev` check (localhost) logs to console instead of writing to DynamoDB — same pattern as meditation-timer.

---

## 11. Streak Calculation

A **streak** is a run of consecutive calendar days (in user's local timezone) on which at least one entry exists.

- Current streak: count backwards from today. If today has an entry, count = today + previous consecutive days. If today has no entry, start counting from yesterday.
- Longest streak: derived from full entry history, computed client-side.
- Computed in a pure helper function from the array of `date` strings returned by `fetchEntries()`.
- Streak data is cached in `localStorage.streakCache` (invalidated on next `fetchEntries()` call).

```js
// lib/entries.js
export function computeStreaks(dates) {
  // dates: string[] of 'YYYY-MM-DD', may have duplicates
  const unique = [...new Set(dates)].sort().reverse()  // newest first
  // ...returns { currentStreak, longestStreak }
}
```

---

## 12. Draft Auto-Save

- Key: `localStorage.draft_new` for new entries; `localStorage.draft_<entryId>` for edits
- Saves: `{ title, body, notes, tags }` as JSON, debounced 500ms after keystroke
- On `EntryEditor` mount: if a matching draft key exists, restore state and show a subtle "Draft restored" notice
- On successful save: remove the draft key
- On explicit discard (user confirms navigation away): remove draft key

---

## 13. Tag Autocomplete (`TagInput.jsx`)

- All existing tags are extracted from the full `fetchEntries()` result and deduplicated
- As user types in the tag input, filter and show a dropdown of matching existing tags
- Press Enter, comma, or Tab to confirm the current tag
- Clicking a dropdown suggestion adds it
- Tags are stored lowercase-normalized (e.g. `"Spanish" → "spanish"`)
- Displayed as removable pills (×) above/beside the input

---

## 14. State Management

No global state manager. Follows meditation-timer pattern:

- **Auth state**: `AuthContext` (React Context)
- **Entries cache**: fetched on History/Today mount, local state only; no cross-page cache in MVP
- **Draft state**: `localStorage` (survives page refresh)
- **Streak cache**: `localStorage` (fast paint on Landing, refreshed after each fetch)
- **Tag list**: derived from entries array passed as prop or fetched inline in `EntryEditor`

---

## 15. Component Breakdown

### `Landing.jsx`
- Reads `localStorage.streakCache` for fast initial render
- After mount, fetches today's entries for word count
- Shows: streak badge, today's word count, [Today] / [+ New Entry] / [History] / [Account] nav

### `Today.jsx`
- Fetches entries for today on mount
- 0 → empty state + [Write now] button
- 1 → `navigate('/entries/:id/edit', { replace: true })`
- 2+ → list of `<EntryCard>` components

### `EntryEditor.jsx`
- Route params: `:entryId` (edit) or none (new)
- On new: generate `entryId = uuid()`, load draft from `localStorage.draft_new`
- On edit: `fetchEntries()` filtered by entryId, then load (or restore draft if present and newer)
- Controlled form: `title`, `body`, `notes`, `tags[]` in local state
- Live word count: `body.trim().split(/\s+/).filter(Boolean).length`
- Save: `createEntry()` or `updateEntry()`, then clear draft, navigate to Today or History

### `EntryDetail.jsx`
- Route: `/entries/:entryId`
- Fetches entry, renders read-only view matching the card layout spec
- [Edit] → `navigate('/entries/:entryId/edit')`

### `History.jsx`
- Fetches all entries on mount
- `selectedWeek` state (null or `{ year, month, weekIndex }`)
- Renders `<MonthGrid>` per month, newest first
- Below calendar: entry cards for selected week's dates

### `MonthGrid.jsx`
- Props: `year`, `month`, `entryDates: Set<string>`, `streakDates: Set<string>`, `selectedWeek`, `onWeekClick`
- Pure render: 7-column CSS Grid, Sunday-start
- Row click → `onWeekClick({ year, month, weekIndex })`
- Highlighted selected week row

### `TagInput.jsx`
- Props: `value: string[]`, `onChange`, `suggestions: string[]`
- Internal state: current input text, dropdown open/closed
- Renders pills + text input + dropdown

---

## 16. Calendar View — Entry Cards

Per the spec:

```
┌─────────────────────────────────────┐
│ Title               April 17  #spanish │
├─────────────────────────────────────┤
│ Body text goes here. Full entry     │
│ content, not truncated.             │
├─────────────────────────────────────┤  ← only if notes exist
│ Notes text here. Vocabulary etc.    │
└─────────────────────────────────────┘
```

- Clicking a card opens `EntryDetail`
- Cards in history are read-only (edit via the detail page's [Edit] button)

---

## 17. PWA / Offline

- Service worker (vite-plugin-pwa) precaches all static assets
- Landing, Today, and History pages require network (DynamoDB) — show graceful offline state
- Draft auto-save to localStorage means in-progress writes survive network loss; sync on reconnect is not implemented in MVP (entry will just fail to save)
- `manifest.json`: `name: "Journal"`, `start_url: "/journal/"`, `display: "standalone"`, theme color TBD

---

## 18. IAM Policy Additions

The existing IAM user (used for meditation-timer DynamoDB access) needs these permissions added for the new `journal_entries` table:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:Query"
  ],
  "Resource": "arn:aws:dynamodb:us-east-1:*:table/journal_entries"
}
```

This is additive — existing permissions on `meditation_sessions` are untouched. The same IAM user and credentials are reused; only the resource ARN is new.

---

## 19. Environment Variables

Same `.env` as meditation-timer — no new variables needed (same Cognito pool, same IAM credentials, same DynamoDB table):

```
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=...
VITE_AWS_SECRET_ACCESS_KEY=...
VITE_COGNITO_CLIENT_ID=...        ← same App Client ID as meditation-timer
```

---

## 20. Open Questions (to resolve before coding)

1. ~~**Rich text vs. plain text**~~ ✅ Resolved. V1: Markdown editor with toolbar + raw toggle (`@uiw/react-md-editor`). Storage format is Markdown strings. Editing and rendering handled by the same library.

2. **Streak counting edge**: does writing at 11:58 PM and again at 12:02 AM count as two streak days? (Local timezone used for date bucketing — the answer is yes, they're separate days. This is the correct behavior.)

3. ~~**Entry ordering**~~ ✅ Resolved. Newest first within a day.

4. ~~**GitHub Pages basename**~~ ✅ Resolved. `dairylarry.github.io/journal` → basename `/journal`, PWA `start_url: "/journal/"`.

5. **Cognito User Pool reuse**: plan assumes the same Cognito User Pool and App Client ID. If the App Client has been configured to restrict to specific URLs (callback URLs), it may need updating. Confirm.

---

## 21. Implementation Phases

### Phase 1 — Shell + Auth + Navigation
1. Scaffold `frontend/` (Vite + React 18 + React Router v7)
2. Copy `lib/auth.js` and `context/AuthContext.jsx` from meditation-timer
3. Wire `App.jsx` with `AuthProvider` + `AuthedRoutes`
4. Create stub pages: `Landing`, `Today`, `EntryEditor`, `History`, `Account`, `Login`
5. Wire routes, verify navigation and auth gate work

**Deliverable:** Installable PWA shell with auth. Navigates between pages. Builds and deploys.

### Phase 2 — Entry CRUD
1. Implement `lib/entries.js` (`createEntry`, `updateEntry`, `fetchEntries`)
2. Implement `EntryEditor.jsx` (title, body, notes, tags, word count, save)
3. Implement draft auto-save to localStorage
4. Implement `Today.jsx` (fetch today's entries, 0/1/2+ routing)
5. Test round-trip: create, save, reload, verify in DynamoDB

**Deliverable:** Full entry creation and editing works end-to-end.

### Phase 3 — History + Calendar
1. Implement `MonthGrid.jsx` (calendar grid, week selection)
2. Implement `History.jsx` (fetch all entries, render months, week row expansion)
3. Implement `EntryCard.jsx` with `react-markdown` rendering for body and notes
4. Implement `EntryDetail.jsx` with `react-markdown` rendering + [Edit] button
5. Wire streak highlight in calendar
6. Implement tag filter bar (pill UI, client-side filter of calendar shading + cards)

**Deliverable:** Full history view. Entries browsable by calendar with Markdown rendered. Tag filtering works.

### Phase 4 — Landing Stats + Tags
1. Implement `computeStreaks()` in `lib/entries.js`
2. Implement streak + word count display on `Landing.jsx`
3. Implement `TagInput.jsx` with autocomplete
4. Wire tags into `EntryEditor` + display in cards/detail

**Deliverable:** Landing shows streak and today's stats. Tags work with autocomplete.

### Phase 5 — Polish + PWA
1. Responsive styling (laptop + iPhone)
2. PWA manifest + icons
3. Offline empty states
4. Unsaved changes guard in `EntryEditor`
5. Deploy + test install flow on iPhone

**Deliverable:** Shippable V1.
