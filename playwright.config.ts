/* Must stay the first import: loads `.env` before any module below reads `process.env`. */
import './src/helpers/loadEnv.helper';
import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import { apiUrl } from './src/api/HttpClient';
import { ENDPOINTS } from './src/constants/endpoints';
import { TIMEOUT } from './src/constants/timeouts';
import { baseUrl } from './src/PageObjects/BasePage';

/**
 * Credentials, URLs and optional settings live in `.env` (git-ignored, loaded
 * by `src/helpers/loadEnv.helper.ts`).
 *
 * Independently runnable layers, one project each:
 *
 *   health     - is the stack up and are the contracts intact?  < 30 s, gates the rest
 *   smoke      - does every core happy path still work?         < 5 min, chromium
 *   regression - does the whole behaviour still hold?           nightly, 3 browsers
 *   e2e        - does the UI's data actually match what's in the DB?  chromium, needs direct SQL Server access
 *   api        - does every route let in exactly the right callers?   no browser, needs only the API
 *   database   - do the schema and the data keep their invariants?    no browser, needs only SQL Server
 *   accessibility - does axe-core find no violation on any screen?  chromium
 *   visual     - do the data-free screens still look the same?      chromium, local only (Windows baselines)
 *
 *   npm run test:health | test:smoke | test:regression | test:e2e | test:api | test:database | test:a11y | test:visual
 *   npm run test:all - every layer in pipeline order, one merged report (scripts/run-tests.js)
 *
 * On CI the same projects run as one pipeline (`PIPELINE` below), against a
 * stack `webServer` starts (`START_STACK=1`) - see README.md, "CI".
 *
 * See https://playwright.dev/docs/test-configuration.
 */

/**
 * On CI every layer waits for the one below it and is skipped when that one
 * fails: seed-users -> health -> api + database -> setup -> smoke, regression,
 * e2e - so one `playwright test --project=smoke --project=e2e` runs them all, in
 * that order. The order also keeps `api`, which reads roles from sign-in tokens,
 * clear of the tests that change roles. Locally every layer runs on its own.
 */
const PIPELINE = !!process.env.CI;

/** The application repository - next to this one unless `APP_DIR` says otherwise. */
const APP_DIR = path.resolve(__dirname, process.env.APP_DIR ?? '../EW-TravelApp-.Net8-Angular17');

/** Writes reports/test-ids.json and .csv - every test by its [ID: n] tag, with its outcome and product issues. */
const TEST_ID_REPORTER = './src/reporters/testIdReporter.ts';

/** Writes reports/custom-report/ - the test dashboard: results with filters, search and pages, logs, Markdown and run command per test, each failed test's screenshot and trace, and time per feature and project. */
const CUSTOM_REPORTER = './src/reporters/customReport/customReporter.ts';

export default defineConfig({
  testDir: './specs/tests',
  /* Playwright's own defaults, scaled by TIMEOUT_MULTIPLIER - see src/constants/timeouts.ts. */
  timeout: TIMEOUT.test,
  expect: { timeout: TIMEOUT.expect },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* CI prints progress as it runs and keeps an HTML report and a JUnit file as
     artifacts. The JUnit file goes to `reports/`, not `test-results/`: Playwright
     empties `test-results/` at the start of every run. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit.xml' }], [TEST_ID_REPORTER], [CUSTOM_REPORTER]]
    : [['html'], [TEST_ID_REPORTER], [CUSTOM_REPORTER]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: process.env.BASE_URL ?? 'https://localhost:4200',
    /* The Angular dev server serves HTTPS with a self-signed certificate
       (Client/angular.json -> architect.serve.options.ssl), and so does the API
       on https://localhost:5001. Applies to the `request` fixture as well. */
    ignoreHTTPSErrors: true,
    /* Record a trace of every attempt and keep it when the attempt fails, so each
       failed test in reports/custom-report/ opens its trace - locally as well,
       where nothing is retried. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    /* Збирати скріншоти лише при падінні тесту */
    screenshot: 'only-on-failure',
    /* Записувати відео при першому повторі тесту */
    video: 'on-first-retry',
  },

  /* One project per layer; `--project=health` runs the gate on its own. */
  projects: [
    {
      /* Registers test_user_1..5 and grants the roles `PERSONAS` gives them -
         a fresh database (a CI runner's) holds none of them. Idempotent: where
         the accounts exist it changes nothing. See specs/support/users.seed.ts. */
      name: 'seed-users',
      testDir: './specs/support',
      testMatch: /.*\.seed\.ts$/,
    },
    {
      name: 'health',
      testDir: './specs/tests/healthCheck',
      /* The whole layer has a 30 s budget, so a single probe may not sit for
         longer than a few seconds before it is called a failure. */
      timeout: TIMEOUT.healthProbe,
      expect: { timeout: TIMEOUT.healthExpect },
      use: { ...devices['Desktop Chrome'] },
      /* Locally without `dependencies`: health is the gate and must be able to
         run when nothing else can, including the login it would need for a
         storageState. On CI it first needs the test accounts to exist. */
      dependencies: PIPELINE ? ['seed-users'] : [],
    },
    {
      /* Signs in once per role and writes playwright/.auth/{member,admin-moderator}.json.
         Specs opt in per file - `test.use({ persona: 'member' })` - so the
         anonymous specs stay anonymous. See specs/support/auth.ts. */
      name: 'setup',
      testDir: './specs/support',
      testMatch: /.*\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: PIPELINE ? ['api', 'database'] : [],
    },
    {
      name: 'smoke',
      testDir: './specs/tests/smoke',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'regression-chromium',
      testDir: './specs/tests/regression',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'regression-firefox',
      testDir: './specs/tests/regression',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'regression-webkit',
      testDir: './specs/tests/regression',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      /* UI ⇒ API ⇒ DB parity - reads dbo.* directly via
         src/helpers/db/mssql.helper.ts (see TestCoveragePlan.md §7). Chromium
         only: the DB either reflects the write or it doesn't, a second
         rendering engine proves nothing additional here. */
      name: 'e2e',
      testDir: './specs/tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /* The API on its own - which callers each route lets through, and how a
         refused request is answered. Specs take only the request-based
         fixtures (`api`, `apiAs`), so no browser starts and the client need not
         run. Not next to regression/e2e: they change the roles of the accounts
         it signs in as. */
      name: 'api',
      testDir: './specs/tests/api',
      dependencies: PIPELINE ? ['health'] : [],
    },
    {
      /* The schema and the data invariants, read straight from SQL Server
         through the `db` fixture - needs neither the API nor the client, and
         changes nothing. */
      name: 'database',
      testDir: './specs/tests/database',
      dependencies: PIPELINE ? ['health'] : [],
    },
    {
      /* axe-core over every screen and every state a user can open - see
         specs/tests/accessibility. Chromium only: the markup and the colours
         axe checks are the same in every engine. */
      name: 'accessibility',
      testDir: './specs/tests/accessibility',
      dependencies: ['setup'],
      /* Reduced motion switches off Bootstrap's fade transitions, so axe never measures
         the contrast of a dialog or a toast that is still fading in. */
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
    },
    {
      /* Screenshots against the baselines committed next to the specs. Local
         only: they are rendered on Windows, so CI (Linux) never lists this
         project. Refresh them with `npm run test:visual -- --update-snapshots`. */
      name: 'visual',
      testDir: './specs/tests/visual',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
    },
    /* The seed of the Playwright Test Agents (test-plans/seed.spec.ts). Only
       while PW_AGENTS=1 - .mcp.json sets it - so no ordinary run picks it up. */
    ...(process.env.PW_AGENTS === '1'
      ? [
          {
            name: 'agents',
            testDir: './test-plans',
            testMatch: /seed\.spec\.ts$/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),

    /* Smoke ще раз у реальних branded-збірках (system-installed Chrome/Edge)
       замість Playwright-івського bundled Chromium. Лише smoke: без власного
       testDir проєкт підхоплював увесь specs/tests і проганяв набір удруге. */
    {
      name: 'Google Chrome',
      testDir: './specs/tests/smoke',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    // {
    //   name: 'Microsoft Edge',
    //   testDir: './specs/tests/smoke',
    //   dependencies: ['setup'],
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
  ],

  /* START_STACK=1 starts the API and the client the suite runs against, the way
     CI does. Without it they are started by hand - `dotnet run` in API/ and
     `npm start` in Client/ (README.md). Outside CI a server that is already up
     is reused. */
  webServer:
    process.env.START_STACK === '1'
      ? [
          {
            name: 'API',
            /* No launch profile - the environment and the URLs are spelled out
               here instead. The URLs are quoted: `;` splits a POSIX command. */
            command: 'dotnet run --no-launch-profile --urls "https://localhost:5001;http://localhost:5000"',
            cwd: path.join(APP_DIR, 'API'),
            env: { ASPNETCORE_ENVIRONMENT: 'Development' },
            /* A 400 means Kestrel is listening - which it does only once the
               database is migrated and seeded (API/Program.cs). */
            url: apiUrl(ENDPOINTS.buggy.badRequest),
            ignoreHTTPSErrors: true,
            timeout: TIMEOUT.stackStart,
            reuseExistingServer: !process.env.CI,
          },
          {
            name: 'Client',
            /* CI has no mkcert certificate for Client/ssl/, so the client is
               served over plain HTTP there (BASE_URL=http://localhost:4200). The
               API stays on HTTPS, and its CORS policy allows both origins. */
            command: process.env.CI ? 'npx ng serve --ssl=false' : 'npm start',
            cwd: path.join(APP_DIR, 'Client'),
            url: baseUrl(),
            ignoreHTTPSErrors: true,
            timeout: TIMEOUT.stackStart,
            reuseExistingServer: !process.env.CI,
          },
        ]
      : undefined,
});
