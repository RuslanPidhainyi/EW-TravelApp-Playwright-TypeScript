import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { LAYER_TAG, MUTATION_TAG } from '../../../specs/support/tags';
import { failureMarkdown } from './failureMarkdown';
import { featureOf, featuresInOrder } from './features';
import { repoRelative, stripAnsi } from './format';
import type { ReportData, ReportFailure, ReportImage, ReportStatus, ReportTest } from './reportModel';

interface CustomReporterOptions {
  /** The report folder, relative to the working directory. Defaults to `reports/custom-report`. */
  outputDir?: string;
  /** The page heading. */
  title?: string;
  /** The badge under the heading. Defaults to `TEST_ENV`, else `CI` on CI and `LOCAL` elsewhere. */
  environment?: string;
}

type Attachment = TestResult['attachments'][number];

const ID_TAG = /^@(\d+)$/;
/** The most of a test's stdout and stderr the page keeps - a chatty test should not bloat the report. */
const MAX_OUTPUT_LENGTH = 20_000;
const TEMPLATE_DIR = path.join(__dirname, 'template');
const EXTENSION_BY_CONTENT_TYPE: Partial<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/zip': '.zip',
};
const STATUS_BY_OUTCOME: Record<ReturnType<TestCase['outcome']>, ReportStatus> = {
  expected: 'passed',
  flaky: 'passed',
  unexpected: 'failed',
  skipped: 'skipped',
};

/**
 * Writes `reports/custom-report/index.html` - one dashboard to triage a run by:
 *
 * - Results: total, passed, failed and skipped tests and the run's duration;
 *   the tests a page at a time, filtered by status, layer and mutation tag,
 *   feature and project, and searched by `[ID: n]`, file, tag or error. Every
 *   test has its logs (error and output), Markdown for a bug report and the
 *   command that runs it; a failed one also its screenshot and its trace.
 * - Performance: counts, percentages and time per application feature
 *   (`features.ts`), the slowest tests and the time each project took.
 *
 * Screenshots and traces are copied into `data/`, so the folder stands on its
 * own. The trace viewer needs the page served over http (`npm run report:custom`);
 * opened from disk, the Trace button copies a `show-trace` command instead.
 */
export default class CustomReporter implements Reporter {
  private readonly outputDir: string;
  private readonly title: string;
  private readonly environment: string;
  private config?: FullConfig;
  private suite?: Suite;

  constructor(options: CustomReporterOptions = {}) {
    this.outputDir = path.resolve(options.outputDir ?? 'reports/custom-report');
    this.title = options.title ?? 'EW-TravelApp Test Dashboard';
    this.environment = options.environment ?? process.env.TEST_ENV ?? (process.env.CI ? 'CI' : 'LOCAL');
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.suite = suite;
  }

  onEnd(result: FullResult): void {
    // `playwright test --list`, and a run that never reached a test, end here too - keep the last report rather than
    // overwrite it with tests that have no result.
    if (!this.suite?.allTests().some((test) => test.results.length > 0)) return;

    const dataDir = path.join(this.outputDir, 'data');
    const traceViewerDir = path.join(this.outputDir, 'trace');
    // Only the folders this reporter fills are emptied - never outputDir itself.
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(traceViewerDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });

    const attachments = new AttachmentStore(this.outputDir);
    const tests = (this.suite?.allTests() ?? []).map((test) => this.toReportTest(test, attachments));
    if (attachments.hasTrace) copyTraceViewer(traceViewerDir);

    const data: ReportData = {
      title: this.title,
      environment: this.environment,
      baseUrl: this.config?.projects.find((project) => project.use.baseURL)?.use.baseURL ?? '',
      startedAt: result.startTime.toISOString(),
      durationMs: result.duration,
      runStatus: result.status,
      playwrightVersion: this.config?.version ?? '',
      tagGroups: [
        { name: 'Layer', tags: Object.values(LAYER_TAG) },
        { name: 'Mutation', tags: Object.values(MUTATION_TAG) },
      ],
      features: featuresInOrder(tests.map((test) => test.feature)),
      projects: [...new Set(tests.map((test) => test.project))],
      tests,
    };

    const page = path.join(this.outputDir, 'index.html');
    fs.writeFileSync(page, renderPage(data));
    console.log(`\nTest dashboard: ${repoRelative(page)} - "npm run report:custom" serves it, traces included.\n`);
  }

  private toReportTest(test: TestCase, attachments: AttachmentStore): ReportTest {
    const project = test.parent.project()?.name ?? '';
    const file = repoRelative(test.location.file);
    const feature = featureOf(file);
    const outcome = test.outcome();
    const idTag = test.tags.map((tag) => ID_TAG.exec(tag)).find((match) => match !== null);
    const failedAttempt =
      outcome === 'unexpected' || outcome === 'flaky'
        ? [...test.results]
            .reverse()
            .find((attempt) => ![test.expectedStatus, 'skipped', 'interrupted'].includes(attempt.status))
        : undefined;
    const shownAttempt = failedAttempt ?? test.results.at(-1);

    return {
      key: `${project} ${test.id}`,
      id: idTag ? Number(idTag[1]) : null,
      title: test.title,
      project,
      file,
      line: test.location.line,
      feature,
      tags: [...new Set(test.tags.filter((tag) => !ID_TAG.test(tag)))],
      status: STATUS_BY_OUTCOME[outcome],
      flaky: outcome === 'flaky',
      lastAttempt: test.results.at(-1)?.status ?? 'notRun',
      retries: Math.max(0, test.results.length - 1),
      durationMs: test.results.reduce((total, attempt) => total + attempt.duration, 0),
      issues: test.annotations.filter((annotation) => annotation.type === 'issue').map((annotation) => annotation.description ?? ''),
      skipReason:
        outcome === 'skipped'
          ? test.annotations.find((annotation) => annotation.type === 'skip' || annotation.type === 'fixme')?.description
          : undefined,
      output: shownAttempt ? outputOf(shownAttempt) : '',
      runCommand: `npx playwright test "${file}:${test.location.line}" --project="${project}"`,
      failure: failedAttempt && this.toFailure(test, failedAttempt, project, feature, attachments),
    };
  }

  private toFailure(
    test: TestCase,
    result: TestResult,
    project: string,
    feature: string,
    attachments: AttachmentStore,
  ): ReportFailure {
    const inRepo = (src: string) => repoRelative(path.join(this.outputDir, src));

    const screenshots: ReportImage[] = result.attachments
      .filter((attachment) => attachment.contentType.startsWith('image/'))
      .flatMap((attachment) => {
        const src = attachments.save(attachment);
        return src ? [{ name: attachment.name, src }] : [];
      });
    const traceAttachment = result.attachments.find((attachment) => attachment.name === 'trace');
    const trace = traceAttachment && attachments.save(traceAttachment);

    const savedAttachments = screenshots.map((screenshot) => ({ name: screenshot.name, path: inRepo(screenshot.src) }));
    if (trace) savedAttachments.push({ name: 'trace', path: inRepo(trace) });

    const error = result.errors[0] ?? result.error;
    return {
      message: stripAnsi(error?.message ?? error?.value ?? `The test ended as ${result.status}.`),
      markdown: failureMarkdown({ test, result, project, feature, savedAttachments }),
      screenshots,
      trace,
      showTraceCommand: trace && `npx playwright show-trace "${inRepo(trace)}"`,
    };
  }
}

/** stdout, then stderr under a `[stderr]` line, without ANSI colours - cut to `MAX_OUTPUT_LENGTH`. */
function outputOf(result: TestResult): string {
  const text = (chunks: readonly (string | Buffer)[]) => stripAnsi(chunks.map(String).join('')).trimEnd();
  const stdout = text(result.stdout);
  const stderr = text(result.stderr);
  const output = [stdout, stderr && `[stderr]\n${stderr}`].filter(Boolean).join('\n\n');
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n… ${output.length - MAX_OUTPUT_LENGTH} more characters - see the Playwright HTML report.`;
}

/** Copies attachments into the report's `data/` folder, named by the SHA-1 of their content. */
class AttachmentStore {
  hasTrace = false;

  constructor(private readonly reportDir: string) {}

  /** The copy's path relative to the report folder, or `undefined` when the attachment's file is gone. */
  save(attachment: Attachment): string | undefined {
    const content = attachment.body ?? readIfPresent(attachment.path);
    if (!content) return undefined;

    const extension = path.extname(attachment.path ?? '') || (EXTENSION_BY_CONTENT_TYPE[attachment.contentType] ?? '');
    const src = `data/${crypto.createHash('sha1').update(content).digest('hex')}${extension}`;
    fs.writeFileSync(path.join(this.reportDir, src), content);
    if (attachment.name === 'trace') this.hasTrace = true;
    return src;
  }
}

function readIfPresent(file: string | undefined): Buffer | undefined {
  if (!file || !fs.existsSync(file)) return undefined;
  return fs.readFileSync(file);
}

/** The trace viewer Playwright's HTML report ships: the actions, timeline and DOM snapshots UI mode shows. */
function copyTraceViewer(target: string): void {
  const source = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'vite', 'traceViewer');
  if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true });
}

/** `template/report.html` with its stylesheet, its script and the run's data inlined - one file that opens from disk too. */
function renderPage(data: ReportData): string {
  const template = (file: string) => fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
  // Every `<` escaped, so no test title or log line can close the <script> element the data sits in.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // Last placeholder first: inserted content then never lies ahead of a placeholder still to be replaced.
  return template('report.html')
    .replace('/* {{SCRIPT}} */', () => template('report.js'))
    .replace('{{DATA}}', () => json)
    .replace('/* {{STYLE}} */', () => template('report.css'))
    .replace('{{TITLE}}', () => data.title.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
}
