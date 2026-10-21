# Automation-TypeScript

Test automation for **EW TravelApp** (Angular 17 client + .NET 8 API + SQL Server), built with
[Playwright](https://playwright.dev/) and TypeScript.
The suite has **268 tests in 43 files** across 13 Playwright projects (counted with `npx playwright test --list`).

The examples below use real tests from this repository:

| What | Example |
| --- | --- |
| one test | `[ID: 27] the offers grid lists at least one seeded post` (line 16) |
| a describe block | `Tests verify browsing the offers grid` (line 10, holds IDs 27 and 28) |
| one file | `specs/tests/smoke/testOffers.spec.ts` |
| several files | `specs/tests/smoke/testOffers.spec.ts` + `specs/tests/smoke/testAuth.spec.ts` |

Commands are written for **PowerShell** (Windows). Bash differences are noted where they matter.

---

## Contents

1. [Project structure](#1-project-structure)
2. [Before you run](#2-before-you-run)
3. [Console runs (local)](#3-console-runs-local)
4. [UI mode runs (local)](#4-ui-mode-runs-local)
5. [Console runs (CI)](#5-console-runs-ci)
6. [Test result dashboards](#6-test-result-dashboards)
7. [Trace Viewer](#7-trace-viewer)
8. [Technologies](#8-technologies)
9. [Design patterns](#9-design-patterns)
10. [Architectural patterns](#10-architectural-patterns)
11. [Test types](#11-test-types)
12. [Signing in and personas](#12-signing-in-and-personas)
13. [Quality gate](#13-quality-gate)
14. [Test agents](#14-test-agents)
15. [CI setup](#15-ci-setup)
16. [Appendix A: filtered runs on GitHub (not implemented yet)](#appendix-a-filtered-runs-on-github-not-implemented-yet)

---

## 1. Project structure

```
Automation-TypeScript/
├── .claude/agents/                        # Playwright Test Agents for Claude Code
│   ├── playwright-test-planner.md         #   explores the app and writes a test plan into test-plans/
│   ├── playwright-test-generator.md       #   turns a plan into specs that follow the project rules
│   └── playwright-test-healer.md          #   debugs failing specs (reports product defects instead of patching tests)
├── .github/
│   ├── Skills/                            # framework documentation
│   │   ├── RulesForWritingTests.md        #   how to write specs (§1–13 + checklist)
│   │   └── RulesForDescribingAPage.md     #   how to describe a Page Object
│   └── workflows/playwright.yml           # CI on GitHub Actions: SQL Server, the stack, shards, report merge
├── .husky/pre-commit                      # before a commit: lint-staged (ESLint) + typecheck
├── .env                                   # URLs, test accounts, options (git-ignored)
├── .mcp.json                              # MCP server for the agents (PW_AGENTS=1)
├── eslint.config.mjs                      # quality gate: typescript-eslint + eslint-plugin-playwright
├── package.json                           # npm scripts test:*, report*, check
├── playwright.config.ts                   # layer projects, dependencies, reporters, webServer
├── tsconfig.json                          # strict TypeScript
├── scripts/run-tests.js                   # CLI shim: -k / -v / --tracing, --all (phases + one report)
│
├── src/                                   # the framework "library" (no tests here)
│   ├── PageObjects/                       # Page Object Model
│   │   ├── BasePage.ts                    #   nav bar, spinner, toasts, open() / waitForLoaded()
│   │   ├── widgets.ts                     #   shared components: loginForm, field, offerCard, memberSidebar,
│   │   │                                  #   tabset, fileUploader, postForm
│   │   ├── index.ts                       #   public exports
│   │   ├── Admin/Admin.page.ts
│   │   ├── Auth/{Login,Registration}/*.page.ts
│   │   ├── Errors/{NotFound,ServerError,TestErrors}/*.page.ts
│   │   ├── Lists/Lists.page.ts
│   │   ├── Messages/Messages.page.ts
│   │   ├── Offers/Offers.page.ts + {AddOffer,EditOffer,OfferDetails}/*.page.ts
│   │   └── Profile/Profile.page.ts + {EditProfile,MemberProfile}/*.page.ts
│   ├── api/
│   │   ├── HttpClient.ts                  #   transport: request fixture + bearer token + zod validation
│   │   ├── TravelApi.ts                   #   facade over the controllers, TravelApi.signedIn()
│   │   └── controllers/                   #   Account, Admin, Buggy, Likes, Messages, Posts, Users
│   ├── constants/
│   │   ├── endpoints.ts                   #   every API route
│   │   ├── messages.ts                    #   toast texts and API error texts
│   │   ├── queries/mssql/*.queries.ts     #   SQL queries: integrity, likes, posts, roles, users
│   │   ├── testData.ts                    #   shared test data (locations, currencies, ...)
│   │   └── timeouts.ts                    #   every timeout, scaled by TIMEOUT_MULTIPLIER
│   ├── helpers/
│   │   ├── data/                          #   post.factory, registration.factory, posts.helper, unique.helper
│   │   ├── db/mssql.helper.ts             #   MssqlClient: msnodesqlv8 driver (Windows) or tedious (CI)
│   │   ├── network/apiStub.helper.ts      #   API responses stubbed through page.route
│   │   ├── browserHealth.helper.ts        #   collects the page's console and network errors
│   │   ├── dragAndDrop.helper.ts          #   HTML5 file drop
│   │   ├── jwt.helper.ts                  #   token decoding, roles
│   │   ├── time.helper.ts                 #   shiftTime() for page.clock
│   │   └── loadEnv.helper.ts              #   loads .env
│   ├── models/
│   │   ├── dto/*.dto.ts                   #   zod schemas of API bodies (contracts)
│   │   ├── db/*.rows.ts                   #   database row types
│   │   └── credentials.ts, index.ts
│   └── reporters/
│       ├── testIdReporter.ts              #   reports/test-ids.json + test-ids.csv
│       └── customReport/                  #   custom dashboard reports/custom-report/
│           ├── customReporter.ts, failureMarkdown.ts, features.ts, format.ts, reportModel.ts
│           └── template/report.html, report.css, report.js
│
├── specs/
│   ├── fixtures/travel-photo.jpg          # the file the specs upload (reach it through FIXTURES)
│   ├── support/                           # test support layer
│   │   ├── fixtures.ts                    #   test.extend: persona, api, apiAs, pageAs, cleanup, apiStub, db
│   │   ├── matchers.ts                    #   expect.extend: toMatchSchema, toHaveNoA11yViolations
│   │   ├── personas.ts                    #   noRole, member, moderator, admin, adminModerator
│   │   ├── auth.ts, signIn.ts, env.ts     #   storageState, sign-in through the UI / a token, environment
│   │   ├── cleanup.ts                     #   undoes a test's changes afterwards (LIFO)
│   │   ├── tags.ts                        #   LAYER_TAG, MUTATION_TAG, idTag()
│   │   ├── issues.ts                      #   product defects the suite caught → annotations
│   │   ├── authorizationProbes.ts         #   requests for the authorization matrix
│   │   ├── users.seed.ts                  #   seed-users project (creates test_user_1..5 with their roles)
│   │   ├── auth.setup.ts, data.setup.ts   #   setup project (member/adminModerator sessions, main photo)
│   │   └── index.ts                       #   public exports (test, expect, ...)
│   └── tests/
│       ├── healthCheck/    3 files        # project health
│       ├── smoke/          8 files        # project smoke (+ project Google Chrome)
│       ├── regression/    13 files        # regression-chromium | regression-firefox | regression-webkit
│       │   └── admin/ auth/ guardsAndErrors/ likesAndLists/ messaging/ offers/ profileAndPhotos/
│       ├── e2e/            4 files        # project e2e (UI ⇒ API ⇒ DB)
│       ├── api/            6 files        # project api
│       ├── database/       2 files        # project database
│       ├── accessibility/  3 files        # project accessibility
│       └── visual/         1 file + testScreens.spec.ts-snapshots/*.png   # project visual (local only)
├── test-plans/seed.spec.ts                # seed for the agents (project agents, only with PW_AGENTS=1)
│
│   ── created by a run (git-ignored) ──
├── playwright/.auth/                      # saved sessions member.json, admin-moderator.json
├── test-results/                          # artifacts of the last run: trace.zip, screenshots, videos
├── playwright-report/                     # Playwright's HTML report
├── blob-report/                           # blob reports of the phases (test:all) or the shards (CI)
└── reports/
    ├── custom-report/index.html           # custom dashboard
    ├── junit.xml                          # JUnit (CI)
    └── test-ids.json, test-ids.csv        # every test by ID
```

### Projects (layers) in `playwright.config.ts`

| Project | Folder | Tests | Browser | Depends on (local) | Depends on (CI) |
| --- | --- | --- | --- | --- | --- |
| `seed-users` | `specs/support/*.seed.ts` | 5 | — | — | — |
| `health` | `healthCheck/` | 23 | Chromium | — | `seed-users` |
| `api` | `api/` | 51 | no browser | — | `health` |
| `database` | `database/` | 6 | no browser | — | `health` |
| `setup` | `specs/support/*.setup.ts` | 3 | Chromium | — | `api`, `database` |
| `smoke` | `smoke/` | 11 | Chromium | `setup` | `setup` |
| `regression-chromium` / `-firefox` / `-webkit` | `regression/` | 43 each | Chrome / Firefox / WebKit | `setup` | `setup` |
| `e2e` | `e2e/` | 4 | Chromium | `setup` | `setup` |
| `accessibility` | `accessibility/` | 21 | Chromium | `setup` | `setup` |
| `visual` | `visual/` | 4 | Chromium | `setup` | never runs on CI |
| `Google Chrome` | `smoke/` | 11 | installed Chrome | `setup` | never runs on CI |
| `agents` | `test-plans/` | 1 | Chromium | `setup` | exists only with `PW_AGENTS=1` |

Health gates the rest: when it is red, the stack is down and the other layers cannot say anything useful. It needs
no login state and creates no data.

---

## 2. Before you run

### Prerequisites

- Node.js 18+ and npm.
- The application under test running locally:
  1. Clone [EW-TravelApp-.Net8-Angular17](https://github.com/RuslanPidhainyi/EW-TravelApp-.Net8-Angular17) next to
     this repository (the config looks for it at `../EW-TravelApp-.Net8-Angular17`; point `APP_DIR` elsewhere
     otherwise).
  2. Configure it by following its
     [installation instructions](https://github.com/RuslanPidhainyi/EW-TravelApp-.Net8-Angular17#impl).
  3. Start it:
     - API: `dotnet run` in `API/` → `https://localhost:5001`
     - client: `npm start` in `Client/` → `https://localhost:4200`

  Both serve HTTPS with self-signed certificates, so the config sets `ignoreHTTPSErrors: true`.
  Instead of starting them by hand, set `$env:START_STACK = '1'`: the config's `webServer` starts both and reuses a
  server that is already running.
- For the `e2e` and `database` layers: access to SQL Server. Locally that is the SQLEXPRESS Named Pipe with Windows
  authentication; override it with `DB_CONNECTION_STRING` in `.env`.

If the API cannot reach SQL Server, override its connection string from the environment instead of editing
`API/appsettings.Development.json` (the database is created and seeded on first run):

```powershell
$env:Data__Connection = 'Data Source=.\SQLEXPRESS;Integrated Security=true;Database=TravelApp;Trust Server Certificate=true'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --no-launch-profile --urls "https://localhost:5001;http://localhost:5000"
```

### Setup

```powershell
npm install               # also installs the pre-commit hook (see "Quality gate")
npx playwright install    # browsers
```

Credentials, URLs and optional settings live in `.env` in the project root. It is git-ignored and it is the only env
file: every key the suite reads is listed there (`BASE_URL`, `API_URL`, `TEST_USER_1..5` / `TEST_PASSWORD_1..5`,
`ADMIN_USER` / `ADMIN_PASSWORD`), the optional ones commented out.

### Filtering rules (important)

| # | Rule |
| --- | --- |
| 1 | **Always pass `--project=`.** Without it a smoke spec also runs in the `Google Chrome` project, and a regression spec runs in three browsers. |
| 2 | `-g` / `--grep` is a **regular expression matched as a substring** of the describe title, the test title and the tags. `-g "@2"` matches **21 tests** (`@2`, `@20…@29`, `@2xx`). To match exactly one test, use `-g "\[ID: 2\]"`. `-g "@27"` is unambiguous for now, because the highest ID is 162. |
| 3 | OR several conditions: `-g "\[ID: 27\]\|\[ID: 28\]"`. Exclude: `-G "\[ID: 27\]"` (`--grep-invert`). |
| 4 | `file:line` runs the test, or the **whole describe block**, that starts on that line. |
| 5 | Every path argument is a regular expression too, and several paths are combined with OR (`testOffers testAuth`). |
| 6 | Escape special characters in describe titles (`likes/{id}`, `(`, `.`, `?`) with `\`, or use a unique fragment of the title. |
| 7 | `--list` is a dry run: it only lists what would run. Use it to check a filter before the real run. |
| 8 | Dependencies run automatically: `smoke` / `regression` / `e2e` / `accessibility` / `visual` run `setup` (3 tests) first. **`-g` and file filters do not apply to dependencies.** |
| 9 | In PowerShell, always quote arguments that contain `@` (`"@27"`); unquoted, `@` means splatting. The `npm test -- …` form works (checked with `npm.ps1`). |
| 10 | `-v` / `-s` / `--reporter=list` **replace** the configured reporters, so neither the HTML report nor the custom dashboard is written. To get progress in the console and the reports: `--reporter=list,html,./src/reporters/testIdReporter.ts,./src/reporters/customReport/customReporter.ts`. |
| 11 | Do not run `api` alongside `regression` or `e2e`: those promote and demote the test accounts, and the authorization matrix reads each account's roles from the token it signs in with. |

Every test carries an `@<n>` ID tag, exactly one layer tag (`@healthCheck` / `@smoke` / `@regression` / `@e2e` /
`@api` / `@database` / `@accessibility` / `@visual`) and exactly one mutation tag (`@mutation` / `@unmutation`).
They come from constants in `specs/support/tags.ts` (`RulesForWritingTests.md` §6) and are matched at the CLI as
plain text with `-g` / `-G`.

### pytest-style flags

`npm test` / `npm run test:*` go through `scripts/run-tests.js`, a thin shim that translates the pytest-style flags
into their `@playwright/test` equivalents and passes everything else straight to `playwright test`:

| Flag | Becomes |
| --- | --- |
| `-k "<pattern>"` | `--grep "<pattern>"` (substring / regex on the title, not pytest's boolean expressions) |
| `-v`, `-s` | `--reporter=list` |
| `--tracing=on` \| `off` \| … | `--trace=on` \| `off` \| … |
| `--headed` | passed through unchanged |
| `--all` | every layer in phases + one merged report |

---

## 3. Console runs (local)

Run every command from the root of `Automation-TypeScript`.

### 3.1. One test

```powershell
# by ID (unambiguous)
npx playwright test --project=smoke -g "\[ID: 27\]"

# by file and the test's line
npx playwright test specs/tests/smoke/testOffers.spec.ts:16 --project=smoke

# by a fragment of the title
npx playwright test --project=smoke -g "lists at least one seeded post"

# through the shim (pytest style)
npm test -- --project=smoke -k "\[ID: 27\]"
npm run test:smoke -- -k "\[ID: 27\]" --headed --tracing=on
```

Expected: 4 tests, the 3 from `setup` and `[ID: 27]` itself.

### 3.2. The tests of one describe block

```powershell
# by the describe title
npx playwright test --project=smoke -g "Tests verify browsing the offers grid"

# by the line where test.describe( starts
npx playwright test specs/tests/smoke/testOffers.spec.ts:10 --project=smoke

# through the shim
npm test -- --project=smoke -k "Tests verify browsing the offers grid"
```

Expected: `[ID: 27]` and `[ID: 28]`, plus `setup`.

### 3.3. One test file

```powershell
npx playwright test specs/tests/smoke/testOffers.spec.ts --project=smoke

# a fragment of the path works too (it is a regex)
npx playwright test testOffers --project=smoke

# through the shim
npm run test:smoke -- specs/tests/smoke/testOffers.spec.ts
```

### 3.4. Several test files

```powershell
# specific files
npx playwright test specs/tests/smoke/testOffers.spec.ts specs/tests/smoke/testAuth.spec.ts --project=smoke

# name fragments
npx playwright test testOffers testAuth --project=smoke

# a whole folder
npx playwright test specs/tests/regression/offers --project=regression-chromium

# files from different layers: each file runs only in the project that owns its folder
npx playwright test specs/tests/smoke/testOffers.spec.ts specs/tests/e2e/testOffersDb.spec.ts --project=smoke --project=e2e
```

### 3.5. Every test in the repository

```powershell
# recommended: phases seed-users -> health -> api + database -> every UI layer;
# one merged report, opened at the end
npm run test:all

# every project in one run (in parallel, no phases)
npm test                 # same as npx playwright test

# by layer
npm run test:health      # the gate - API contract + client availability
npm run test:smoke
npm run test:regression  # 3 browsers
npm run test:e2e
npm run test:api         # authorization matrix + refused requests, straight against the API
npm run test:database    # schema + data invariants, straight against SQL Server
npm run test:a11y        # axe-core over every screen and every state a user can open
npm run test:visual      # screenshots against the committed baselines (local only)

# useful variations
npm run test:all -- -k "@smoke"
npm test -- --headed
$env:TIMEOUT_MULTIPLIER = '2'; npm test     # a slower machine: stretches every timeout at once
```

`npm run test:all` runs one `playwright test` per phase and merges the phases into a single HTML report, served at
`http://localhost:9323` when the run is over (Ctrl+C closes it; `npm run report` opens it again later). The order
comes from the phases, not from the projects' `dependencies`, so a red phase does not hide the ones after it, except
health: when it fails the stack is down and the remaining phases are skipped. `api` runs before the phases that promote
and demote the test accounts.

### 3.6. Visual baselines

`npm run test:visual` compares the screens that show no data (login, registration, not-found and the empty add-post
form) with the images in `specs/tests/visual/testScreens.spec.ts-snapshots/`. They are rendered on Windows, so the
`visual` project runs locally only and CI never lists it. After an intended change to one of those screens:

```powershell
npm run test:visual -- --update-snapshots   # then review the new images before committing them
```

---

## 4. UI mode runs (local)

### Opening UI mode and finding your way around

```powershell
npm run test:ui          # same as npx playwright test --ui
```

A separate window opens.

- **Top of the left panel:** ▶ *Run all*, ■ *Stop*, 👁 *Watch all* (re-runs tests when a file is saved).
- **The `Filter (e.g. text, @tag)` field.** The arrow next to it expands **Status** (passed / failed / skipped) and **Projects** (a checkbox per project).
- **The test tree:** folder → file → describe → test. Hovering a row shows ▶ *Run* and 👁 *Watch*. Clicking a tag in the tree puts it into the filter; Ctrl+click adds it to the tags already selected.
- **How the filter matches (checked in the UI source):** the text is split into words on spaces. **Every word** must occur as a substring of "project + file path + describe + test title + tags", case-insensitively. Words are combined with **AND**; there is no OR.
- **Projects:** tick the projects you need (for example `smoke`), because only ticked projects run. `setup` is pulled in on its own.
- Console arguments (file paths, `-g`, `-G`, `--project`) **narrow the tree right away** (checked in the Playwright source).
- The stack must be running, or set `$env:START_STACK = '1'` before you start.

### 4.1. One test

**With the filter:**
1. `npm run test:ui`
2. **Projects** → tick `smoke`
3. Type `@27` into **Filter** → the tree keeps only `[ID: 27] the offers grid lists at least one seeded post`
4. ▶ next to the test

> For IDs 1 to 16, `@1`…`@16` also matches longer IDs (`@16` → 160–162). Add a word from the title (`@16 photo`) or pick the test in the tree.

**Pre-filtered from the console (UI mode opens already narrowed):**

```powershell
npm run test:ui -- --project=smoke -g "\[ID: 27\]"
npx playwright test "specs/tests/smoke/testOffers.spec.ts:16" --project=smoke --ui   # the command the custom dashboard's "UI mode" button copies
```

### 4.2. The tests of one describe block

**With the filter:** Projects → `smoke`, Filter → `browsing the offers grid`, then ▶ on the describe row `Tests verify browsing the offers grid`.
**With the tree:** expand `smoke` → `testOffers.spec.ts`, hover the describe row → ▶.
**From the console:**

```powershell
npm run test:ui -- --project=smoke -g "Tests verify browsing the offers grid"
npm run test:ui -- --project=smoke specs/tests/smoke/testOffers.spec.ts:10
```

### 4.3. One test file

**With the filter:** Projects → `smoke`, Filter → `testOffers.spec`, then ▶ on the file row.
**From the console:**

```powershell
npm run test:ui -- --project=smoke specs/tests/smoke/testOffers.spec.ts
```

### 4.4. Several test files

The UI filter has no OR, so there are three ways:
1. **Easiest, from the console:** pass several paths, then ▶ *Run all*.
   ```powershell
   npm run test:ui -- --project=smoke specs/tests/smoke/testOffers.spec.ts specs/tests/smoke/testAuth.spec.ts
   ```
2. **Files in one folder:** ▶ on the folder row (for example `regression/offers`).
3. **By hand:** ▶ on each file in turn, waiting for the previous one to finish.

### 4.5. Every test in the repository

1. `npm run test:ui`
2. **Projects** → tick every project you need; clear **Filter**
3. ▶ *Run all* at the top of the panel

> All projects together run in parallel, and `api` clashes with `regression` / `e2e`, which change the roles. It is more reliable to run one layer at a time in the UI (one ticked project), or to do a full run from the console with `npm run test:all`.

### 4.6. Playwright Inspector (debug)

`--debug` is a shortcut for `PWDEBUG=1` plus `--timeout=0 --max-failures=1 --headed`: it opens a real, visible browser
paused at the first action, with step/resume controls and a locator picker.

```powershell
npm run test:debug                                                          # whole suite, headed, paused at start
npm run test:debug -- specs/tests/smoke/testOffers.spec.ts:16 --project=smoke   # a single test

$env:PWDEBUG = '1'; npm run test:health     # the same for any command (bash: PWDEBUG=1 npm run test:health)
```

To pause at an exact line instead of only at the start, drop `await page.pause();` into the spec temporarily. It opens
the Inspector right there, with or without `--debug`. Remove it before committing.

---

## 5. Console runs (CI)

### 5.0. How CI works today

`.github/workflows/playwright.yml` (repository `RuslanPidhainyi/Automation-TypeScript`):

| Trigger | What runs | Shards |
| --- | --- | --- |
| push to `master`, pull request | `--project=smoke --project=accessibility --project=e2e` | 1 |
| nightly at 02:00 UTC | the same + `regression-chromium/-firefox/-webkit` | 3 |
| *Run workflow* (`workflow_dispatch`) | the same; the `regression` checkbox adds regression | 1 or 3 |

How CI mode (`CI=true`) differs from a local run:
- `retries: 2`, `workers: 1`, `forbidOnly`;
- reporters: `list`, `html` (never opened), `junit`, `testIdReporter`, `customReporter`;
- **a dependency chain:** `seed-users → health → api + database → setup → smoke / accessibility / e2e / regression`. When a layer fails, the ones after it are skipped;
- `visual` and `Google Chrome` never run on CI.

> ⚠️ **A filter does not shorten the chain.** With `CI=true`, `--project=smoke -g "\[ID: 27\]"` runs **89 tests**: 5 seed-users + 23 health + 51 api + 6 database + 3 setup + 1 smoke. `--no-deps` leaves 1 test, but only where the accounts and sessions (`playwright/.auth`) already exist. It does not work on a fresh CI runner.

### 5.1. How to run "CI from the console"

| Way | When | How |
| --- | --- | --- |
| **A. GitHub Actions through `gh`** | a real CI run on GitHub | Only the presets are available today: `gh workflow run` (see 5.6). Filters need the inputs from [Appendix A](#appendix-a-filtered-runs-on-github-not-implemented-yet). |
| **B. CI emulation, locally** | check CI behaviour (dependencies, retries) against your own stack | `$env:CI = 'true'` + the filtered command |
| **C. Full emulation** | like the runner: SQL Server in Docker, the stack started by Playwright | [Running like CI on your machine](#running-like-ci-on-your-machine) |

Template for way B (the stack is already running):

```powershell
$env:CI = 'true'
npx playwright test <filter>
Remove-Item Env:CI          # required: the variable lives until the PowerShell session is closed
```

(bash: `CI=true npx playwright test <filter>`)

On GitHub the workflow runs the same command with `--shard=i/n --reporter=list,blob`.

### 5.2. One test (CI)

```powershell
# B - CI emulation
$env:CI = 'true'; npx playwright test --project=smoke -g "\[ID: 27\]"; Remove-Item Env:CI

# A - on GitHub (after Appendix A)
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master -f projects="smoke" -f grep="\[ID: 27\]"
```

### 5.3. The tests of one describe block (CI)

```powershell
# B
$env:CI = 'true'; npx playwright test --project=smoke -g "Tests verify browsing the offers grid"; Remove-Item Env:CI

# A (after Appendix A)
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master -f projects="smoke" -f grep="Tests verify browsing the offers grid"
```

### 5.4. One test file (CI)

```powershell
# B
$env:CI = 'true'; npx playwright test specs/tests/smoke/testOffers.spec.ts --project=smoke; Remove-Item Env:CI

# A (after Appendix A)
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master -f projects="smoke" -f specs="specs/tests/smoke/testOffers.spec.ts"
```

### 5.5. Several test files (CI)

```powershell
# B
$env:CI = 'true'; npx playwright test specs/tests/smoke/testOffers.spec.ts specs/tests/smoke/testAuth.spec.ts --project=smoke; Remove-Item Env:CI

# A (after Appendix A)
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master -f projects="smoke" -f specs="specs/tests/smoke/testOffers.spec.ts specs/tests/smoke/testAuth.spec.ts"
```

### 5.6. Every test (CI)

Works today, with no change to the workflow:

```powershell
# A - the full CI set on GitHub: smoke + accessibility + e2e + regression x3, on 3 shards
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master -f regression=true

# A - without regression (like a push / PR)
gh workflow run playwright.yml -R RuslanPidhainyi/Automation-TypeScript --ref master

# follow the run
gh run list  -R RuslanPidhainyi/Automation-TypeScript --workflow playwright.yml -L 5
gh run watch <RUN_ID> -R RuslanPidhainyi/Automation-TypeScript

# B - the same set locally in CI mode
$env:CI = 'true'
npx playwright test --project=smoke --project=accessibility --project=e2e --project=regression-chromium --project=regression-firefox --project=regression-webkit
Remove-Item Env:CI
```

Without `gh`: GitHub → **Actions** → **Playwright Tests** → **Run workflow** → pick the branch, tick
*Run regression in three browsers as well* if needed → **Run workflow**.
To install `gh`: `winget install GitHub.cli`, then `gh auth login`.

---

## 6. Test result dashboards

A run leaves three reports:

| Report | Location | Contents |
| --- | --- | --- |
| **Playwright HTML report** | `playwright-report/index.html` | every test, steps, errors, screenshots, videos, traces, product-issue annotations |
| **Custom dashboard** | `reports/custom-report/index.html` | total / passed / failed / skipped and the run's duration; **Results**: every test a page at a time, filtered by status, layer tag, `@mutation` / `@unmutation`, feature and project, searched by ID, file, tag or error, with *Logs* / *Screenshot* / *Trace* / *Markdown* / *Run*; **Performance**: counts, % and time **per feature**, the slowest tests, time per project |
| **Table by ID** | `reports/test-ids.csv` / `.json` | ID, project, file, layer, outcome, retries, duration, product issues |

About the custom dashboard (`src/reporters/customReport/`):
- **Statistics:** a spec belongs to a feature by its path (`src/reporters/customReport/features.ts`); a new spec the map misses is counted under `Other`. The figures at the top filter the list by status; *Duration* opens **Performance**.
- **Theme:** light or dark after the system; the button under the environment switches Auto / Light / Dark and the browser remembers it.
- **Filters:** the status switch picks one status; tags of one group widen the selection, the groups narrow it. The view, the filters and the page are kept in the URL, so a filtered view can be bookmarked.
- **Search:** by ID (`62`, `@62`, `62 63`), spec file name or path (`file:line` finds one test), or text in the title, a tag, the feature, the project or the error.
- **Per test:** **Logs** opens the error and the console output; **Markdown** puts the test on the clipboard as Markdown - for a failed test with the errors and the code around them, the step log, the output and the page snapshot; **Run** copies `npx playwright test "<file>:<line>" --project="<project>"` (add `--ui` for UI mode). **Screenshot** shows the page when the test failed (greyed out for a passed test and for API and database tests) and **Trace** opens the trace viewer - Playwright keeps both for failed attempts only.

A test that caught a product defect carries it as an `issue` annotation (`specs/support/issues.ts`), which the HTML
report and `reports/test-ids.*` show as well. `npm run test:all` and CI write all of these from the merged report.

### 6.1. By hand, after a local run

**Playwright HTML report**
- Opens by itself: if anything failed in a local run, the browser opens `http://localhost:9323`. After `npm run test:all` it always opens.
- To open it by hand:
  1. In Windows Explorer (or VS Code → right-click the folder → *Reveal in File Explorer*) go to `Automation-TypeScript\playwright-report\`.
  2. Double-click `index.html` to open it in the browser.
  3. Click a test to see its steps, error, screenshot, video and the **Traces** block.

  > A report opened from disk (`file://`) shows the results, but **a trace does not open this way**. For traces use 6.3.

**Custom dashboard**
1. Go to `Automation-TypeScript\reports\custom-report\`.
2. Double-click `index.html`.
3. At the top: the run and its environment, then the totals; below them, *Results* with the search, the filters and the tests, 50 to a page; *Performance* holds the *By feature* table and the time. Under each test: *Logs* / *Screenshot* / *Trace* / *Markdown* / *Run*. Opened from disk, *Trace* only copies a `show-trace` command.

**Table:** open `Automation-TypeScript\reports\test-ids.csv` in Excel.

> If you ran with `-v` / `--reporter=list`, the reports **were not updated** (rule 10 in section 2).

### 6.2. By hand, after a CI run

1. Open https://github.com/RuslanPidhainyi/Automation-TypeScript → the **Actions** tab.
2. On the left, pick the **Playwright Tests** workflow.
3. Click the run you need (commit name / *Scheduled* / *Manually run by …*).
4. On the **Summary** page scroll down to **Artifacts**:
   - `playwright-report`: the merged report of every shard (appears after the *merge the shard reports* job, kept 30 days);
   - `test-results-N`: the raw artifacts of shard N, only when it failed (7 days);
   - `blob-report-N`: intermediate blob reports (1 day).
5. Click **`playwright-report`** to download `playwright-report.zip`, then unzip it.
6. In the unzipped folder:
   - `playwright-report\index.html`: the Playwright HTML report;
   - `reports\custom-report\index.html`: the custom dashboard;
   - `reports\junit.xml`, `reports\test-ids.csv`.

   Double-click to open. For traces, open the reports from the console (6.4).

### 6.3. From the console, after a local run

```powershell
npm run report            # HTML report (playwright show-report) -> http://localhost:9323, Ctrl+C stops it
npm run report:custom     # custom dashboard served over http, so the Trace button works

# both at once (different ports)
npx playwright show-report --port 9323
npx playwright show-report reports/custom-report --port 9324

# from disk, no server (no trace viewer)
Invoke-Item playwright-report\index.html
Invoke-Item reports\custom-report\index.html
Invoke-Item reports\test-ids.csv
```

> If `show-report` says port 9323 is taken, a server from an earlier run is still up. Reloading that tab is enough: it reads `playwright-report/` from disk.

### 6.4. From the console, after a CI run

```powershell
# 1. find the run
gh run list -R RuslanPidhainyi/Automation-TypeScript --workflow playwright.yml -L 5

# 2. download the report artifact (a new folder per run)
gh run download <RUN_ID> -R RuslanPidhainyi/Automation-TypeScript -n playwright-report -D "$env:TEMP\ew-ci-report-<RUN_ID>"

# 3. open it (from the root of Automation-TypeScript)
npx playwright show-report "$env:TEMP\ew-ci-report-<RUN_ID>\playwright-report"
npx playwright show-report "$env:TEMP\ew-ci-report-<RUN_ID>\reports\custom-report" --port 9324

# the run page in the browser
gh run view <RUN_ID> -R RuslanPidhainyi/Automation-TypeScript --web
```

---

## 7. Trace Viewer

The config sets `trace: 'retain-on-failure'`: every attempt is traced, but the trace is **kept only for failed
tests**, locally as well. To get a trace of a test that passes, add `--trace=on` (or `--tracing=on` through the shim).

### 7.1. From the console

```powershell
# a trace for one test, even if it passes
npx playwright test --project=smoke -g "\[ID: 27\]" --trace=on

# find the traces of the last run (test-results/ is emptied at the start of every run)
Get-ChildItem test-results -Recurse -Filter trace.zip | Select-Object FullName

# open one
npx playwright show-trace "test-results\<test-folder>\trace.zip"

# the traces copied into the custom dashboard (the Trace button, opened from disk, copies exactly this command)
Get-ChildItem reports\custom-report\data -Recurse -Filter *.zip
npx playwright show-trace "reports\custom-report\data\<file>.zip"

# an empty viewer you can drop any trace.zip onto
npx playwright show-trace

# a trace from CI: the test-results-N artifact, or the traces inside the merged playwright-report\data\
gh run download <RUN_ID> -R RuslanPidhainyi/Automation-TypeScript -n test-results-1 -D "$env:TEMP\ew-ci-results-<RUN_ID>"
npx playwright show-trace "$env:TEMP\ew-ci-results-<RUN_ID>\<test-folder>\trace.zip"
```

A trace also opens from the HTML report (`npm run report` → click the test → **Traces** block → click the thumbnail)
and from the custom dashboard (`npm run report:custom` → **Trace** button).

### 7.2. In UI mode

UI mode shows the trace of every test it runs.

1. `npm run test:ui` (or pre-filtered: `npm run test:ui -- --project=smoke -g "\[ID: 27\]"`).
2. **Projects** → tick the project, find the test in the tree and press ▶.
3. Click the test in the tree. The central area of the window is the trace viewer:
   - **Timeline** at the top: frames of the run;
   - **Actions** on the left: steps (`[Step N][UI]…`), clicks, `expect` calls;
   - the DOM snapshot in the middle, with **Action / Before / After** tabs;
   - the **Locator, Source, Call, Log, Errors, Console, Network, Attachments** tabs at the bottom.
4. 👁 *Watch* next to the test re-runs it on every file save, refreshing the trace.

For step-by-step debugging in a real browser, use the Playwright Inspector (4.6).

---

## 8. Technologies

| Technology | Version | Used for |
| --- | --- | --- |
| **Playwright Test** (`@playwright/test`) | 1.61.0 | runner, UI automation, API requests (`request`), projects and dependencies, fixtures, `storageState`, `webServer`, `toHaveScreenshot`, `page.clock`, `page.route`, UI mode, Trace Viewer, Inspector, sharding, blob reports / merge-reports |
| Browsers | Chromium, Firefox, WebKit, Google Chrome (channel) | cross-browser regression, smoke in the installed Chrome |
| **TypeScript** | 5.9 (strict) | the framework's language |
| **Node.js** | 18+ (CI: LTS) | runtime; `scripts/run-tests.js` |
| **zod** | 4 | DTO schemas, API contract validation |
| **@axe-core/playwright** | 4.13 | accessibility checks (WCAG 2.x A/AA) |
| **mssql** + **msnodesqlv8** / **tedious** drivers | 12 / 5.3 | direct SQL Server access (e2e, database) |
| **dotenv** | 17 | configuration from `.env` |
| **ESLint** + **typescript-eslint** + **eslint-plugin-playwright** | 10 / 8 / 2 | static analysis, spec rules |
| **Husky** + **lint-staged** | 9 / 17 | pre-commit hook (lint + typecheck) |
| **GitHub Actions** | — | CI: SQL Server 2022 as a service container, .NET 8, Node, shards, artifacts |
| Reporters | html, list, junit, blob + 2 custom | reports: HTML, JUnit, `test-ids.json/csv`, the custom dashboard (HTML/CSS/JS) |
| **Playwright Test Agents** + **MCP** (`playwright run-test-mcp-server`) | — | planner / generator / healer AI agents for Claude Code |
| Application under test | Angular 17, .NET 8 Web API, ASP.NET Identity + JWT, SignalR, Cloudinary, SQL Server | — |

---

## 9. Design patterns

| Pattern | Where | What it does |
| --- | --- | --- |
| **Page Object Model** | `src/PageObjects/**/*.page.ts` | one page = one class with locators and actions; assertions stay in the specs |
| **Template Method** | `BasePage` (`abstract path`, `abstract uniqueElement`) | `open()` / `waitForLoaded()` are written once; a page supplies only its route and the element that proves it loaded |
| **Page Component / Widget Object** | `src/PageObjects/widgets.ts` (`offerCard`, `postForm`, `tabset`, `fileUploader`, ...) | shared markup is described once and reused on several pages |
| **Fluent Interface** | `open(): Promise<this>`, `waitForLoaded()` | chained calls: `await new OffersPage(page).open()` |
| **Facade** | `TravelApi` | one entry point to every API controller: `api.posts`, `api.users`, ... |
| **API Object (Service Object)** | `src/api/controllers/*Controller.ts` | one class per .NET API controller; `xxx()` methods (parsed) and `xxxRaw()` (raw response) |
| **Adapter / Wrapper** | `HttpClient` | wraps `APIRequestContext`: bearer token, `expectOk`, zod `parse` |
| **Static Factory Method** | `TravelApi.signedIn()`, `MssqlClient.connect()` (private constructor) | creates a ready-to-use object |
| **Strategy** | `AUTH_STRATEGY` (`ui` / `token`), `DB_DRIVER` (`msnodesqlv8` / `tedious`) | the algorithm is picked by an environment variable |
| **Test Data Builder / Object Mother** | `buildPost(overrides)`, `buildPostDto()`, `buildRegisterDto()`, `uniqueName()` | valid data by default; a test spells out only what it checks |
| **Fixture / Dependency Injection** | `specs/support/fixtures.ts` (`persona`, `api`, `apiAs`, `pageAs`, `cleanup`, `apiStub`, `db`) | a test receives its dependencies as parameters instead of building them |
| **Lazy Initialization + caching** | `apiAs` (a Map per persona) | one sign-in per persona per test |
| **Object Pool (worker-scoped)** | the `db` fixture | one SQL connection pool per worker |
| **Command + undo stack (LIFO)** | `Cleanup` | a change is registered *before* it is made and undone in reverse order after the test |
| **Test Persona** | `PERSONAS` (`noRole`, `member`, `moderator`, `admin`, `adminModerator`) | accounts named after what they may do, not after their usernames |
| **Test Double: Stub** | `ApiStub` (`page.route`) | replaces an API response (for example Cloudinary refusing a photo) without the real backend |
| **Custom Matcher (expect extension)** | `matchers.ts`: `toMatchSchema`, `toHaveNoA11yViolations` | domain checks with readable failure messages |
| **Observer** | custom reporters (`onBegin` / `onTestEnd` / `onEnd`), `collectLoadProblems` (`page` events) | reacts to runner and browser events |
| **Registry / Single Source of Truth** | `ENDPOINTS`, `TIMEOUT`, `LAYER_TAG`, `MUTATION_TAG`, `*.queries.ts`, `PRODUCT_ISSUE` | no magic strings or numbers in specs |
| **Barrel (module public surface)** | `src/PageObjects/index.ts`, `specs/support/index.ts` | specs import from one place |
| **Data-Driven Testing** | `testAuthorizationMatrix.spec.ts` (an array of *probe × caller × status*) | one scenario, many data rows |
| **AAA + steps** | `test.step('[Step N][UI/API/DB] …')`, `expect.soft` | readable structure and every mismatch reported in one run |

---

## 10. Architectural patterns

| Pattern | How it is implemented |
| --- | --- |
| **Layered framework architecture** | `specs/tests` (scenarios) → `specs/support` (fixtures, personas, tags) → `src/PageObjects`, `src/api`, `src/constants/queries` (UI / API / DB domain layer) → `HttpClient`, `MssqlClient`, `helpers`, `models`, `constants` (infrastructure) → Playwright. Each layer calls only the layers below it. |
| **Hybrid framework (UI + API + DB)** | one `test` reaches the browser, the API and the database, so a single test can close the UI ⇒ API ⇒ DB triangle |
| **Test layers / test pyramid** | a separate Playwright project per layer: health, api, database, smoke, regression, e2e, accessibility, visual |
| **Quality gates / pipeline** | on CI: `seed-users → health → api + database → setup → UI layers`, a red layer stops the ones after it; locally `test:all` runs the same phases |
| **Fan-out / fan-in (map-reduce) on CI** | shards write blob reports in parallel; the `report` job merges them with `merge-reports` |
| **Separation of Concerns** | locators in Page Objects, routes in `endpoints.ts`, SQL in `*.queries.ts`, timeouts in `timeouts.ts`, data in factories; a spec only describes the scenario |
| **Contract-first API checks** | zod schemas in `src/models/dto`: every 2xx response is validated in the controller, refused-request bodies through `toMatchSchema` |
| **Externalized configuration (12-factor)** | everything environment-specific comes from `.env` / environment variables (`BASE_URL`, `API_URL`, `DB_*`, `CI`, `START_STACK`, `TIMEOUT_MULTIPLIER`) |
| **Test isolation and self-cleanup** | unique names (`uniqueName`), `Cleanup` after every test, idempotent `seed-users` / `setup`, `@mutation` / `@unmutation` tags |
| **Authentication caching** | the `setup` project signs in once and saves a `storageState`; specs opt in with `test.use({ persona })` |
| **Plugin reporting architecture** | custom reporters plug in next to the built-in ones (`testIdReporter`, `customReporter`) |
| **Shift-left quality gate** | `npm run check` (tsc + ESLint with zero warnings) and the pre-commit hook |
| **Environment as code on CI** | SQL Server as a service container, the application checked out from its own repository, the stack started by `webServer` (`START_STACK=1`) |
| **AI-assisted testing** | planner / generator / healer agents work through MCP and follow the project rules |

---

## 11. Test types

| Type | Tag / project | Tests | What it checks |
| --- | --- | --- | --- |
| **Health check** | `@healthCheck` / `health` | 23 | Whether the stack (API, client, sign-in) is up and the basic contracts hold, within 30 seconds. |
| **Smoke** | `@smoke` / `smoke` | 11 | Whether the core happy paths work: sign-in, the offers grid, adding a post, the profile, likes, messages, the admin panel, navigation. |
| **Regression** | `@regression` / `regression-*` | 43 × 3 | Whether the full behaviour still holds (form validation, guards, error pages, the post lifecycle, roles, photos) in three browsers. |
| **E2E (DB parity)** | `@e2e` / `e2e` | 4 | Whether a UI action is actually committed to the database (UI ⇒ API ⇒ DB, cascading deletes included). |
| **API** | `@api` / `api` | 51 | Whether every route lets in exactly the right callers (401 / 403 / 200) and refuses invalid requests properly, without a browser. |
| **Database** | `@database` / `database` | 6 | Whether the database schema matches the application's model and the data keeps its invariants. |
| **Accessibility (a11y)** | `@accessibility` / `accessibility` | 21 | Whether axe-core finds no WCAG 2.x A/AA violation on any screen, in any state (menus, dialogs, pickers). |
| **Visual** | `@visual` / `visual` | 4 | Whether the screens without data (login, registration, 404, the empty post form) still match their baseline screenshots (local only). |
| **Cross-browser** | `regression-chromium/firefox/webkit`, `Google Chrome` | — | Whether the same behaviour works in every engine and in the real installed Chrome. |
| **Contract (schema)** | in the `api` / `health` layers (zod, `toMatchSchema`) | — | Whether the shape of the API's JSON responses matches the expected contract. |
| **Negative / authorization** | the matrix in `api`, `guardsAndErrors` in `regression` | — | Whether the system refuses correctly: no token, no role, someone else's resource, invalid data, route guards. |
| **UI with a stubbed API** | part of `regression` (`apiStub`) | — | Whether the client builds the request and shows the error correctly for a refusal the real stack cannot produce on demand (Cloudinary rejecting a photo). |
| **Data-driven** | `testAuthorizationMatrix.spec.ts` | — | Whether the same scenario gives the expected result for every combination of data. |

Every test also carries a state tag: `@mutation` means the test changes data (creates, edits, deletes), `@unmutation`
means it only reads. The `seed-users` and `setup` projects are not product tests: they prepare accounts, roles and
sessions.

---

## 12. Signing in and personas

Specs sign in only as the test accounts `test_user_1`…`test_user_5` from `.env`, one per role combination. The seeded
accounts `.env` also lists (Lisa, Bob, admin) are for manual runs; no spec touches them.

The `setup` project signs in once per role (`member` is `test_user_2`, `adminModerator` is `test_user_5`) and saves the
browser state to `playwright/.auth/`. It also makes sure `test_user_2` has a main photo (`specs/support/data.setup.ts`).
It runs automatically before `smoke`, `regression`, `e2e`, `accessibility` and `visual`; `health` stands alone. A spec
opts in per file, so the specs that test login itself stay anonymous:

```ts
import { test } from '../../support';

test.use({ persona: 'member' });   // or 'adminModerator'
```

`AUTH_STRATEGY` in `.env` picks how `setup` signs in: `ui` (default) clicks through the login form, `token` calls
`account/login` directly and plants the response in `localStorage`.

---

## 13. Quality gate

`npm run check` type-checks the project and runs ESLint (`eslint.config.mjs`) with zero warnings allowed. The
TypeScript rules catch a forgotten `await`, and `eslint-plugin-playwright` enforces the spec rules: no raw locators, no
branching inside a test, web-first assertions, no numeric timeouts. The pre-commit hook (`.husky/pre-commit`) runs
ESLint on the staged files plus the type check and refuses a commit that fails. What each rule enforces is in
`.github/Skills/RulesForWritingTests.md` §10.

```powershell
npm run typecheck     # tsc --noEmit over src/ and specs/
npm run lint          # ESLint, zero warnings allowed
npm run lint:fix
npm run check         # typecheck + lint - what the pre-commit hook runs
```

---

## 14. Test agents

`.claude/agents/` holds the three [Playwright Test Agents](https://playwright.dev/docs/test-agents) for Claude Code, and
`.mcp.json` the MCP server they drive the browser through (`npx playwright run-test-mcp-server`, started with
`PW_AGENTS=1`):

| Agent | Does |
| --- | --- |
| `playwright-test-planner` | explores the running application from `test-plans/seed.spec.ts` (test_user_2 signed in, on /offers) and saves a Markdown test plan into `test-plans/` |
| `playwright-test-generator` | turns a plan into specs that follow `.github/Skills/RulesForWritingTests.md` and `RulesForDescribingAPage.md` |
| `playwright-test-healer` | debugs a failing spec; when the application itself is at fault it reports the defect instead of changing the test |

The `agents` project that runs the seed exists only while `PW_AGENTS=1`, so no ordinary run picks it up. To regenerate
the agent files run `PW_AGENTS=1 npx playwright init-agents --loop=claude --project=agents`, then restore the "Project
rules" block at the top of each agent's instructions.

---

## 15. CI setup

`.github/workflows/playwright.yml` brings the whole stack up on an Ubuntu runner and runs the layers in pipeline order
(triggers in [5.0](#50-how-ci-works-today)):

1. SQL Server 2022 starts as a service container; the job waits until it answers.
2. This repository and the application (`RuslanPidhainyi/EW-TravelApp-.Net8-Angular17`, branch `vars.APP_REF`, default
   `EW-021`, into `app/`) are checked out; .NET 8, Node, the client, the suite and Chromium are installed, and
   `dotnet dev-certs https` gives the API a certificate.
3. `npx playwright test --project=smoke --project=accessibility --project=e2e --shard=i/n` does the rest: one shard on a
   push or a pull request, three at night and on demand, when regression joins. Playwright runs a project's
   dependencies in every shard, so each runner walks the whole chain on its own stack. `START_STACK=1` makes the
   config's `webServer` start the API (`dotnet run`, HTTPS on 5001; it migrates and seeds the empty database first) and
   the client (`ng serve --ssl=false`, HTTP on 4200). `seed-users` (`specs/support/users.seed.ts`) registers
   `test_user_1`…`test_user_5` on the fresh database and grants their roles as the seeded admin; where the accounts
   already exist it changes nothing.
4. Every shard uploads a blob report (and, when it fails, its `test-results/`). The `report` job merges the blobs with
   `merge-reports` into `playwright-report/`, `reports/junit.xml`, `reports/test-ids.*` and `reports/custom-report/`,
   uploaded as the `playwright-report` artifact.

On the runner the suite reaches the database with `DB_DRIVER=tedious` and a SQL login; locally it keeps the native
`msnodesqlv8` driver over the Named Pipe (`src/helpers/db/mssql.helper.ts`). `msnodesqlv8` is an optional dependency,
so `npm ci` succeeds on a machine that cannot build it.

The application code the workflow checks out must contain what the suite expects (the `data-testid` hooks and the
fixes `specs/support/issues.ts` points at). Today only `EW-021` does, so it is the default `APP_REF`; once it is merged
into `main`, set the `APP_REF` variable to `main`.

### Secrets and variables

*Settings → Secrets and variables → Actions*:

| Secret | Value |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | the Cloudinary account photo uploads go to (`CloudinarySettings` in the API's `appsettings.json`); without them the job stops at its first step |
| `APP_REPO_TOKEN` | optional, only if the application repository is private |

| Variable | Value |
| --- | --- |
| `APP_REF` | optional: the application branch to test, `EW-021` by default |

Everything else lives and dies with the runner, so the workflow spells it out instead of reading secrets: the SQL
Server `sa` password (`TravelApp_CI_2026`), the seeded `admin` (`API/Data/Seed.cs`), the test accounts
`test_user_1`…`test_user_5` with CI-only passwords (`seed-users` registers them on the fresh database), and the API's
`TokenKey`, generated for every run.

Every run on a fresh database uploads one photo to Cloudinary for `test_user_2` (`specs/support/data.setup.ts`) and
does not delete it; the database it belonged to is gone when the job ends.

### Running like CI on your machine

`START_STACK=1` works locally too: the API and the client are started unless they are already running (outside CI a
running server is reused). The rest of the CI setup can be reproduced against a SQL Server container:

```powershell
docker run -d --name ew-ci-mssql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='<password>' -p 14330:1433 mcr.microsoft.com/mssql/server:2022-latest

$env:CI = 'true'; $env:START_STACK = '1'; $env:BASE_URL = 'http://localhost:4200'; $env:TIMEOUT_MULTIPLIER = '2'
$env:DB_DRIVER = 'tedious'; $env:DB_PORT = '14330'; $env:DB_USER = 'sa'; $env:DB_PASSWORD = '<password>'
$env:Data__Connection = 'Server=localhost,14330;Database=TravelApp;User Id=sa;Password=<password>;TrustServerCertificate=True'
npx playwright test --project=smoke --project=e2e
```

With `CI` set, nothing may already listen on 4200, 5000 or 5001: stop the stack you started by hand first. Remove the
variables afterwards (`Remove-Item Env:CI, Env:START_STACK, …`) or close the PowerShell session.

---

## Appendix A: filtered runs on GitHub (not implemented yet)

Today `workflow_dispatch` has only the `regression` checkbox, so a single test, describe block or file cannot be run on
GitHub. For the way-A commands in section 5 to work, add the following to `.github/workflows/playwright.yml`.

**1. The inputs:**

```yaml
  workflow_dispatch:
    inputs:
      regression:
        description: Run regression in three browsers as well
        type: boolean
        default: false
      projects:
        description: Projects, space-separated (empty = smoke accessibility e2e)
        type: string
        default: ''
      specs:
        description: Spec files or folders, space-separated (empty = all)
        type: string
        default: ''
      grep:
        description: Playwright --grep, e.g. \[ID: 27\] or a describe title (empty = no filter)
        type: string
        default: ''
```

**2. A filtered step.** The values travel through `env` rather than being pasted into `run`, which avoids shell
injection:

```yaml
      - name: Filtered run (projects / specs / grep)
        if: inputs.projects != '' || inputs.specs != '' || inputs.grep != ''
        env:
          PROJECTS: ${{ inputs.projects }}
          SPECS: ${{ inputs.specs }}
          GREP: ${{ inputs.grep }}
        run: |
          args=()
          for project in ${PROJECTS:-smoke accessibility e2e}; do args+=("--project=$project"); done
          for spec in $SPECS; do args+=("$spec"); done
          if [ -n "$GREP" ]; then args+=(--grep "$GREP"); fi
          npx playwright test "${args[@]}" --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }} --reporter=list,blob
```

**3. The two existing run steps** get `&& inputs.projects == '' && inputs.specs == '' && inputs.grep == ''` added to
their `if`, so they are skipped on a filtered run.

Then: `gh workflow run playwright.yml --ref master -f projects="smoke" -f grep="\[ID: 27\]"`. The dependencies
(`seed-users → health → api + database → setup`) still run (see 5.0).
