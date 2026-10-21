/*
 * The test dashboard's page script, inlined by customReporter.ts after the run's
 * data (ReportData in reportModel.ts). No framework and no fetch, so the page
 * works opened from disk as well as served. The view, the filters and the page
 * live in the URL hash: a filtered view can be bookmarked or sent.
 */
(function () {
  'use strict';

  const data = JSON.parse(document.getElementById('report-data').textContent);
  const tests = data.tests;
  const byKey = new Map(tests.map((test) => [test.key, test]));
  const indexOf = new Map(tests.map((test, index) => [test.key, index]));
  const groupOfTag = new Map(data.tagGroups.flatMap((group) => group.tags.map((tag) => [tag, group.name])));
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const STATUSES = [
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
    { value: 'skipped', label: 'Skipped' },
  ];
  const VIEWS = ['results', 'performance'];
  const PAGE_SIZES = [25, 50, 100, 200];
  const DEFAULT_PAGE_SIZE = 50;
  const SLOWEST_COUNT = 10;
  const RUN_LABELS = { passed: 'Run passed', failed: 'Run failed', timedout: 'Run timed out', interrupted: 'Run interrupted' };
  const THEMES = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const THEME_KEY = 'ew-test-dashboard-theme';

  const idOf = (test) => (test.id === null ? Number.MAX_SAFE_INTEGER : test.id);
  const rankOf = (test) => (test.status === 'failed' ? 0 : test.flaky ? 1 : test.status === 'skipped' ? 2 : 3);
  const byId = (a, b) => idOf(a) - idOf(b) || data.projects.indexOf(a.project) - data.projects.indexOf(b.project);
  const SORTS = {
    id: { label: 'By ID', compare: byId },
    status: { label: 'Failed first', compare: (a, b) => rankOf(a) - rankOf(b) || byId(a, b) },
    duration: { label: 'Slowest first', compare: (a, b) => b.durationMs - a.durationMs || byId(a, b) },
    file: { label: 'By file path', compare: (a, b) => a.file.localeCompare(b.file) || a.line - b.line || byId(a, b) },
  };

  const icon = (paths) =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    passed: icon('<path d="M4 8.5l2.5 2.5L12 5.5"/>'),
    failed: icon('<path d="M5 5l6 6M11 5l-6 6"/>'),
    skipped: icon('<path d="M5 8h6"/>'),
    flaky: icon('<path d="M8 4.5v4M8 11.5v.01"/>'),
    total: icon('<path d="M2.5 4h11M2.5 8h11M2.5 12h7"/>'),
    clock: icon('<circle cx="8" cy="8" r="6.25"/><path d="M8 4.75V8l2.25 1.5"/>'),
    folder: icon('<path d="M1.75 4.25C1.75 3.56 2.31 3 3 3h3l1.5 1.75H13c.69 0 1.25.56 1.25 1.25v5.75c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z"/>'),
    file: icon('<path d="M9 1.75H4.25c-.69 0-1.25.56-1.25 1.25v10c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V5.75z"/><path d="M9 1.75v4h4"/>'),
    logs: icon('<path d="M3.5 2.5h9v11h-9z"/><path d="M5.75 5.5h4.5M5.75 8h4.5M5.75 10.5h2.5"/>'),
    image: icon('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.25"/><path d="M14.5 10.5l-3.5-3.5-7.5 6.5"/>'),
    trace: icon('<path d="M1.5 8h3l2-5 3 10 2-5h3"/>'),
    markdown: icon('<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 10V6l1.75 2L7.5 6v4M10.75 6v4M9.25 8.5l1.5 1.5 1.5-1.5"/>'),
    run: icon('<path d="M5 3.25v9.5L12.25 8z"/>'),
    chevronLeft: icon('<path d="M10 3.5L5.5 8l4.5 4.5"/>'),
    chevronRight: icon('<path d="M6 3.5L10.5 8 6 12.5"/>'),
    chevronDown: icon('<path d="M3.5 6L8 10.5 12.5 6"/>'),
    link: icon('<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/>'),
    auto: icon('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>'),
    light: icon('<circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"/>'),
    dark: icon('<path d="M13.5 9.75A5.75 5.75 0 0 1 6.25 2.5a5.75 5.75 0 1 0 7.25 7.25z"/>'),
  };

  // ---- Formatting ----

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const linkify = (text) => esc(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  const displayTitle = (test) => test.title.replace(/^\[ID:\s*\d+\]\s*/, '');
  const kindOf = (test) => (test.flaky ? 'flaky' : test.status);
  const dot = (kind) => `<span class="dot dot--${kind}">${ICONS[kind]}</span>`;
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  const sum = (list) => list.reduce((total, test) => total + test.durationMs, 0);

  function percent(count, total) {
    if (!total || !count) return '0%';
    const value = (count / total) * 100;
    if (value < 0.1) return '<0.1%';
    if (count < total && value > 99.9) return '>99.9%';
    return `${value.toFixed(1).replace(/\.0$/, '')}%`;
  }

  /** `850ms`, `6.21s`, `4m 05s`, `1h 02m`. */
  function formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const seconds = Math.round(ms / 1000);
    const pad = (value) => String(value).padStart(2, '0');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${pad(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m`;
  }

  function statusLabel(test) {
    if (test.status === 'failed') return test.lastAttempt === 'timedOut' ? 'Timed out' : 'Failed';
    if (test.status === 'skipped') return test.lastAttempt === 'notRun' ? 'Did not run' : 'Skipped';
    return test.flaky ? 'Flaky' : 'Passed';
  }

  function countOf(list) {
    const counts = { total: list.length, passed: 0, failed: 0, skipped: 0, flaky: 0 };
    for (const test of list) {
      counts[test.status] += 1;
      if (test.flaky) counts.flaky += 1;
    }
    return counts;
  }

  // ---- Theme - follows the system until the viewer picks one ----

  function readTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      return Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : 'auto';
    } catch {
      return 'auto';
    }
  }

  function applyTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const button = $('#theme-toggle');
    button.innerHTML = `${ICONS[theme]}${THEMES[theme]}`;
    button.dataset.theme = theme;
    button.title = 'Theme: auto follows the system - select to switch';
    button.setAttribute('aria-label', `Theme: ${THEMES[theme]}. Switch theme`);
  }

  function nextTheme() {
    const names = Object.keys(THEMES);
    const theme = names[(names.indexOf($('#theme-toggle').dataset.theme) + 1) % names.length];
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage blocked (a private window, a file:// page in some browsers) - the theme lasts until the page closes.
    }
  }

  // ---- State, kept in the URL hash ----

  const state = {
    view: 'results',
    query: '',
    status: '',
    tags: new Set(),
    feature: '',
    project: '',
    sort: 'id',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };
  /** Keys of the tests whose logs are open - they stay open across filters and pages. */
  const openLogs = new Set();

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const list = (name) => (params.get(name) || '').split(',').filter(Boolean);
    const status = list('status')[0];
    const pageSize = Number(params.get('size'));
    const page = Number(params.get('page'));
    state.view = VIEWS.includes(params.get('view')) ? params.get('view') : 'results';
    state.query = params.get('q') || '';
    state.status = STATUSES.some((option) => option.value === status) ? status : '';
    state.tags = new Set(list('tags').filter((tag) => groupOfTag.has(tag)));
    state.feature = data.features.includes(params.get('feature')) ? params.get('feature') : '';
    state.project = data.projects.includes(params.get('project')) ? params.get('project') : '';
    state.sort = Object.prototype.hasOwnProperty.call(SORTS, params.get('sort')) ? params.get('sort') : 'id';
    state.pageSize = PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
    state.page = Number.isInteger(page) && page > 0 ? page : 1;
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (state.view !== 'results') params.set('view', state.view);
    if (state.query) params.set('q', state.query);
    if (state.status) params.set('status', state.status);
    if (state.tags.size) params.set('tags', [...state.tags].join(','));
    if (state.feature) params.set('feature', state.feature);
    if (state.project) params.set('project', state.project);
    if (state.sort !== 'id') params.set('sort', state.sort);
    if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('size', String(state.pageSize));
    if (state.page > 1) params.set('page', String(state.page));
    const hash = params.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }

  const hasFilters = () => Boolean(state.query || state.status || state.tags.size || state.feature || state.project);

  // ---- Filtering ----

  /** What a free-text query is looked for in, besides the spec path. */
  const searchText = new Map(
    tests.map((test) => [
      test.key,
      [test.title, test.feature, test.project, ...test.tags, ...test.issues, test.skipReason || '', test.failure ? test.failure.message : '']
        .join('\n')
        .toLowerCase(),
    ]),
  );

  /**
   * A query of numbers only (`62`, `@62`, `ID: 62`, `62, 63`) finds those IDs exactly.
   * Anything else is looked for in the spec path - which holds the file name - and
   * in the title, feature, project, tags, product issues and error. A pasted
   * absolute path matches too, and one ending in `:line` finds the test declared on
   * that line.
   */
  function parseQuery(raw) {
    const text = raw.trim().toLowerCase().replace(/\\/g, '/');
    if (!text) return null;
    const tokens = text.replace(/[[\]]/g, ' ').replace(/\bid\s*:?/g, ' ').split(/[\s,;]+/).filter(Boolean);
    const ids = tokens.map((token) => /^[@#]?(\d+)$/.exec(token));
    if (ids.length && ids.every(Boolean)) return { ids: new Set(ids.map((match) => Number(match[1]))) };
    const location = /^(.+?):(\d+)(?::\d+)?$/.exec(text);
    return { text, path: location ? location[1] : text, line: location ? Number(location[2]) : null };
  }

  function currentFilter() {
    const tagsByGroup = new Map();
    for (const tag of state.tags) {
      const group = groupOfTag.get(tag);
      tagsByGroup.set(group, [...(tagsByGroup.get(group) || []), tag]);
    }
    return { query: parseQuery(state.query), tagsByGroup };
  }

  function matchesQuery(test, query) {
    if (!query) return true;
    if (query.ids) return query.ids.has(test.id);
    const file = test.file.toLowerCase();
    const inFile = file.includes(query.path) || query.path.endsWith(file);
    if (query.line !== null) return inFile && test.line === query.line;
    return inFile || searchText.get(test.key).includes(query.text);
  }

  /** Tags of one group are alternatives, the groups narrow each other down. `ignore` leaves out one filter - for its own counts. */
  function matches(test, filter, ignore = {}) {
    if (!ignore.status && state.status && test.status !== state.status) return false;
    for (const [group, wanted] of filter.tagsByGroup) {
      if (group !== ignore.group && !wanted.some((tag) => test.tags.includes(tag))) return false;
    }
    if (state.feature && test.feature !== state.feature) return false;
    if (state.project && test.project !== state.project) return false;
    return matchesQuery(test, filter.query);
  }

  // ---- Header and summary ----

  function renderHeader() {
    document.title = data.title;
    $('#report-title').textContent = data.title;
    $('#env-code').textContent = data.environment;
    const kind = data.runStatus === 'passed' ? 'passed' : 'failed';
    $('#run-badge').innerHTML = `${dot(kind)}${esc(RUN_LABELS[data.runStatus] || data.runStatus)}`;
    const fields = [
      ['Started', new Date(data.startedAt).toLocaleString()],
      ['Target', data.baseUrl, 'mono'],
      ['Scope', `${plural(tests.length, 'test')} · ${plural(data.projects.length, 'project')} · ${plural(data.features.length, 'feature')}`],
      ['Playwright', data.playwrightVersion, 'mono'],
    ].filter(([, value]) => value);
    $('#run-fields').innerHTML = fields
      .map(([name, value, style]) => `<div class="field"><dt>${name}</dt><dd${style ? ` class="${style}"` : ''}>${esc(value)}</dd></div>`)
      .join('');
  }

  function renderSummary() {
    const counts = countOf(tests);
    const kpi = ({ mark, label, value, note, action, title }) => `
      <button type="button" class="kpi" ${action} title="${esc(title)}" aria-pressed="false">
        <span class="kpi-label">${mark}${label}</span>
        <span class="kpi-value">${value}</span>
        <span class="kpi-note">${note}</span>
      </button>`;
    const statusKpi = (status, label, note) =>
      kpi({
        mark: dot(status),
        label,
        value: counts[status],
        note,
        action: `data-status="${status}"`,
        title: `List the ${status} tests`,
      });
    const share = (status) => `${percent(counts[status], counts.total)} of the run`;
    $('#kpis').innerHTML = [
      kpi({
        mark: `<span class="kpi-icon">${ICONS.total}</span>`,
        label: 'Tests',
        value: counts.total,
        note: plural(data.projects.length, 'project'),
        action: 'data-status=""',
        title: 'List every test',
      }),
      statusKpi('passed', 'Passed', counts.flaky ? `${share('passed')} · ${counts.flaky} flaky` : share('passed')),
      statusKpi('failed', 'Failed', share('failed')),
      statusKpi('skipped', 'Skipped', share('skipped')),
      kpi({
        mark: `<span class="kpi-icon">${ICONS.clock}</span>`,
        label: 'Duration',
        value: formatDuration(data.durationMs),
        note: 'Where the time went →',
        action: 'data-view="performance"',
        title: 'Show the time per feature, test and project',
      }),
    ].join('');
    $('#summary-bar').innerHTML = stackBar(counts, 'All tests');
  }

  // ---- Controls ----

  function buildControls() {
    $('#status-pills').innerHTML = [{ value: '', label: 'All' }, ...STATUSES]
      .map(
        (status) =>
          `<button type="button" class="switch" data-status="${status.value}" aria-pressed="false">${
            status.value ? `<span class="swatch swatch--${status.value}"></span>` : ''
          }${status.label}<span class="switch-count"></span></button>`,
      )
      .join('');
    $('#tag-filters').innerHTML = data.tagGroups
      .map(
        (group, index) => `
        <div class="tag-group" role="group" aria-labelledby="tag-group-${index}">
          <span class="select-label" id="tag-group-${index}">${esc(group.name)}</span>
          ${group.tags.map((tag) => `<button type="button" class="chip" data-tag="${esc(tag)}" data-group="${esc(group.name)}" aria-pressed="false">${esc(tag)}<span class="chip-count"></span></button>`).join('')}
        </div>`,
      )
      .join('');

    const fill = (select, options) => {
      select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
    };
    fill($('#feature-filter'), [['', 'All features'], ...data.features.map((feature) => [feature, feature])]);
    fill($('#project-filter'), [['', 'All projects'], ...data.projects.map((project) => [project, project])]);
    fill($('#sort'), Object.entries(SORTS).map(([value, sort]) => [value, sort.label]));
    fill($('#page-size'), PAGE_SIZES.map((size) => [size, String(size)]));
    for (const button of $$('[data-page="prev"]')) {
      button.innerHTML = ICONS.chevronLeft;
      button.setAttribute('aria-label', 'Previous page');
    }
    for (const button of $$('[data-page="next"]')) {
      button.innerHTML = ICONS.chevronRight;
      button.setAttribute('aria-label', 'Next page');
    }
    $('#feature-legend').innerHTML = STATUSES.map((status) => `<li><span class="swatch swatch--${status.value}"></span>${status.label}</li>`).join('');
  }

  function update() {
    const filter = currentFilter();
    const visible = tests.filter((test) => matches(test, filter)).sort(SORTS[state.sort].compare);

    if ($('#search').value !== state.query) $('#search').value = state.query;
    $('#feature-filter').value = state.feature;
    $('#project-filter').value = state.project;
    $('#sort').value = state.sort;
    $('#page-size').value = String(state.pageSize);
    $('#clear-filters').hidden = !hasFilters();
    $('#result-count').textContent =
      visible.length === tests.length ? plural(tests.length, 'test') : `${visible.length} of ${plural(tests.length, 'test')}`;

    for (const button of $$('#status-pills [data-status]')) {
      const status = button.dataset.status;
      button.setAttribute('aria-pressed', String(state.status === status));
      button.querySelector('.switch-count').textContent = tests.filter(
        (test) => (!status || test.status === status) && matches(test, filter, { status: true }),
      ).length;
    }
    for (const kpi of $$('#kpis [data-status]')) {
      kpi.setAttribute('aria-pressed', String(Boolean(kpi.dataset.status) && kpi.dataset.status === state.status));
    }
    for (const chip of $$('#tag-filters [data-tag]')) {
      const tag = chip.dataset.tag;
      chip.setAttribute('aria-pressed', String(state.tags.has(tag)));
      chip.querySelector('.chip-count').textContent = tests.filter(
        (test) => test.tags.includes(tag) && matches(test, filter, { group: chip.dataset.group }),
      ).length;
    }

    for (const tab of $$('[role="tab"]')) {
      const selected = tab.dataset.view === state.view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    $('#tests').dataset.view = state.view;
    $('#view-results').hidden = state.view !== 'results';
    $('#view-performance').hidden = state.view !== 'performance';

    if (state.view === 'results') renderResults(visible);
    else renderPerformance(visible);
    writeHash();
  }

  // ---- Results ----

  function renderResults(visible) {
    const pages = Math.max(1, Math.ceil(visible.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const shown = visible.slice(start, start + state.pageSize);

    $('#test-list').innerHTML = shown.map(testRow).join('');
    $('#empty').hidden = visible.length > 0;

    const range = shown.length ? `${start + 1}–${start + shown.length}` : '0';
    for (const pager of $$('.pager')) {
      pager.querySelector('.pager-showing').innerHTML = `Tests <strong>${range}</strong> of <strong>${visible.length}</strong>`;
      pager.querySelector('.page-info').innerHTML = `<strong>${state.page}</strong> / ${pages}`;
      pager.querySelector('[data-page="prev"]').disabled = state.page <= 1;
      pager.querySelector('[data-page="next"]').disabled = state.page >= pages;
    }
    $('#pager-top').hidden = visible.length === 0;
    $('#pager-bottom').hidden = shown.length < 10;
  }

  function testRow(test) {
    const kind = kindOf(test);
    const { failure } = test;
    const firstErrorLine = failure ? failure.message.split('\n').find((line) => line.trim()) || '' : '';
    const issues = test.issues.length
      ? `<ul class="test-issues">${test.issues.map((issue) => `<li>${ICONS.link}<span>${linkify(issue)}</span></li>`).join('')}</ul>`
      : '';
    const retries = test.retries ? `<span class="test-retries">${test.retries} ${test.retries === 1 ? 'retry' : 'retries'}</span>` : '';
    const open = openLogs.has(test.key);
    const index = indexOf.get(test.key);

    return `<li class="test test--${kind}">
      <span class="test-mark">${dot(kind)}</span>
      <div class="test-body">
        <p class="test-title">${esc(displayTitle(test))}</p>
        <p class="test-meta">
          <span class="meta-id">${test.id === null ? 'setup' : `ID ${test.id}`}</span>
          <span class="meta-item">${ICONS.folder}${esc(test.feature)}</span>
          <span class="meta-item meta-file">${ICONS.file}${esc(test.file)}:${test.line}</span>
        </p>
        <div class="test-tags">
          <span class="tag tag--project" title="Project">${esc(test.project)}</span>
          ${test.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
        </div>
        ${firstErrorLine ? `<p class="test-error" title="${esc(firstErrorLine)}">${esc(firstErrorLine)}</p>` : ''}
        ${test.skipReason ? `<p class="test-note">${esc(test.skipReason)}</p>` : ''}
        ${issues}
      </div>
      <div class="test-aside">
        <span class="test-outcome">${statusLabel(test)}</span>
        <span class="test-duration">${formatDuration(test.durationMs)}</span>
        ${retries}
      </div>
      <div class="actions" role="group" aria-label="Test actions">${actionButtons(test, open, index)}</div>
      <div class="logs-panel" id="logs-${index}"${open ? '' : ' hidden'}>${open ? logsPanel(logSections(test)) : ''}</div>
    </li>`;
  }

  /** The error and the output of the attempt the report shows - the failed one, else the last. */
  function logSections(test) {
    const sections = [];
    if (test.failure) sections.push({ label: test.flaky ? 'Error of the failed attempt' : 'Error', text: test.failure.message, kind: 'error' });
    if (test.output) sections.push({ label: 'Output', text: test.output, kind: 'output' });
    return sections;
  }

  const logsPanel = (sections) =>
    sections
      .map((section) => `<div class="log log--${section.kind}"><p class="log-label">${esc(section.label)}</p><pre>${esc(section.text)}</pre></div>`)
      .join('');

  function actionButtons(test, open, index) {
    const { failure } = test;
    const shots = failure ? failure.screenshots.length : 0;
    const hasLogs = logSections(test).length > 0;
    const button = (action, iconName, label, title, available = true, extra = '') =>
      `<button type="button" class="action" data-action="${action}" data-key="${esc(test.key)}" title="${esc(title)}"${
        available ? '' : ' aria-disabled="true"'
      }${extra}>${ICONS[iconName]}<span>${label}</span></button>`;
    return [
      button(
        'logs',
        'logs',
        `Logs${hasLogs ? ICONS.chevronDown : ''}`,
        hasLogs ? 'Show the error and the output' : 'No logs: the test printed nothing and has no error',
        hasLogs,
        hasLogs ? ` aria-expanded="${open}" aria-controls="logs-${index}"` : '',
      ),
      button(
        'screenshot',
        'image',
        shots > 1 ? `Screenshots (${shots})` : 'Screenshot',
        shots ? 'Show the screenshot taken when the test failed' : 'No screenshot: Playwright keeps one only for a failed test that drives a page',
        shots > 0,
      ),
      button(
        'trace',
        'trace',
        'Trace',
        failure && failure.trace ? 'Open the trace in the trace viewer' : 'No trace: Playwright keeps one only for a failed attempt',
        Boolean(failure && failure.trace),
      ),
      button('markdown', 'markdown', 'Markdown', 'Copy the test as Markdown - for a bug report or a chat'),
      button('run', 'run', 'Run', 'Copy the command that runs this test'),
    ].join('');
  }

  // ---- Performance ----

  function stackBar(counts, name) {
    const summary = STATUSES.map((status) => `${status.label} ${counts[status.value]} (${percent(counts[status.value], counts.total)})`);
    const segments = STATUSES.filter((status) => counts[status.value] > 0).map((status) => {
      const tip = `${name} · ${status.label}: ${counts[status.value]} of ${counts.total} (${percent(counts[status.value], counts.total)})`;
      return `<span class="bar-segment bar-segment--${status.value}" style="flex-grow:${counts[status.value]}" data-tip="${esc(tip)}"></span>`;
    });
    return `<div class="bar" role="img" aria-label="${esc(`${name}: ${summary.join(', ')}`)}">${segments.join('')}</div>`;
  }

  function renderPerformance(visible) {
    $('#perf-empty').hidden = visible.length > 0;
    for (const block of $$('#view-performance .perf-block, #view-performance .perf-grid')) block.hidden = visible.length === 0;
    if (!visible.length) return;

    const cells = (list) => {
      const counts = countOf(list);
      const time = sum(list);
      return (
        `<td class="num">${counts.total}</td>` +
        STATUSES.map((status) => `<td class="num">${counts[status.value]}<span class="pct">${percent(counts[status.value], counts.total)}</span></td>`).join('') +
        `<td class="bar-col">${stackBar(counts, list === visible ? 'All features' : list[0].feature)}</td>` +
        `<td class="num">${formatDuration(time)}</td><td class="num">${formatDuration(time / counts.total)}</td>`
      );
    };
    $('#feature-rows').innerHTML = data.features
      .map((feature) => {
        const list = visible.filter((test) => test.feature === feature);
        if (!list.length) return '';
        const active = feature === state.feature;
        return `<tr${active ? ' class="is-active"' : ''}>
          <th scope="row"><button type="button" class="feature-button" data-feature="${esc(feature)}" aria-pressed="${active}">${esc(feature)}</button></th>
          ${cells(list)}
        </tr>`;
      })
      .join('');
    $('#feature-total').innerHTML = `<tr><th scope="row">All features</th>${cells(visible)}</tr>`;

    const slowest = [...visible].sort(SORTS.duration.compare).slice(0, SLOWEST_COUNT);
    $('#slowest').innerHTML = hbars(
      slowest.map((test) => ({
        label: displayTitle(test),
        sub: `${test.project} · ${test.file}:${test.line}`,
        value: test.durationMs,
        attributes: `data-test="${esc(test.key)}"`,
      })),
    );

    const projects = data.projects
      .map((project) => visible.filter((test) => test.project === project))
      .filter((list) => list.length)
      .map((list) => ({
        label: list[0].project,
        sub: plural(list.length, 'test'),
        value: sum(list),
        attributes: `data-project="${esc(list[0].project)}"`,
      }));
    $('#project-times').innerHTML = hbars(projects);
  }

  /** One series, so one colour; the value rides the bar's tip. */
  function hbars(rows) {
    const max = Math.max(1, ...rows.map((row) => row.value));
    return rows
      .map(
        (row) => `<li>
          <button type="button" class="hbar-row" ${row.attributes}>
            <span class="hbar-label" title="${esc(`${row.label}\n${row.sub}`)}"><span class="hbar-title">${esc(row.label)}</span><span class="hbar-sub">${esc(row.sub)}</span></span>
            <span class="hbar-track">
              <span class="hbar" style="width:calc((100% - 72px) * ${(row.value / max).toFixed(4)})" data-tip="${esc(`${row.label}: ${formatDuration(row.value)}`)}"></span>
              <span class="hbar-value">${formatDuration(row.value)}</span>
            </span>
          </button>
        </li>`,
      )
      .join('');
  }

  // ---- Actions ----

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // No clipboard API outside a secure context - fall back to the selection.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'visually-hidden';
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  }

  let toastTimer;
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('is-visible'), 6000);
  }

  /** A fenced block whose fence is longer than any run of backticks inside it. */
  function codeBlock(text, language = 'text') {
    const longestRun = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
    const fence = '`'.repeat(Math.max(3, longestRun + 1));
    return `${fence}${language}\n${text}\n${fence}`;
  }

  /** A failed test's Markdown comes from the reporter, with its step log and page snapshot; any other test's is put together here. */
  function testMarkdown(test) {
    if (test.failure) return test.failure.markdown;
    const cell = (text) => text.replace(/\|/g, '\\|');
    const rows = [
      ['Status', statusLabel(test)],
      ['Project', test.project],
      ['Feature', test.feature],
      ['File', `\`${test.file}:${test.line}\``],
      ['Tags', test.tags.map((tag) => `\`${tag}\``).join(' ') || '-'],
      ['Duration', formatDuration(test.durationMs)],
      ['Retries', String(test.retries)],
    ];
    const sections = [
      `# ${test.title.replace(/\s+/g, ' ').trim()}`,
      ['| Field | Value |', '| --- | --- |', ...rows.map(([field, value]) => `| ${field} | ${cell(value)} |`)].join('\n'),
    ];
    if (test.skipReason) sections.push('## Skip reason', test.skipReason);
    if (test.issues.length) sections.push('## Product issues', test.issues.map((issue) => `- ${issue}`).join('\n'));
    if (test.output) sections.push('## Output', codeBlock(test.output));
    sections.push('## Run it', codeBlock(test.runCommand, 'shell'));
    return `${sections.join('\n\n')}\n`;
  }

  const ACTIONS = {
    logs(test, button) {
      if (!logSections(test).length) {
        toast('No logs: the test printed nothing and has no error.');
        return;
      }
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      const open = !openLogs.has(test.key);
      if (open) openLogs.add(test.key);
      else openLogs.delete(test.key);
      button.setAttribute('aria-expanded', String(open));
      panel.innerHTML = open ? logsPanel(logSections(test)) : '';
      panel.hidden = !open;
    },

    screenshot(test) {
      if (!test.failure || !test.failure.screenshots.length) {
        toast('No screenshot: Playwright keeps one only when a test that drives a page fails (screenshot: only-on-failure).');
        return;
      }
      openScreenshots(test);
    },

    async trace(test) {
      if (!test.failure || !test.failure.trace) {
        toast('No trace: playwright.config.ts keeps the trace of failed attempts only (trace: retain-on-failure).');
        return;
      }
      const { trace, showTraceCommand } = test.failure;
      if (location.protocol === 'file:') {
        const copied = await copyText(showTraceCommand);
        toast(
          'The trace viewer cannot start in a report opened from disk - serve it with "npm run report:custom".' +
            (copied ? `\nCopied instead: ${showTraceCommand}` : ''),
        );
        return;
      }
      window.open(`trace/index.html?trace=${encodeURIComponent(new URL(trace, location.href).href)}`, '_blank', 'noopener');
    },

    async markdown(test) {
      const copied = await copyText(testMarkdown(test));
      toast(copied ? 'Copied the test as Markdown.' : 'The browser refused access to the clipboard.');
    },

    async run(test) {
      const copied = await copyText(test.runCommand);
      toast(
        copied
          ? `Copied - run it in the Automation-TypeScript folder:\n${test.runCommand}\nAdd --ui to open it in UI mode, --debug to step through it.`
          : test.runCommand,
      );
    },
  };

  function openScreenshots(test) {
    const shots = test.failure.screenshots;
    $('#shot-title').textContent = displayTitle(test);
    $('#shot-subtitle').textContent = `${test.id === null ? '' : `ID ${test.id} · `}${test.project} · ${test.file}:${test.line}`;
    const tabs = $('#shot-tabs');
    tabs.hidden = shots.length < 2;
    tabs.innerHTML = shots
      .map((shot, index) => `<button type="button" class="chip" data-shot="${index}" aria-pressed="false">${esc(shot.name)}</button>`)
      .join('');
    tabs.onclick = (event) => {
      const tab = event.target.closest('[data-shot]');
      if (tab) showScreenshot(shots, Number(tab.dataset.shot));
    };
    showScreenshot(shots, 0);
    $('#shot-dialog').showModal();
  }

  function showScreenshot(shots, index) {
    const shot = shots[index];
    $('#shot-image').src = shot.src;
    $('#shot-image').alt = `${shot.name} of the failed test`;
    $('#shot-open').href = shot.src;
    for (const tab of $$('#shot-tabs [data-shot]')) {
      tab.setAttribute('aria-pressed', String(Number(tab.dataset.shot) === index));
    }
  }

  // ---- Events ----

  function bindEvents() {
    const showTests = () => $('#tests').scrollIntoView({ behavior: 'smooth', block: 'start' });
    /** Every change of a filter starts again from the first page. */
    const refilter = (change) => {
      change();
      state.page = 1;
      update();
    };
    const listTests = (change) => {
      refilter(() => {
        change();
        state.view = 'results';
      });
      showTests();
    };

    $('#theme-toggle').addEventListener('click', nextTheme);
    $('#search').addEventListener('input', (event) => refilter(() => (state.query = event.target.value)));
    $('#feature-filter').addEventListener('change', (event) => refilter(() => (state.feature = event.target.value)));
    $('#project-filter').addEventListener('change', (event) => refilter(() => (state.project = event.target.value)));
    $('#sort').addEventListener('change', (event) => refilter(() => (state.sort = event.target.value)));
    $('#page-size').addEventListener('change', (event) => refilter(() => (state.pageSize = Number(event.target.value))));
    $('#clear-filters').addEventListener('click', () =>
      refilter(() => Object.assign(state, { query: '', status: '', tags: new Set(), feature: '', project: '' })),
    );
    $('#status-pills').addEventListener('click', (event) => {
      const button = event.target.closest('[data-status]');
      if (button) refilter(() => (state.status = button.dataset.status));
    });
    $('#tag-filters').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-tag]');
      if (!chip) return;
      const tag = chip.dataset.tag;
      refilter(() => (state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag)));
    });

    $('#kpis').addEventListener('click', (event) => {
      const kpi = event.target.closest('.kpi');
      if (!kpi) return;
      if (kpi.dataset.view) {
        state.view = kpi.dataset.view;
        update();
        showTests();
      } else {
        listTests(() => (state.status = kpi.dataset.status));
      }
    });

    const tabs = [...$$('[role="tab"]')];
    const selectView = (view) => {
      state.view = view;
      update();
    };
    $('.tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-view]');
      if (tab) selectView(tab.dataset.view);
    });
    $('.tabs').addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const next = tabs[(tabs.findIndex((tab) => tab.dataset.view === state.view) + 1) % tabs.length];
      selectView(next.dataset.view);
      next.focus();
    });

    for (const pager of $$('.pager')) {
      pager.addEventListener('click', (event) => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        state.page += button.dataset.page === 'next' ? 1 : -1;
        update();
        if (pager.id === 'pager-bottom') showTests();
      });
    }

    $('#test-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      const test = button && byKey.get(button.dataset.key);
      if (test) ACTIONS[button.dataset.action](test, button);
    });

    $('#view-performance').addEventListener('click', (event) => {
      const feature = event.target.closest('[data-feature]');
      const project = event.target.closest('[data-project]');
      const row = event.target.closest('[data-test]');
      if (feature) {
        listTests(() => (state.feature = feature.dataset.feature));
      } else if (project) {
        listTests(() => (state.project = project.dataset.project));
      } else if (row) {
        const test = byKey.get(row.dataset.test);
        listTests(() => Object.assign(state, { query: `${test.file}:${test.line}`, project: test.project }));
      }
    });

    const dialog = $('#shot-dialog');
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });

    const tooltip = $('#tooltip');
    document.addEventListener('mouseover', (event) => {
      const target = event.target.closest && event.target.closest('[data-tip]');
      tooltip.hidden = !target;
      if (target) tooltip.textContent = target.dataset.tip;
    });
    document.addEventListener('mousemove', (event) => {
      if (tooltip.hidden) return;
      const left = Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${event.clientY + 16}px`;
    });

    window.addEventListener('hashchange', () => {
      readHash();
      update();
    });
  }

  applyTheme(readTheme());
  readHash();
  renderHeader();
  renderSummary();
  buildControls();
  bindEvents();
  update();
})();
