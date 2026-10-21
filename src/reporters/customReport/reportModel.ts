/**
 * The data `customReporter.ts` embeds in `reports/custom-report/index.html` and
 * `template/report.js` renders. Every path inside it is relative to the report
 * folder, so the folder can be moved or uploaded as a whole.
 */

/** What the report counts and filters by - Playwright's outcome folded into three. */
export type ReportStatus = 'passed' | 'failed' | 'skipped';

export interface ReportImage {
  /** The attachment's name: `screenshot`, or `<name>-actual.png` / `-expected.png` / `-diff.png` of a visual comparison. */
  name: string;
  /** `data/<sha1>.png`. */
  src: string;
}

export interface ReportFailure {
  /** The first error's message without ANSI colours - shown under the test. */
  message: string;
  /** Location, errors, step log, output and page snapshot of the failed attempt - what the Copy button copies. */
  markdown: string;
  screenshots: ReportImage[];
  /** `data/<sha1>.zip`, opened in the trace viewer copied to `trace/`. */
  trace?: string;
  /** `npx playwright show-trace ...` - for a report opened from disk, where the trace viewer cannot start. */
  showTraceCommand?: string;
}

/** One test in one project. */
export interface ReportTest {
  /** Unique within the run: the project name and Playwright's test id. */
  key: string;
  /** The `@<n>` tag - `null` for the setup and seed tests, which carry none. */
  id: number | null;
  title: string;
  project: string;
  /** Relative to the repository root, with forward slashes. */
  file: string;
  line: number;
  /** See `features.ts`. */
  feature: string;
  /** Every tag except the `@<n>` ID tag. */
  tags: string[];
  status: ReportStatus;
  /** Failed first, passed on a retry. Counted as passed. */
  flaky: boolean;
  /** Status of the last attempt, or `notRun` for a test the run never reached. */
  lastAttempt: string;
  retries: number;
  /** Every attempt together. */
  durationMs: number;
  /** The product issues annotated on the test (`specs/support/issues.ts`). */
  issues: string[];
  skipReason?: string;
  /** stdout, then stderr, of the attempt the report shows - the failed one, else the last. Empty when it printed nothing. */
  output: string;
  /** `npx playwright test "<file>:<line>" --project="<project>"` - what the Run button copies. */
  runCommand: string;
  /** Present for a failed test, and for a flaky one - its failed attempt. */
  failure?: ReportFailure;
}

export interface ReportTagGroup {
  name: string;
  tags: string[];
}

export interface ReportData {
  title: string;
  /** The environment on the header's stub: `TEST_ENV`, else `CI` or `LOCAL`. */
  environment: string;
  /** The client the run tested - `use.baseURL`. Empty when no project sets one. */
  baseUrl: string;
  startedAt: string;
  durationMs: number;
  /** Playwright's verdict on the whole run: `passed`, `failed`, `timedout` or `interrupted`. */
  runStatus: string;
  playwrightVersion: string;
  /** Tags within a group are alternatives when filtering; the groups narrow each other down. */
  tagGroups: ReportTagGroup[];
  /** The features that have tests, in the order of `FEATURES`. */
  features: string[];
  /** The projects that have tests, in run order. */
  projects: string[];
  tests: ReportTest[];
}
