/* =============================================================================
   TESTS & DPPs (2026-11-24) — replaces "Create Test & Paper"
   Views (shown as sub-tabs under the header):
     create : pick units (several), topics of those units, sources, then
              Board mode  -> how many questions of 1/2/3/4/5 marks
              Competitive -> how many Easy / Medium / Hard (+4 / -1), or a full-length mock
              Build -> draft you can check, swap, remove, mark-scheme view, print
              Publish -> as a Test or a DPP, whole class or chosen students, and when
     paper  : full board paper by the CBSE / HP Board pattern (same draft tools + publish)
     live   : everything published: live now / scheduled / closed / taken back, with
              take back, publish again, extend time, choose students, who attempted, report
   The report (also used by Class Progress) lists every question with right / wrong /
   skipped and which option students chose, and every student; both tables sort.
   Server: /api/tests-dpps (services/testsDppsService.js).
   ========================================================================== */
(function (global) {
  'use strict';

  var S = { view: 'create', chapters: null, chapterKey: null, picked: [], topics: [], draft: null, showKey: false, paper: null, liveFilter: 'ALL', report: null };
  var BOARD_TYPES = [['MCQ', 'Multiple choice'], ['AR', 'Assertion–Reason'], ['SHORT', 'Short answer'], ['NUMERICAL', 'Numerical'], ['CASE', 'Case-based'], ['LONG', 'Long answer / Derivation']];
  var COMP_TYPES = [['MCQ', 'Single-correct MCQ'], ['MULTI', 'Multi-correct MCQ'], ['NUMERICAL', 'Numerical (integer / decimal)']];
  var MARK_ROWS = [['1', '1 mark', 'MCQ, Assertion–Reason'], ['2', '2 marks', 'Very short / short'], ['3', '3 marks', 'Short / numerical'], ['4', '4 marks', 'Case-based'], ['5', '5 marks', 'Long / derivation']];
  // Board paper patterns (teachers can still change every count before building).
  var PAPERS = {
    CBSE: { label: 'CBSE pattern', total: 70, minutes: 180, sections: [['A', 1, 16, 'Multiple choice and Assertion–Reason'], ['B', 2, 5, 'Short answer'], ['C', 3, 7, 'Short answer'], ['D', 4, 2, 'Case-based'], ['E', 5, 3, 'Long answer']] },
    HP_BOARD: { label: 'HP Board pattern', total: 70, minutes: 180, sections: [['A', 1, 16, 'Objective'], ['B', 2, 7, 'Very short / short'], ['C', 3, 7, 'Short answer'], ['D', 5, 3, 'Long answer']] }
  };

  // ------------------------------------------------------------ helpers --
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tex(v) { return typeof global.renderLatexString === 'function' ? global.renderLatexString(String(v || '')) : esc(v); }
  function ico(n, s) { return '<i data-lucide="' + n + '" aria-hidden="true" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px;"></i>'; }
  function icons() { if (typeof global.initLucideIcons === 'function') global.initLucideIcons(); }
  function toast(m, t) { if (typeof global.showToast === 'function') global.showToast(m, t || 'info'); }
  function base() { return typeof global.getApiBaseUrl === 'function' ? global.getApiBaseUrl() : ''; }
  function api(path, opts) {
    return fetch(base() + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok || b.success === false) throw new Error(b.error || 'Request failed (' + r.status + ')'); return b; });
    });
  }
  function tb() { try { return teacherBuilderState; } catch (e) { return {}; } } // eslint-disable-line no-undef
  function teacher() {
    var t = tb().activeTeacher || {};
    return { id: t.id || 'fac_phy_01', name: t.name || t.full_name || 'Teacher', subjectKey: String(t.subjectKey || tb().teacherSubjectKey || 'PHYSICS').toUpperCase(), subjectName: t.subjectName || t.subject || 'Physics' };
  }
  function section() { return String(tb().selectedClassId || '12-NonMed'); }
  function grade() { var s = section(); return (s.match(/^\d+/) || ['12'])[0]; }
  function ctx() { try { return (global.HapsDualMode && global.HapsDualMode.getContext()) || {}; } catch (e) { return {}; } }
  function comp() { return String(ctx().mode || '').toUpperCase() === 'COMPETITIVE'; }
  function boardKey() { var b = String(ctx().board || 'CBSE').toUpperCase(); return /^HP/.test(b) ? 'HP_BOARD' : b; }
  function stream() { var s = String(ctx().stream || '').toUpperCase(); return s.indexOf('NEET') !== -1 ? 'NEET' : 'JEE'; }
  function classLabel() { try { var c = (global.scopedPaperClassList ? global.scopedPaperClassList() : []).find(function (x) { return x.id === section(); }); return c && global.paperClassLabel ? global.paperClassLabel(c) : section(); } catch (e) { return section(); } }
  function modeLabel() { return comp() ? (stream() === 'NEET' ? 'NEET' : 'JEE') + ' • +4 / −1 marking' : (boardKey() === 'HP_BOARD' ? 'HP Board' : boardKey()) + ' • marks-wise'; }
  function fmtWhen(iso) { try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } }
  function modal(title, inner, actions, wide) {
    var ov = document.createElement('div');
    ov.className = 'qb2-modal';
    ov.innerHTML = '<div class="qb2-dialog glass-card' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="qb2-dhead"><h3>' + esc(title) + '</h3><button type="button" class="qb2-x" data-x aria-label="Close">' + ico('x', 18) + '</button></div><div class="qb2-dbody">' + inner + '</div><div class="qb2-dfoot">' + (actions || '') + '</div></div>';
    document.body.appendChild(ov);
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onEsc); };
    var onEsc = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    ov.querySelector('[data-x]').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    icons();
    return { el: ov, close: close, $: function (s) { return ov.querySelector(s); }, $$: function (s) { return ov.querySelectorAll(s); } };
  }

  // -------------------------------------------------------------- shell --
  function host() {
    var tab = $('tabTeacherCreateTestAndPaper');
    if (!tab) return null;
    var h = $('tdApp');
    if (!h) { h = document.createElement('div'); h.id = 'tdApp'; tab.insertBefore(h, tab.firstChild); tab.classList.add('td-owned'); }
    return h;
  }
  function show(view) {
    if (view) S.view = view;
    var h = host();
    if (!h) return;
    var key = [section(), teacher().subjectKey, ctx().mode, ctx().board, ctx().stream].join('|');
    if (S.chapterKey !== key) { S.chapterKey = key; S.chapters = null; S.picked = []; S.topics = []; S.draft = null; S.paper = null; }
    if (S.view === 'live') renderLive(h);
    else if (S.view === 'paper') renderPaper(h);
    else renderCreate(h);
    if (global.UnisoleShell && global.UnisoleShell.refresh) global.UnisoleShell.refresh();
  }
  function loadChapters() {
    if (S.chapters) return Promise.resolve(S.chapters);
    var t = teacher(), c = ctx();
    var q = '?subjectKey=' + encodeURIComponent(t.subjectKey) + '&grade=' + grade() + '&mode=' + (comp() ? 'COMPETITIVE' : 'BOARD') + '&board=' + encodeURIComponent(boardKey()) + '&stream=' + stream();
    return api('/api/tests-dpps/chapters' + q).then(function (b) { S.chapters = b; return b; });
  }
  function head(title, sub) {
    return '<div class="td-head"><div><h2>' + esc(title) + '</h2><p>' + sub + '</p></div><div class="td-ctx"><span class="td-pill">' + ico('users', 13) + ' ' + esc(classLabel()) + '</span><span class="td-pill">' + ico('book', 13) + ' ' + esc(teacher().subjectName) + '</span><span class="td-pill td-pill-mode">' + esc(modeLabel()) + '</span></div></div>';
  }

  // ------------------------------------------------------------ create --
  function renderCreate(h) {
    h.innerHTML = head('Create a test or DPP', 'Pick the units and topics, where the questions come from and how many you want. You choose <b>Test or DPP</b> when you publish.')
      + '<div class="td-grid"><div class="td-form" id="tdForm"><div class="td-card"><p class="td-muted">' + ico('loader-2', 14) + ' Loading chapters...</p></div></div><div class="td-draft" id="tdDraft"></div></div>';
    icons();
    loadChapters().then(function () { paintForm(); paintDraft(); }).catch(function (e) { if ($('tdForm')) $('tdForm').innerHTML = '<div class="td-card td-warn">' + esc(e.message) + '</div>'; });
  }
  function titlePlaceholder() {
    var names = S.picked.map(function (n) { return n.replace(/^Chapter\s*\d+\s*:\s*/i, ''); });
    if (!names.length) return 'e.g. Electrostatics – Unit Test 1';
    var main = names.length === 1 ? names[0] : names.length === 2 ? names[0] + ' & ' + names[1] : names[0] + ' + ' + (names.length - 1) + ' more units';
    return 'e.g. ' + main + (comp() ? ' – ' + stream() + ' practice test' : ' – Unit Test');
  }
  function paintForm() {
    var box = $('tdForm');
    if (!box) return;
    var ch = (S.chapters && S.chapters.chapters) || [];
    var isComp = comp();
    var types = isComp ? COMP_TYPES : BOARD_TYPES;
    var src = isComp
      ? [['PYQ', stream() + ' previous-year questions'], ['PRACTICE', 'Practice sets'], ['NCERT', 'NCERT & Exemplar'], ['TEACHER', 'Added by teachers (incl. edited)'], ['AI', 'New questions written by AI']]
      : [['PYQ', (boardKey() === 'HP_BOARD' ? 'HP Board' : 'Board') + ' previous-year questions'], ['NCERT', 'NCERT & Exemplar'], ['PRACTICE', 'Practice sets'], ['TEACHER', 'Added by teachers (incl. edited)'], ['AI', 'New questions written by AI']];
    var f = S.form || (S.form = { sources: ['PYQ', 'NCERT', 'PRACTICE', 'TEACHER'], types: null, marks: { 1: 5, 2: 3, 3: 3, 4: 0, 5: 1 }, diff: { EASY: 5, MEDIUM: 10, HARD: 5 }, full: false, mix: { EASY: 30, MEDIUM: 50, HARD: 20 } });
    if (!f.types || f.typesFor !== isComp) { f.types = types.map(function (t) { return t[0]; }); f.typesFor = isComp; }
    var topicsHtml = S.picked.length ? S.picked.map(function (name) {
      var c = ch.find(function (x) { return x.name === name; }) || { topics: [] };
      return '<div class="td-topgroup"><b>' + esc(name) + '</b>' + (c.topics.length ? c.topics.map(function (t) { var id = t.id || t.name; return '<label class="td-chk' + (t.count ? '' : ' empty') + '"><input type="checkbox" data-td-topic="' + esc(id) + '"' + (S.topics.indexOf(id) !== -1 ? ' checked' : '') + '> ' + esc(t.name) + ' <small>' + t.count + '</small></label>'; }).join('') : '<small class="td-muted">No topic list for this unit; all its questions are used.</small>') + '</div>';
    }).join('') : '<p class="td-muted">Pick one or more units first.</p>';
    box.innerHTML = ''
      + '<div class="td-card"><h3>1. Title</h3><input class="form-control" id="tdTitle" maxlength="140" placeholder="' + esc(titlePlaceholder()) + '" value="' + esc(f.title || '') + '"><small class="td-muted">Leave empty to use the units as the title. Time and dates are set when you publish.</small></div>'
      + '<div class="td-card"><div class="td-card-h"><h3>2. Units</h3><span><button type="button" class="td-link" data-td-all>Select all</button> · <button type="button" class="td-link" data-td-none>Clear</button></span></div>'
      + (f.full ? '<p class="td-muted">A full-length mock uses the full syllabus of all three subjects.</p>' : '<div class="td-units">' + ch.map(function (c) { var on = S.picked.indexOf(c.name) !== -1; return '<label class="td-unit' + (on ? ' on' : '') + (c.count ? '' : ' empty') + '"><input type="checkbox" data-td-unit="' + esc(c.name) + '"' + (on ? ' checked' : '') + '><span>' + (c.number ? c.number + '. ' : '') + esc(c.name) + '</span><small>' + c.count + ' Qs</small></label>'; }).join('') + '</div>'
        + (S.chapters && !S.chapters.syllabusLoaded ? '<p class="td-note">The syllabus list for this class is not loaded yet, so only units that already have questions are shown.</p>' : ''))
      + '</div>'
      + (f.full ? '' : '<div class="td-card"><div class="td-card-h"><h3>3. Topics</h3><small class="td-muted">' + (S.topics.length ? S.topics.length + ' chosen' : 'All topics of the chosen units') + '</small></div><div class="td-topics">' + topicsHtml + '</div></div>')
      + '<div class="td-card"><h3>' + (f.full ? '3' : '4') + '. Where questions come from</h3><div class="td-chips">' + src.map(function (s) { return '<label class="td-chip"><input type="checkbox" data-td-src="' + s[0] + '"' + (f.sources.indexOf(s[0]) !== -1 ? ' checked' : '') + '> ' + esc(s[1]) + '</label>'; }).join('') + '</div><small class="td-muted">With AI ticked, missing questions are written by AI (you can swap or remove them).</small></div>'
      + '<div class="td-card"><h3>' + (f.full ? '4' : '5') + '. Questions</h3>'
      + (isComp
        ? '<label class="td-chk td-full"><input type="checkbox" id="tdFull"' + (f.full ? ' checked' : '') + '> <b>Full-length ' + stream() + ' mock</b> — ' + (stream() === 'NEET' ? 'Physics 45 + Chemistry 45 + Biology 90 (200 min)' : 'Physics, Chemistry and Maths: 20 MCQ + 5 numerical each (180 min)') + '</label>'
          + (f.full
            ? '<p class="td-muted">Difficulty mix (%)</p><div class="td-row3">' + ['EASY', 'MEDIUM', 'HARD'].map(function (d) { return '<label>' + d.charAt(0) + d.slice(1).toLowerCase() + '<input type="number" class="form-control" min="0" max="100" data-td-mix="' + d + '" value="' + f.mix[d] + '"></label>'; }).join('') + '</div>'
            : '<p class="td-muted">How many of each difficulty (every question is +4 / −1)</p><div class="td-row3">' + ['EASY', 'MEDIUM', 'HARD'].map(function (d) { return '<label>' + d.charAt(0) + d.slice(1).toLowerCase() + '<input type="number" class="form-control" min="0" max="60" data-td-diff="' + d + '" value="' + f.diff[d] + '"></label>'; }).join('') + '</div>')
        : '<p class="td-muted">How many questions of each marks</p><div class="td-marks">' + MARK_ROWS.map(function (r) { return '<label><span><b>' + r[1] + '</b><small>' + r[2] + '</small></span><input type="number" class="form-control" min="0" max="60" data-td-marks="' + r[0] + '" value="' + (f.marks[r[0]] || 0) + '"></label>'; }).join('') + '</div>')
      + '<p class="td-muted">Question types</p><div class="td-chips">' + types.map(function (t) { return '<label class="td-chip"><input type="checkbox" data-td-type="' + t[0] + '"' + (f.types.indexOf(t[0]) !== -1 ? ' checked' : '') + '> ' + esc(t[1]) + '</label>'; }).join('') + '</div>'
      + '<div class="td-total" id="tdTotal"></div>'
      + '</div>'
      + '<button type="button" class="btn-primary td-build" id="tdBuild">' + ico('sparkles', 16) + (S.draft ? ' Build again' : ' Build the paper') + '</button>';
    bindForm();
    paintTotal();
    icons();
  }
  function paintTotal() {
    var f = S.form, el = $('tdTotal');
    if (!el) return;
    if (comp()) {
      if (f.full) { var mixSum = f.mix.EASY + f.mix.MEDIUM + f.mix.HARD; el.innerHTML = mixSum === 100 ? '' : '<span class="td-warn-text">The mix adds up to ' + mixSum + '%; it should be 100%.</span>'; return; }
      var n = f.diff.EASY + f.diff.MEDIUM + f.diff.HARD;
      el.innerHTML = '<b>' + n + '</b> questions • <b>' + n * 4 + '</b> marks';
    } else {
      var q = 0, m = 0;
      Object.keys(f.marks).forEach(function (k) { q += f.marks[k]; m += f.marks[k] * Number(k); });
      el.innerHTML = '<b>' + q + '</b> questions • <b>' + m + '</b> marks';
    }
  }
  function bindForm() {
    var box = $('tdForm'), f = S.form;
    $('tdTitle').addEventListener('input', function (e) { f.title = e.target.value; });
    box.querySelectorAll('[data-td-unit]').forEach(function (c) { c.addEventListener('change', function () { var n = c.getAttribute('data-td-unit'); var i = S.picked.indexOf(n); if (c.checked && i === -1) S.picked.push(n); if (!c.checked && i !== -1) S.picked.splice(i, 1); pruneTopics(); paintForm(); }); });
    var all = box.querySelector('[data-td-all]'); if (all) all.addEventListener('click', function () { S.picked = ((S.chapters || {}).chapters || []).filter(function (c) { return c.count; }).map(function (c) { return c.name; }); pruneTopics(); paintForm(); });
    var none = box.querySelector('[data-td-none]'); if (none) none.addEventListener('click', function () { S.picked = []; S.topics = []; paintForm(); });
    box.querySelectorAll('[data-td-topic]').forEach(function (c) { c.addEventListener('change', function () { var id = c.getAttribute('data-td-topic'); var i = S.topics.indexOf(id); if (c.checked && i === -1) S.topics.push(id); if (!c.checked && i !== -1) S.topics.splice(i, 1); var lab = box.querySelector('.td-card-h small'); }); });
    box.querySelectorAll('[data-td-src]').forEach(function (c) { c.addEventListener('change', function () { var k = c.getAttribute('data-td-src'); f.sources = f.sources.filter(function (x) { return x !== k; }); if (c.checked) f.sources.push(k); }); });
    box.querySelectorAll('[data-td-type]').forEach(function (c) { c.addEventListener('change', function () { var k = c.getAttribute('data-td-type'); f.types = f.types.filter(function (x) { return x !== k; }); if (c.checked) f.types.push(k); }); });
    box.querySelectorAll('[data-td-marks]').forEach(function (c) { c.addEventListener('input', function () { f.marks[c.getAttribute('data-td-marks')] = Math.max(0, Math.min(60, Number(c.value) || 0)); paintTotal(); }); });
    box.querySelectorAll('[data-td-diff]').forEach(function (c) { c.addEventListener('input', function () { f.diff[c.getAttribute('data-td-diff')] = Math.max(0, Math.min(60, Number(c.value) || 0)); paintTotal(); }); });
    box.querySelectorAll('[data-td-mix]').forEach(function (c) { c.addEventListener('input', function () { f.mix[c.getAttribute('data-td-mix')] = Math.max(0, Math.min(100, Number(c.value) || 0)); paintTotal(); }); });
    var full = $('tdFull'); if (full) full.addEventListener('change', function () { f.full = full.checked; paintForm(); });
    $('tdBuild').addEventListener('click', build);
  }
  function pruneTopics() {
    var ch = (S.chapters && S.chapters.chapters) || [];
    var ok = [];
    S.picked.forEach(function (n) { var c = ch.find(function (x) { return x.name === n; }); (c ? c.topics : []).forEach(function (t) { ok.push(t.id || t.name); }); });
    S.topics = S.topics.filter(function (t) { return ok.indexOf(t) !== -1; });
  }
  function buildBody(extra) {
    var f = S.form, t = teacher(), c = ctx();
    return Object.assign({ teacher: t, grade: grade(), mode: comp() ? 'COMPETITIVE' : 'BOARD', board: boardKey(), stream: stream(), chapters: f.full ? [] : S.picked, topics: f.full ? [] : S.topics, sources: f.sources, types: f.types }, comp() ? (f.full ? { fullLength: true, difficultyMix: f.mix } : { difficulty: f.diff }) : { marks: f.marks }, extra || {});
  }
  function build() {
    var f = S.form;
    if (!f.full && !S.picked.length) { toast('Pick at least one unit.', 'warning'); return; }
    if (!f.sources.length) { toast('Pick at least one source.', 'warning'); return; }
    if (!f.types.length) { toast('Pick at least one question type.', 'warning'); return; }
    if (f.full && f.mix.EASY + f.mix.MEDIUM + f.mix.HARD !== 100) { toast('The difficulty mix should add up to 100%.', 'warning'); return; }
    var btn = $('tdBuild'); btn.disabled = true; btn.innerHTML = ico('loader-2', 16) + ' Building...'; icons();
    api('/api/tests-dpps/build', { method: 'POST', body: JSON.stringify(buildBody()) })
      .then(function (b) { S.draft = { questions: b.questions, notes: b.notes || [], fullLength: Boolean(b.fullLength), minutes: b.minutes || null, kindHint: 'TEST', source: 'create' }; paintForm(); paintDraft(); var d = $('tdDraft'); if (d && global.innerWidth < 1200) d.scrollIntoView({ behavior: 'smooth' }); })
      .catch(function (e) { toast(e.message, 'error'); btn.disabled = false; btn.innerHTML = ico('sparkles', 16) + ' Build the paper'; icons(); });
  }

  // ------------------------------------------------------------- draft --
  function totals(qs) { return { n: qs.length, marks: qs.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0), dpp: qs.filter(dppOk).length }; }
  function dppOk(q) { return (q.type === 'MCQ' && q.options_latex && q.options_latex.some(function (o) { return o.is_correct; })) || (q.type === 'NUMERICAL' && String(q.correct_answer || '').trim()); }
  function qCard(q, i, opts) {
    var key = (q.options_latex || []).find(function (o) { return o.is_correct; });
    var sh = S.showKey;
    return '<div class="td-q" data-i="' + i + '"><div class="td-q-top"><b>Q' + (i + 1) + '</b>'
      + (q.section ? '<span class="qb2-chip">' + esc(q.section) + '</span>' : '')
      + '<span class="qb2-chip">' + esc(String(q.chapter_name || '').replace(/^Chapter\s*\d+\s*:\s*/i, '')) + '</span>'
      + '<span class="qb2-chip">' + (q.negative ? '+' + q.marks + ' / −' + q.negative : q.marks + (q.marks === 1 ? ' mark' : ' marks')) + '</span>'
      + '<span class="qb2-chip qb2-d-' + String(q.difficulty || 'MEDIUM').toLowerCase() + '">' + esc(String(q.difficulty || 'MEDIUM').charAt(0) + String(q.difficulty || 'MEDIUM').slice(1).toLowerCase()) + '</span>'
      + '<span class="qb2-chip qb2-chip-soft">' + esc({ PYQ: 'PYQ', NCERT: 'NCERT', PRACTICE: 'Practice', TEACHER: 'Teacher-added' }[q.source] || (q.ai_generated ? 'AI' : '')) + (q.ai_generated ? ' (AI)' : '') + '</span>'
      + (opts && opts.noActions ? '' : '<span class="td-q-acts"><button type="button" class="qb2-act" data-td-swap="' + i + '">' + ico('repeat', 13) + ' Swap</button><button type="button" class="qb2-act qb2-act-del" data-td-del="' + i + '" aria-label="Remove question ' + (i + 1) + '">' + ico('trash-2', 13) + '</button></span>')
      + '</div><div class="td-q-text">' + tex(q.question_latex) + '</div>'
      + ((q.options_latex || []).length ? '<div class="td-opts">' + q.options_latex.map(function (o) { return '<div class="td-opt' + (sh && o.is_correct ? ' right' : '') + '"><b>' + esc(o.key) + '</b><span>' + tex(o.latex) + '</span>' + (sh && o.is_correct ? ico('check', 14) : '') + '</div>'; }).join('') + '</div>' : '')
      + (sh ? '<div class="td-key"><b>Marking scheme</b> ' + (key ? 'Answer (' + esc(key.key) + ')' : (q.correct_answer || q.correct_answer_latex ? 'Answer: ' + tex(q.correct_answer || q.correct_answer_latex) : 'Answer key not given')) + ' • ' + (q.negative ? '+' + q.marks + ' if right, −' + q.negative + ' if wrong, 0 if left' : q.marks + ' mark' + (q.marks === 1 ? '' : 's')) + (q.solution_latex ? '<details' + (q._solOpen ? ' open' : '') + '><summary>Solution</summary><div class="td-sol">' + tex(q.solution_latex).replace(/\n/g, '<br>') + '</div></details>' : '')
        + (thinSol(q) && (q.source_question_id || q.id) && !(opts && opts.noActions) ? '<button type="button" class="td-link td-aisol" data-td-aisol="' + i + '">' + (q._aiBusy ? 'Writing a detailed solution...' : 'Write a detailed step-by-step solution with AI') + '</button>' : '') + '</div>' : '')
      + '</div>';
  }
  function thinSol(q) { return !q.solution_ai && String(q.solution_latex || '').replace(/\s+/g, ' ').trim().length < 90; }
  function aiSolution(d, i, target) {
    var q = d.questions[i];
    if (q._aiBusy) return;
    q._aiBusy = true; paintDraft(target);
    api('/api/question-bank/questions/' + encodeURIComponent(q.source_question_id || q.id) + '/solution', { method: 'POST', body: JSON.stringify({ teacher: teacher(), force: true }) })
      .then(function (b) { if (b.question && b.question.solution_latex) { q.solution_latex = b.question.solution_latex; q.solution_ai = true; q._solOpen = true; } })
      .catch(function (e) { toast(e.message, 'error'); })
      .then(function () { q._aiBusy = false; paintDraft(target); });
  }
  function paintDraft(target) {
    var box = target || $('tdDraft');
    if (!box) return;
    var d = target ? S.paper : S.draft;
    if (!d) { box.innerHTML = '<div class="td-card td-empty">' + ico('file-question', 28) + '<p>Your paper appears here after <b>Build</b>. You can check it, swap or remove questions, see the marking scheme, print it and publish it as a Test or a DPP.</p></div>'; icons(); return; }
    var tt = totals(d.questions);
    var grouped = d.sections;
    box.innerHTML = '<div class="td-card td-draft-card"><div class="td-draft-head"><div><h3>' + (d.title || 'Draft paper') + '</h3><p><b>' + tt.n + '</b> questions • <b>' + tt.marks + '</b> marks' + (d.minutes ? ' • ' + d.minutes + ' min' : '') + ' • ' + tt.dpp + ' can go in a DPP</p></div>'
      + '<div class="td-draft-acts"><label class="qb2-switch"><input type="checkbox" id="tdShowKey"' + (S.showKey ? ' checked' : '') + '> Show marking scheme</label>'
      + '<button type="button" class="btn-secondary" id="tdRegen">' + ico('refresh-cw', 14) + ' Regenerate</button>'
      + '<button type="button" class="btn-secondary" id="tdPrint">' + ico('printer', 14) + ' Print / PDF</button>'
      + '<button type="button" class="btn-primary" id="tdPublish"' + (tt.n ? '' : ' disabled') + '>' + ico('send', 14) + ' Publish</button></div></div>'
      + (d.notes && d.notes.length ? '<div class="td-note">' + d.notes.map(esc).join('<br>') + '</div>' : '')
      + (grouped
        ? grouped.map(function (sec) { var list = d.questions.map(function (q, i) { return [q, i]; }).filter(function (x) { return Number(x[0].marks) === sec[1]; }); return '<h4 class="td-sec">Section ' + sec[0] + ' — ' + esc(sec[3]) + ' (' + list.length + ' × ' + sec[1] + ' = ' + list.length * sec[1] + ' marks)</h4>' + list.map(function (x) { return qCard(x[0], x[1]); }).join(''); }).join('')
        : d.questions.map(function (q, i) { return qCard(q, i); }).join(''))
      + '</div>';
    $('tdShowKey').addEventListener('change', function (e) { S.showKey = e.target.checked; paintDraft(target); });
    $('tdRegen').addEventListener('click', function () { if (target) buildPaper(); else build(); });
    $('tdPrint').addEventListener('click', function () { printPaper(d); });
    $('tdPublish').addEventListener('click', function () { openPublish(d); });
    box.querySelectorAll('[data-td-del]').forEach(function (b) { b.addEventListener('click', function () { d.questions.splice(Number(b.getAttribute('data-td-del')), 1); paintDraft(target); }); });
    box.querySelectorAll('[data-td-swap]').forEach(function (b) { b.addEventListener('click', function () { openSwap(d, Number(b.getAttribute('data-td-swap')), target); }); });
    box.querySelectorAll('[data-td-aisol]').forEach(function (b) { b.addEventListener('click', function () { aiSolution(d, Number(b.getAttribute('data-td-aisol')), target); }); });
    icons();
  }
  function openSwap(d, i, target) {
    var q = d.questions[i];
    var m = modal('Swap question ' + (i + 1), '<p class="td-muted">Questions from the same unit with the same ' + (comp() ? 'difficulty' : 'marks') + '.</p><div id="tdAlt"><p class="td-muted">' + ico('loader-2', 14) + ' Loading...</p></div>', '<button type="button" class="btn-secondary" data-x2>Close</button>', true);
    m.$('[data-x2]').addEventListener('click', m.close);
    api('/api/tests-dpps/alternatives', { method: 'POST', body: JSON.stringify({ teacher: teacher(), question: q, grade: grade(), mode: comp() ? 'COMPETITIVE' : 'BOARD', board: boardKey(), stream: stream(), fullLength: d.fullLength, excludeIds: d.questions.map(function (x) { return x.id; }) }) })
      .then(function (b) {
        var alts = b.alternatives || [];
        m.$('#tdAlt').innerHTML = alts.length ? alts.map(function (a, k) { return '<div class="td-alt">' + qCard(a, k, { noActions: true }).replace('<b>Q' + (k + 1) + '</b>', '') + '<button type="button" class="btn-primary" data-pick="' + k + '">Use this one</button></div>'; }).join('') : '<p class="td-note">No other question with the same ' + (comp() ? 'difficulty' : 'marks') + ' in this unit. Remove it, or build again with AI as a source.</p>';
        m.$$('[data-pick]').forEach(function (btn) { btn.addEventListener('click', function () { var a = alts[Number(btn.getAttribute('data-pick'))]; if (q.section) a.section = q.section; d.questions[i] = a; m.close(); paintDraft(target); toast('Question swapped.', 'success'); }); });
        icons();
      }).catch(function (e) { m.$('#tdAlt').innerHTML = '<p class="td-note">' + esc(e.message) + '</p>'; });
  }
  function printPaper(d) {
    var tt = totals(d.questions);
    var title = (d.title || S.form && S.form.title || 'Test paper');
    var m = modal('Print / PDF', '<label class="td-chk"><input type="checkbox" id="tdPKey" checked> Add the marking scheme (answers) at the end</label><label class="td-chk"><input type="checkbox" id="tdPSol"> Add solutions to the marking scheme</label>', '<button type="button" class="btn-secondary" data-x2>Cancel</button><button type="button" class="btn-primary" data-go>' + ico('printer') + ' Print</button>');
    m.$('[data-x2]').addEventListener('click', m.close);
    m.$('[data-go]').addEventListener('click', function () {
      var key = m.$('#tdPKey').checked, sol = m.$('#tdPSol').checked;
      var body = '<p class="pr-meta">' + esc(classLabel()) + ' • ' + esc(teacher().subjectName) + ' • ' + tt.n + ' questions • ' + tt.marks + ' marks' + (d.minutes ? ' • ' + d.minutes + ' minutes' : '') + '</p>'
        + d.questions.map(function (q, i) { return '<section class="pr-item"><div class="pr-qrow"><span class="pr-no">' + (i + 1) + '.</span><div class="pr-q">' + tex(q.question_latex) + '</div><span class="pr-marks">[' + (q.negative ? '+' + q.marks + '/−' + q.negative : q.marks) + ']</span></div>' + ((q.options_latex || []).length ? '<div class="pr-opts">' + q.options_latex.map(function (o) { return '<div class="pr-opt"><span class="pr-ol">(' + esc(o.key) + ')</span><span>' + tex(o.latex) + '</span></div>'; }).join('') + '</div>' : '<div class="pr-lines"></div>') + '</section>'; }).join('')
        + (key ? '<h2 class="pr-break">Marking scheme</h2><table class="pr-key"><thead><tr><th>Q</th><th>Answer</th><th>Marks</th>' + (sol ? '<th>Solution</th>' : '') + '</tr></thead><tbody>' + d.questions.map(function (q, i) { var k = (q.options_latex || []).find(function (o) { return o.is_correct; }); return '<tr><td>' + (i + 1) + '</td><td>' + (k ? '(' + esc(k.key) + ') ' + tex(k.latex) : tex(q.correct_answer || q.correct_answer_latex || '—')) + '</td><td>' + q.marks + '</td>' + (sol ? '<td>' + tex(q.solution_latex || '—').replace(/\n/g, '<br>') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>' : '');
      m.close();
      var K = global.UnisoleKit;
      if (K && K.printDoc) K.printDoc(title, '<style>.pr-item{margin:0 0 14px;break-inside:avoid}.pr-qrow{display:flex;gap:8px}.pr-no{font-weight:700;min-width:22px}.pr-q{flex:1}.pr-marks{font-weight:700;white-space:nowrap}.pr-opts{margin:6px 0 0 30px;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}.pr-opt{display:flex;gap:6px}.pr-ol{font-weight:600;min-width:24px}.pr-lines{height:60px;border-bottom:1px dashed #bbb;margin:8px 0 0 30px}.pr-break{break-before:page}.pr-key{width:100%;border-collapse:collapse}.pr-key th,.pr-key td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.pr-key tr{break-inside:avoid}.pr-meta{color:#444}</style>' + body, esc(classLabel()));
    });
  }

  // ----------------------------------------------------------- publish --
  function openPublish(d) {
    var tt = totals(d.questions);
    var f = S.form || {};
    var title = (d.source === 'paper' ? d.title : f.title) || $('tdTitle') && $('tdTitle').placeholder.replace(/^e\.g\.\s*/, '') || 'Test';
    var minutes = d.minutes || Math.max(10, Math.round(d.questions.reduce(function (s, q) { return s + (Number(q.marks) || 1) * (comp() ? 2.4 : 1.6); }, 0) / 5) * 5);
    var m = modal('Publish', '<div class="td-kind" role="radiogroup" aria-label="Publish as">'
      + '<label class="td-kopt"><input type="radio" name="tdKind" value="TEST" checked><span><b>Test</b><small>All ' + tt.n + ' questions • ' + tt.marks + ' marks • marks go to Class Progress</small></span></label>'
      + '<label class="td-kopt' + (tt.dpp ? '' : ' off') + '"><input type="radio" name="tdKind" value="DPP"' + (tt.dpp && !d.fullLength ? '' : ' disabled') + '><span><b>DPP (daily practice)</b><small>' + (d.fullLength ? 'Full-length mocks are published as tests.' : tt.dpp ? tt.dpp + ' of ' + tt.n + ' questions can go in (multiple choice with an answer, numerical). Students see answers right after submitting.' : 'None of these questions can go in a DPP.') + '</small></span></label></div>'
      + '<label class="qb2-field">Title<input class="form-control" id="tdPTitle" maxlength="140" value="' + esc(title) + '"></label>'
      + '<div class="qb2-field"><span>Who can take it</span><div class="td-who"><label class="td-chk"><input type="radio" name="tdWho" value="ALL" checked> Whole class (' + esc(classLabel()) + ')</label><label class="td-chk"><input type="radio" name="tdWho" value="SOME"> Only some students</label></div><div id="tdStudents" hidden></div></div>'
      + (global.SchedulePicker ? global.SchedulePicker.html('tdSched', { what: 'test', minutes: minutes, mode: 'NONE' }) : '<label class="qb2-field">Time limit (minutes)<input type="number" class="form-control" id="tdMins" value="' + minutes + '"></label>')
      + '<div id="tdDppMark" hidden><label class="qb2-field">DPP marking<select class="form-select" id="tdMark"><option value="4,-1"' + (comp() ? ' selected' : '') + '>+4 / −1 (JEE / NEET)</option><option value="1,0"' + (comp() ? '' : ' selected') + '>+1 / 0 (no negative)</option></select></label></div>',
      '<button type="button" class="btn-secondary" data-x2>Cancel</button><button type="button" class="btn-primary" data-go>' + ico('send') + ' Publish</button>', true);
    if (global.SchedulePicker) global.SchedulePicker.bind(m.el, 'tdSched');
    m.$('[data-x2]').addEventListener('click', m.close);
    m.$$('input[name="tdKind"]').forEach(function (r) { r.addEventListener('change', function () { m.$('#tdDppMark').hidden = r.value !== 'DPP' || !r.checked; }); });
    m.$$('input[name="tdWho"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var box = m.$('#tdStudents');
        box.hidden = r.value !== 'SOME';
        if (r.value === 'SOME' && !box.getAttribute('data-loaded')) {
          box.setAttribute('data-loaded', '1');
          box.innerHTML = '<p class="td-muted">Loading students...</p>';
          api('/api/curriculum/students?section=' + encodeURIComponent(section())).then(function (b) {
            box.innerHTML = '<div class="td-stu">' + (b.students || []).map(function (s) { return '<label class="td-chk"><input type="checkbox" data-stu="' + esc(s.id) + '"> ' + esc(s.full_name) + ' <small>' + esc(s.roll_number || '') + '</small></label>'; }).join('') + '</div>';
          }).catch(function (e) { box.innerHTML = '<p class="td-note">' + esc(e.message) + '</p>'; });
        }
      });
    });
    m.$('[data-go]').addEventListener('click', function () {
      var kind = (m.$('input[name="tdKind"]:checked') || {}).value || 'TEST';
      var sched = null;
      if (global.SchedulePicker) { try { sched = global.SchedulePicker.read(m.el, 'tdSched'); } catch (e) { toast(e.message, 'warning'); return; } }
      var some = m.$('input[name="tdWho"]:checked').value === 'SOME';
      var ids = some ? Array.prototype.filter.call(m.$$('[data-stu]'), function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-stu'); }) : null;
      if (some && !ids.length) { toast('Tick at least one student.', 'warning'); return; }
      var mk = (m.$('#tdMark') ? m.$('#tdMark').value : '4,-1').split(',');
      var mins = sched && sched.durationMinutes ? sched.durationMinutes : (m.$('#tdMins') ? Number(m.$('#tdMins').value) : minutes);
      var btn = this; btn.disabled = true;
      api('/api/tests-dpps/publish', { method: 'POST', body: JSON.stringify({
        teacher: teacher(), kind: kind, title: m.$('#tdPTitle').value.trim(), section: section(), grade: grade(), questions: d.questions,
        schedule: sched, durationMinutes: mins, studentIds: ids, mode: comp() ? 'COMPETITIVE' : 'BOARD', board: boardKey(), stream: stream(), track: comp() ? stream() : boardKey(),
        fullLength: d.fullLength, topics: [], negative: comp() ? 1 : 0, correctMarks: Number(mk[0]), incorrectMarks: Number(mk[1])
      }) }).then(function (b) {
        m.close();
        toast((kind === 'DPP' ? 'DPP' : 'Test') + ' "' + b.item.title + '" published' + (b.left ? ' (' + b.left + ' question(s) cannot go in a DPP and were left out)' : '') + '.', 'success');
        if (d.source === 'paper') S.paper = null; else S.draft = null;
        show('live');
      }).catch(function (e) { btn.disabled = false; toast(e.message, 'error'); });
    });
  }

  // ------------------------------------------------- full board paper --
  function renderPaper(h) {
    if (comp()) {
      h.innerHTML = head('Full-length mock', 'In Competitive Prep the full paper is a full-length ' + stream() + ' mock with all three subjects.')
        + '<div class="td-card"><p>Use <b>Create</b> and tick <b>Full-length ' + stream() + ' mock</b> under Questions.</p><button type="button" class="btn-primary" id="tdGoFull">' + ico('arrow-right') + ' Set up a full-length mock</button></div>';
      $('tdGoFull').addEventListener('click', function () { S.form = S.form || null; show('create'); if (S.form) { S.form.full = true; paintForm(); } });
      icons(); return;
    }
    var bk = boardKey() === 'HP_BOARD' ? 'HP_BOARD' : 'CBSE';
    var p = S.paperPlan || (S.paperPlan = { pattern: bk, counts: null, sources: ['PYQ', 'NCERT', 'PRACTICE', 'TEACHER'] });
    if (p.pattern !== bk && !p.custom) { p.pattern = bk; p.counts = null; }
    var pat = PAPERS[p.pattern];
    if (!p.counts) { p.counts = {}; pat.sections.forEach(function (s) { p.counts[s[1]] = (p.counts[s[1]] || 0) + s[2]; }); }
    var total = 0; Object.keys(p.counts).forEach(function (k) { total += p.counts[k] * Number(k); });
    h.innerHTML = head('Full board paper', 'The whole syllabus by the ' + esc(pat.label) + ' (' + pat.total + ' marks, 3 hours). Change any count, then build, check, print or publish.')
      + '<div class="td-grid"><div class="td-form"><div class="td-card"><h3>Pattern</h3><div class="td-chips">' + Object.keys(PAPERS).map(function (k) { return '<label class="td-chip"><input type="radio" name="tdPat" value="' + k + '"' + (p.pattern === k ? ' checked' : '') + '> ' + esc(PAPERS[k].label) + '</label>'; }).join('') + '</div>'
      + '<div class="td-marks">' + pat.sections.map(function (s) { return '<label><span><b>Section ' + s[0] + '</b><small>' + esc(s[3]) + ' • ' + s[1] + ' mark' + (s[1] === 1 ? '' : 's') + ' each</small></span><input type="number" class="form-control" min="0" max="40" data-pc="' + s[1] + '" value="' + p.counts[s[1]] + '"></label>'; }).join('') + '</div><div class="td-total"><b>' + total + '</b> marks' + (total !== pat.total ? ' <span class="td-warn-text">(the pattern has ' + pat.total + ')</span>' : '') + '</div></div>'
      + '<div class="td-card"><h3>Where questions come from</h3><div class="td-chips">' + [['PYQ', 'Board previous-year'], ['NCERT', 'NCERT & Exemplar'], ['PRACTICE', 'Practice sets'], ['TEACHER', 'Added by teachers'], ['AI', 'New questions by AI']].map(function (s) { return '<label class="td-chip"><input type="checkbox" data-psrc="' + s[0] + '"' + (p.sources.indexOf(s[0]) !== -1 ? ' checked' : '') + '> ' + s[1] + '</label>'; }).join('') + '</div></div>'
      + '<button type="button" class="btn-primary td-build" id="tdBuildPaper">' + ico('sparkles', 16) + (S.paper ? ' Build again' : ' Build the full paper') + '</button></div>'
      + '<div class="td-draft" id="tdPaperDraft"></div></div>';
    h.querySelectorAll('input[name="tdPat"]').forEach(function (r) { r.addEventListener('change', function () { p.pattern = r.value; p.custom = true; p.counts = null; renderPaper(h); }); });
    h.querySelectorAll('[data-pc]').forEach(function (c) { c.addEventListener('change', function () { p.counts[c.getAttribute('data-pc')] = Math.max(0, Math.min(40, Number(c.value) || 0)); renderPaper(h); }); });
    h.querySelectorAll('[data-psrc]').forEach(function (c) { c.addEventListener('change', function () { var k = c.getAttribute('data-psrc'); p.sources = p.sources.filter(function (x) { return x !== k; }); if (c.checked) p.sources.push(k); }); });
    $('tdBuildPaper').addEventListener('click', buildPaper);
    paintDraft($('tdPaperDraft'));
    icons();
  }
  function buildPaper() {
    var p = S.paperPlan, pat = PAPERS[p.pattern];
    if (!p.sources.length) { toast('Pick at least one source.', 'warning'); return; }
    var btn = $('tdBuildPaper'); if (btn) { btn.disabled = true; btn.innerHTML = ico('loader-2', 16) + ' Building...'; icons(); }
    api('/api/tests-dpps/build', { method: 'POST', body: JSON.stringify({ teacher: teacher(), grade: grade(), mode: 'BOARD', board: boardKey(), chapters: [], sources: p.sources, marks: p.counts }) })
      .then(function (b) {
        var qs = b.questions.slice().sort(function (a, c) { return a.marks - c.marks; });
        S.paper = { questions: qs, notes: b.notes || [], sections: pat.sections, minutes: pat.minutes, title: 'Class ' + grade() + ' ' + teacher().subjectName + ' — Full board paper (' + pat.label + ')', source: 'paper' };
        renderPaper(host());
      }).catch(function (e) { toast(e.message, 'error'); if (btn) { btn.disabled = false; btn.innerHTML = ico('sparkles', 16) + ' Build the full paper'; icons(); } });
  }

  // -------------------------------------------------------------- live --
  var STATE = { LIVE: ['Live now', 'live'], SCHEDULED: ['Scheduled', 'sched'], CLOSED: ['Closed', 'closed'], TAKEN_BACK: ['Taken back', 'back'], DRAFT: ['Draft', 'back'] };
  function whenText(it) {
    if (!it.schedule) return it.state === 'TAKEN_BACK' ? 'Hidden from students' : 'Open now, no closing time';
    var s = it.schedule;
    return (it.state === 'SCHEDULED' ? 'Opens ' + fmtWhen(s.opensAt) + ' • ' : '') + 'Closes ' + fmtWhen(s.closesAt) + (s.mode === 'DURATION' ? ' • ' + s.durationMinutes + ' min each' : '');
  }
  function renderLive(h) {
    h.innerHTML = head('Live & published', 'Everything you have published for this class. Take it back, give more time, choose students, or see who attempted and the report.')
      + '<div class="td-live-bar" role="tablist">' + [['ALL', 'All'], ['LIVE', 'Live now'], ['SCHEDULED', 'Scheduled'], ['CLOSED', 'Closed'], ['TAKEN_BACK', 'Taken back']].map(function (x) { return '<button type="button" role="tab" class="td-lf' + (S.liveFilter === x[0] ? ' on' : '') + '" data-lf="' + x[0] + '">' + x[1] + ' <span data-lfn="' + x[0] + '"></span></button>'; }).join('') + '</div>'
      + '<div id="tdLive"><div class="td-card"><p class="td-muted">' + ico('loader-2', 14) + ' Loading...</p></div></div>';
    h.querySelectorAll('[data-lf]').forEach(function (b) { b.addEventListener('click', function () { S.liveFilter = b.getAttribute('data-lf'); renderLive(h); }); });
    icons();
    api('/api/tests-dpps?subjectKey=' + encodeURIComponent(teacher().subjectKey) + '&section=' + encodeURIComponent(section())).then(function (b) {
      if (!$('tdLive')) return; // the teacher has moved on
      S.items = b.items || [];
      h.querySelectorAll('[data-lfn]').forEach(function (s) { var k = s.getAttribute('data-lfn'); s.textContent = k === 'ALL' ? S.items.length : S.items.filter(function (i) { return i.state === k; }).length; });
      var list = S.items.filter(function (i) { return S.liveFilter === 'ALL' || i.state === S.liveFilter; });
      $('tdLive').innerHTML = list.length ? '<div class="td-card td-table-card"><table class="td-table"><thead><tr><th>Type</th><th>Title</th><th>When</th><th>Attempted</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + list.map(function (it) {
        var st = STATE[it.state] || ['', ''];
        return '<tr><td><span class="td-kind-b td-kind-' + it.kind.toLowerCase() + '">' + (it.kind === 'DPP' ? 'DPP' : (it.fullLength ? 'Mock' : 'Test')) + '</span></td>'
          + '<td><b>' + esc(it.title) + '</b><small>' + it.questionCount + ' questions • ' + it.totalMarks + ' marks' + (it.assignedStudentIds ? ' • ' + it.assignedStudentIds.length + ' chosen students' : '') + '</small></td>'
          + '<td><small>' + esc(whenText(it)) + '</small></td>'
          + '<td><button type="button" class="td-link td-att" data-att="' + it.kind + '|' + it.id + '">' + it.attempted + ' / ' + it.assigned + '</button>' + (it.avgPercent !== null ? '<small>avg ' + it.avgPercent + '%</small>' : '') + '</td>'
          + '<td><span class="td-state td-state-' + st[1] + '">' + st[0] + '</span></td>'
          + '<td class="td-acts">'
          + (it.state === 'TAKEN_BACK' ? '<button type="button" class="btn-secondary" data-act="republish" data-k="' + it.kind + '|' + it.id + '">Publish again</button>' : '<button type="button" class="btn-secondary" data-act="takeback" data-k="' + it.kind + '|' + it.id + '">Take back</button>')
          + '<button type="button" class="btn-secondary" data-act="extend" data-k="' + it.kind + '|' + it.id + '">Extend</button>'
          + '<button type="button" class="btn-secondary" data-act="students" data-k="' + it.kind + '|' + it.id + '">Students</button>'
          + '<button type="button" class="btn-primary" data-act="report" data-k="' + it.kind + '|' + it.id + '">Report</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="td-card td-empty">' + ico('inbox', 26) + '<p>Nothing here yet.</p></div>';
      $('tdLive').querySelectorAll('[data-att]').forEach(function (b) { var k = b.getAttribute('data-att').split('|'); b.addEventListener('click', function () { openAttempts(k[0], k[1]); }); });
      $('tdLive').querySelectorAll('[data-act]').forEach(function (b) { var k = b.getAttribute('data-k').split('|'); b.addEventListener('click', function () { liveAction(b.getAttribute('data-act'), k[0], k[1]); }); });
      icons();
    }).catch(function (e) { if ($('tdLive')) $('tdLive').innerHTML = '<div class="td-card td-note">' + esc(e.message) + '</div>'; });
  }
  function itemOf(id) { return (S.items || []).find(function (i) { return i.id === id; }) || {}; }
  function liveAction(act, kind, id) {
    var path = '/api/tests-dpps/' + kind.toLowerCase() + '/' + encodeURIComponent(id);
    var it = itemOf(id);
    if (act === 'report') { openReport(kind, id); return; }
    if (act === 'takeback') {
      if (!global.confirm('Take back "' + it.title + '"? Students will not see it until you publish it again. Answers already submitted are kept.')) return;
      api(path + '/take-back', { method: 'POST', body: JSON.stringify({ teacher: teacher() }) }).then(function () { toast('Taken back. Students cannot see it now.', 'success'); renderLive(host()); }).catch(function (e) { toast(e.message, 'error'); });
      return;
    }
    if (act === 'republish') { api(path + '/republish', { method: 'POST', body: JSON.stringify({ teacher: teacher() }) }).then(function () { toast('Published again.', 'success'); renderLive(host()); }).catch(function (e) { toast(e.message, 'error'); }); return; }
    if (act === 'extend') {
      var cur = it.schedule ? Date.parse(it.schedule.closesAt) : Date.now();
      var local = function (ms) { var d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
      var m = modal('Give more time', '<p class="td-muted">' + esc(it.title) + ' — ' + esc(whenText(it)) + '</p><div class="td-chips">' + [[15, '+15 min'], [30, '+30 min'], [60, '+1 hour'], [1440, '+1 day']].map(function (x) { return '<button type="button" class="btn-secondary" data-add="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><label class="qb2-field">New closing time<input type="datetime-local" class="form-control" id="tdClose" value="' + local(Math.max(cur, Date.now()) + 3600e3) + '"></label>', '<button type="button" class="btn-secondary" data-x2>Cancel</button><button type="button" class="btn-primary" data-go>Save</button>');
      m.$('[data-x2]').addEventListener('click', m.close);
      m.$$('[data-add]').forEach(function (b) { b.addEventListener('click', function () { m.$('#tdClose').value = local(Math.max(cur, Date.now()) + Number(b.getAttribute('data-add')) * 60000); }); });
      m.$('[data-go]').addEventListener('click', function () {
        var v = m.$('#tdClose').value;
        if (!v) { toast('Choose the new closing time.', 'warning'); return; }
        api(path + '/extend', { method: 'POST', body: JSON.stringify({ teacher: teacher(), closesAt: new Date(v).toISOString() }) }).then(function () { m.close(); toast('Closing time changed.', 'success'); renderLive(host()); }).catch(function (e) { toast(e.message, 'error'); });
      });
      return;
    }
    if (act === 'students') {
      var m2 = modal('Who can take it', '<p class="td-muted">' + esc(it.title) + '</p><div class="td-who"><label class="td-chk"><input type="radio" name="tdW2" value="ALL"' + (it.assignedStudentIds ? '' : ' checked') + '> Whole class</label><label class="td-chk"><input type="radio" name="tdW2" value="SOME"' + (it.assignedStudentIds ? ' checked' : '') + '> Only these students:</label></div><div id="tdStu2"><p class="td-muted">Loading...</p></div>', '<button type="button" class="btn-secondary" data-x2>Cancel</button><button type="button" class="btn-primary" data-go>Save</button>');
      m2.$('[data-x2]').addEventListener('click', m2.close);
      api('/api/curriculum/students?section=' + encodeURIComponent(it.section || section())).then(function (b) {
        m2.$('#tdStu2').innerHTML = '<div class="td-stu">' + (b.students || []).map(function (s) { return '<label class="td-chk"><input type="checkbox" data-stu="' + esc(s.id) + '"' + (it.assignedStudentIds && it.assignedStudentIds.indexOf(s.id) !== -1 ? ' checked' : '') + '> ' + esc(s.full_name) + ' <small>' + esc(s.roll_number || '') + '</small></label>'; }).join('') + '</div>';
      });
      m2.$('[data-go]').addEventListener('click', function () {
        var some = m2.$('input[name="tdW2"]:checked').value === 'SOME';
        var ids = some ? Array.prototype.filter.call(m2.$$('[data-stu]'), function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-stu'); }) : [];
        if (some && !ids.length) { toast('Tick at least one student.', 'warning'); return; }
        api(path + '/students', { method: 'POST', body: JSON.stringify({ teacher: teacher(), studentIds: ids }) }).then(function () { m2.close(); toast('Saved.', 'success'); renderLive(host()); }).catch(function (e) { toast(e.message, 'error'); });
      });
    }
  }

  // ---------------------------------------------- attempts and report --
  function openAttempts(kind, id) {
    var m = modal('Who attempted', '<p class="td-muted">' + ico('loader-2', 14) + ' Loading...</p>', '<button type="button" class="btn-secondary" data-x2>Close</button>', true);
    m.$('[data-x2]').addEventListener('click', m.close);
    api('/api/tests-dpps/' + kind.toLowerCase() + '/' + encodeURIComponent(id) + '/attempts?subjectKey=' + encodeURIComponent(teacher().subjectKey)).then(function (b) {
      var done = b.students.filter(function (s) { return s.attempted; }), left = b.students.filter(function (s) { return !s.attempted; });
      m.$('.qb2-dhead h3').textContent = b.item.title + ' — ' + done.length + ' of ' + b.students.length + ' attempted';
      m.$('.qb2-dbody').innerHTML = '<div class="td-att-grid"><div><h4 class="td-ok">' + ico('check-circle-2', 15) + ' Attempted (' + done.length + ')</h4>' + (done.length ? '<ul class="td-att-list">' + done.map(function (s) { return '<li><b>' + esc(s.name) + '</b><small>' + esc(s.roll) + '</small><span>' + s.score + ' / ' + s.maxScore + ' (' + Math.round(s.percent) + '%)</span></li>'; }).join('') + '</ul>' : '<p class="td-muted">Nobody yet.</p>') + '</div>'
        + '<div><h4 class="td-bad">' + ico('clock', 15) + ' Not attempted (' + left.length + ')</h4>' + (left.length ? '<ul class="td-att-list">' + left.map(function (s) { return '<li><b>' + esc(s.name) + '</b><small>' + esc(s.roll) + '</small></li>'; }).join('') + '</ul>' : '<p class="td-muted">Everyone has attempted.</p>') + '</div></div>';
      icons();
    }).catch(function (e) { m.$('.qb2-dbody').innerHTML = '<p class="td-note">' + esc(e.message) + '</p>'; });
  }
  // Renders the report into the given element (Class Progress) or the Tests & DPPs page.
  function openReport(kind, id, opts) {
    opts = opts || {};
    var box = opts.host || host();
    if (!box) return;
    S.report = { kind: kind, id: id, qSort: 'index', qDir: 1, sSort: 'name', sDir: 1, open: {} };
    box.innerHTML = '<div class="td-card"><p class="td-muted">' + ico('loader-2', 14) + ' Loading report...</p></div>';
    icons();
    api('/api/tests-dpps/' + kind.toLowerCase() + '/' + encodeURIComponent(id) + '/report?subjectKey=' + encodeURIComponent(teacher().subjectKey)).then(function (b) {
      if (!S.report || S.report.id !== id || !document.body.contains(box)) return;
      S.report.data = b; S.report.box = box; S.report.back = opts.back;
      paintReport();
    }).catch(function (e) { box.innerHTML = '<div class="td-card td-note">' + esc(e.message) + '</div>'; });
  }
  function sortBy(list, key, dir) { return list.slice().sort(function (a, b) { var x = a[key], y = b[key]; if (x === null || x === undefined) x = -1; if (y === null || y === undefined) y = -1; if (typeof x === 'string') return x.localeCompare(y) * dir; return (x - y) * dir; }); }
  function th(label, key, which) { var r = S.report, cur = which === 'q' ? r.qSort : r.sSort, dir = which === 'q' ? r.qDir : r.sDir; return '<th><button type="button" class="td-sort' + (cur === key ? ' on' : '') + '" data-sort="' + which + '|' + key + '">' + label + (cur === key ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
  function bar(p, cls) { return '<span class="td-bar"><i class="' + cls + '" style="width:' + (p || 0) + '%"></i></span>'; }
  function paintReport() {
    var r = S.report, b = r.data, box = r.box;
    var done = b.students.filter(function (s) { return s.attempted; });
    var avg = done.length ? Math.round(done.reduce(function (s, x) { return s + (Number(x.percent) || 0); }, 0) / done.length) : null;
    var qs = sortBy(b.questions, r.qSort, r.qDir);
    var studs = sortBy(b.students.map(function (s) { return Object.assign({ percentSort: s.attempted ? s.percent : -1 }, s); }), r.sSort === 'percent' ? 'percentSort' : r.sSort, r.sDir);
    box.innerHTML = '<div class="td-rep">'
      + '<div class="td-rep-head">' + (r.back ? '<button type="button" class="btn-secondary" data-back>' + ico('arrow-left', 14) + ' Back to all tests</button>' : '<button type="button" class="btn-secondary" data-back-live>' + ico('arrow-left', 14) + ' Back</button>') + '<div><h2>' + esc(b.item.title) + '</h2><p>' + esc(b.item.section) + ' • ' + b.item.questionCount + ' questions • ' + b.item.totalMarks + ' marks • ' + esc(whenText(b.item)) + '</p></div><button type="button" class="btn-secondary" data-print>' + ico('printer', 14) + ' Print report</button></div>'
      + '<div class="td-kpis"><div><b>' + (avg === null ? '—' : avg + '%') + '</b><span>Class average</span></div><button type="button" class="td-kpi-btn" data-att><b>' + done.length + ' / ' + b.students.length + '</b><span>Attempted — see who</span></button><div><b>' + b.questions.filter(function (q) { return q.rightPct !== null && q.rightPct < 50; }).length + '</b><span>Questions under 50% right</span></div></div>'
      + modeCard(b)
      + '<div class="td-card"><div class="td-card-h"><h3>Questions</h3><small class="td-muted">Click a question to see which options students chose</small></div><div class="td-scroll"><table class="td-table td-qtable"><thead><tr>' + th('Q', 'index', 'q') + th('Topic', 'topic', 'q') + th('Right', 'rightPct', 'q') + th('Wrong', 'wrongPct', 'q') + th('Skipped', 'skippedPct', 'q') + th('Avg time', 'avgTimeSeconds', 'q') + '<th>Most chosen wrong</th></tr></thead><tbody>'
      + qs.map(function (q) {
        var open = r.open[q.index];
        return '<tr class="td-qrow' + (open ? ' open' : '') + '" data-q="' + q.index + '" tabindex="0"><td><b>Q' + q.index + '</b></td><td>' + esc(q.topic || q.chapter) + '</td><td>' + (q.rightPct === null ? '—' : bar(q.rightPct, 'ok') + q.rightPct + '%') + '</td><td>' + (q.wrongPct === null ? '—' : bar(q.wrongPct, 'bad') + q.wrongPct + '%') + '</td><td>' + (q.skippedPct === null ? '—' : q.skippedPct + '%') + '</td><td>' + (q.avgTimeSeconds ? q.avgTimeSeconds + ' s' : '—') + '</td><td>' + (q.mostChosenWrong ? '(' + esc(q.mostChosenWrong) + ') ' + q.optionCounts[q.mostChosenWrong] + ' students' : '—') + '</td></tr>'
          + (open ? '<tr class="td-qdetail"><td colspan="7">' + questionDetail(q) + '</td></tr>' : '');
      }).join('') + '</tbody></table></div></div>'
      + '<div class="td-card"><div class="td-card-h"><h3>Students</h3></div><div class="td-scroll"><table class="td-table"><thead><tr>' + th('Name', 'name', 's') + th('Roll', 'roll', 's') + th('Score', 'percent', 's') + th('Right', 'correct', 's') + th('Wrong', 'wrong', 's') + th('Skipped', 'skipped', 's') + th('Time', 'timeSeconds', 's') + '</tr></thead><tbody>'
      + studs.map(function (s) { return '<tr' + (s.attempted ? '' : ' class="td-absent"') + '><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.roll) + '</td><td>' + (s.attempted ? s.score + ' / ' + s.maxScore + ' (' + Math.round(s.percent) + '%)' : 'Not attempted') + '</td><td>' + (s.attempted ? s.correct : '—') + '</td><td>' + (s.attempted ? s.wrong : '—') + '</td><td>' + (s.attempted ? s.skipped : '—') + '</td><td>' + (s.timeSeconds ? Math.round(s.timeSeconds / 60) + ' min' : '—') + '</td></tr>'; }).join('')
      + '</tbody></table></div></div></div>';
    box.querySelectorAll('[data-sort]').forEach(function (bt) { bt.addEventListener('click', function () { var k = bt.getAttribute('data-sort').split('|'); if (k[0] === 'q') { r.qDir = r.qSort === k[1] ? -r.qDir : 1; r.qSort = k[1]; } else { r.sDir = r.sSort === k[1] ? -r.sDir : 1; r.sSort = k[1]; } paintReport(); }); });
    box.querySelectorAll('.td-qrow').forEach(function (tr) { var tog = function () { var i = tr.getAttribute('data-q'); r.open[i] = !r.open[i]; paintReport(); }; tr.addEventListener('click', tog); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } }); });
    var bk = box.querySelector('[data-back]'); if (bk) bk.addEventListener('click', r.back);
    var bl = box.querySelector('[data-back-live]'); if (bl) bl.addEventListener('click', function () { show('live'); });
    box.querySelector('[data-att]').addEventListener('click', function () { openAttempts(r.kind, r.id); });
    box.querySelector('[data-print]').addEventListener('click', function () { var K = global.UnisoleKit; if (K && K.printDoc) K.printDoc(b.item.title + ' — report', box.querySelector('.td-rep').innerHTML, esc(b.item.section)); });
    icons();
  }
  // Competitive: accuracy, time and marks lost to negative marking. Board: how each unit went.
  function modeCard(b) {
    var right = 0, wrong = 0, skip = 0, tsum = 0, tn = 0;
    b.questions.forEach(function (q) { right += q.right; wrong += q.wrong; skip += q.skipped; if (q.avgTimeSeconds) { tsum += q.avgTimeSeconds; tn += 1; } });
    if (b.item.mode === 'COMPETITIVE' || b.item.kind === 'DPP' && b.item.negative) {
      var neg = Number(b.item.negative || 1);
      return '<div class="td-kpis td-kpis-comp"><div><b>' + (right + wrong ? Math.round((right / (right + wrong)) * 100) + '%' : '—') + '</b><span>Accuracy (right of attempted)</span></div><div><b>' + (tn ? Math.round(tsum / tn) + ' s' : '—') + '</b><span>Average time per question</span></div><div><b>' + (wrong ? '−' + wrong * neg : '0') + '</b><span>Marks lost to negative marking (class total)</span></div></div>';
    }
    var byUnit = {};
    b.questions.forEach(function (q) { var u = String(q.chapter || q.topic || 'Other').replace(/^Chapter\s*\d+\s*:\s*/i, ''); var r = byUnit[u] || (byUnit[u] = { n: 0, marks: 0, right: 0, att: 0 }); r.n += 1; r.marks += Number(q.marks) || 0; r.right += q.right; r.att += q.attempted; });
    var units = Object.keys(byUnit);
    if (units.length < 2) return '';
    return '<div class="td-card"><div class="td-card-h"><h3>By unit</h3><small class="td-muted">Where the class needs revision</small></div><table class="td-table"><thead><tr><th>Unit</th><th>Questions</th><th>Marks</th><th>Answered right</th></tr></thead><tbody>' + units.map(function (u) { var r = byUnit[u], p = r.att ? Math.round((r.right / r.att) * 100) : null; return '<tr><td>' + esc(u) + '</td><td>' + r.n + '</td><td>' + r.marks + '</td><td>' + (p === null ? '—' : bar(p, p < 50 ? 'bad' : 'ok') + p + '%') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function questionDetail(q) {
    var n = q.attempted || 1;
    return '<div class="td-qd"><div class="td-q-text">' + tex(q.question_latex) + '</div>'
      + (q.options.length ? '<div class="td-dist">' + q.options.map(function (o) {
        var c = q.optionCounts[o.key] || 0, pct = Math.round((c / n) * 100), right = o.key === q.correctAnswer;
        return '<div class="td-dist-row' + (right ? ' right' : (c && o.key === q.mostChosenWrong ? ' trap' : '')) + '"><b>' + esc(o.key) + '</b><span class="td-dist-text">' + tex(o.latex) + '</span><span class="td-dist-bar"><i style="width:' + pct + '%"></i></span><span class="td-dist-n">' + c + ' (' + pct + '%)</span>' + (right ? '<span class="res-tag res-tag-ok">&#10003; Correct</span>' : (c && o.key === q.mostChosenWrong ? '<span class="res-tag res-tag-bad">Most chosen wrong</span>' : '')) + '</div>';
      }).join('') + '<div class="td-dist-row skip"><b>—</b><span class="td-dist-text">Skipped</span><span class="td-dist-bar"><i style="width:' + Math.round((q.skipped / n) * 100) + '%"></i></span><span class="td-dist-n">' + q.skipped + '</span></div></div>' : '<p class="td-muted">Correct answer: ' + tex(q.correctAnswer || '—') + ' • ' + q.right + ' right, ' + q.wrong + ' wrong, ' + q.skipped + ' skipped</p>')
      + (q.solution_latex ? '<details><summary>Solution</summary><div class="td-sol">' + tex(q.solution_latex).replace(/\n/g, '<br>') + '</div></details>' : '') + '</div>';
  }

  // Sub-tabs shown under the header while this section is open.
  function subtabs() {
    return [
      { label: 'Create', active: S.view === 'create', run: function () { show('create'); } },
      { label: comp() ? 'Full-length mock' : 'Full board paper', active: S.view === 'paper', run: function () { show('paper'); } },
      { label: 'Live & published', active: S.view === 'live', run: function () { show('live'); } }
    ];
  }
  if (typeof global.addEventListener === 'function') global.addEventListener('haps:modechange', function () { if (document.querySelector('#tabTeacherCreateTestAndPaper.active, #tabTeacherCreateTestAndPaper[style*="block"]')) show(); });

  global.TestsDpps = { show: show, subtabs: subtabs, openReport: openReport, openAttempts: openAttempts, view: function () { return S.view; } };
})(window);
