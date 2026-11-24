/* =============================================================================
   QUESTION BANK (2026-11-21)
   The teacher's Question Bank tab, redesigned for everyday use:
     - filters on the left (chapter with counts, topic, type, exam & year, difficulty,
       format, marks), search and sort on top
     - a compact list (20 per page); click a question to see it in full on the right
       (options with the right one marked, answer, step-by-step solution)
     - views: All / Added by me / Saved / Reported
     - tick questions, then: Make a test (choose when students take it), Make a DPP,
       or Print a worksheet with an answer key
     - Add questions: type one (live maths preview, optional picture), paste / PDF /
       photos (the existing import), or Excel / CSV with a template
     - edit or delete questions you added; save favourites; report a mistake
   Data comes from loadQuestionBankView() in app.js (state.questionBankData); this file
   only draws it. Questions a teacher adds are seen by all same-subject teachers.
   ========================================================================== */
(function (global) {
  'use strict';

  var PER_PAGE = 20;
  var QB = {
    view: 'all', q: '', sort: 'default', page: 0, activeId: null, showAnswers: true,
    f: { chapter: 'ALL', topic: 'ALL', category: 'ALL', year: 'ALL', difficulty: [], format: 'ALL', marks: [] },
    selected: [], saved: [], reports: [], metaFor: null, activity: null, dppOnly: true, dataKey: null
  };
  var REPORT_REASONS = [['WRONG_ANSWER', 'Wrong answer or key'], ['TYPO', 'Typo or wrong value'], ['WRONG_CHAPTER', 'Wrong chapter or topic'], ['UNCLEAR', 'Unclear or incomplete'], ['DUPLICATE', 'Duplicate question'], ['OTHER', 'Something else']];

  // ------------------------------------------------------------ helpers --
  function esc(v) { return typeof global.escapeHtml === 'function' ? global.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tex(v) { return typeof global.renderLatexString === 'function' ? global.renderLatexString(String(v || '')) : esc(v); }
  function $(id) { return document.getElementById(id); }
  function toast(m, t) { if (typeof global.showToast === 'function') global.showToast(m, t || 'info'); }
  function icons() { if (typeof global.initLucideIcons === 'function') global.initLucideIcons(); }
  function ico(n, s) { return '<i data-lucide="' + n + '" aria-hidden="true" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px;"></i>'; }
  function base() { return typeof global.getApiBaseUrl === 'function' ? global.getApiBaseUrl() : ''; }
  function api(path, opts) {
    opts = opts || {};
    return fetch(base() + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok || b.success === false) { var e = new Error(b.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
        return b;
      });
    });
  }
  function st() { try { return state; } catch (e) { return {}; } } // eslint-disable-line no-undef
  function tb() { try { return teacherBuilderState; } catch (e) { return {}; } } // eslint-disable-line no-undef
  function teacher() {
    var t = (tb().activeTeacher) || {};
    return {
      id: t.id || 'fac_phy_01', name: t.name || t.full_name || 'Teacher', phone: t.phone || '',
      subject: t.subjectName || t.subject || 'Physics', subjectName: t.subjectName || t.subject || 'Physics',
      subjectKey: String(t.subjectKey || tb().teacherSubjectKey || 'PHYSICS').toUpperCase(),
      department: t.department || t.subjectKey || 'PHYSICS', role: 'TEACHER'
    };
  }
  function grade() {
    var b = tb();
    return String(b.activeGrade || (String(b.selectedClassId || '').indexOf('11') === 0 ? '11' : (String(b.selectedClassId || '').indexOf('10') === 0 ? '10' : '12')));
  }
  function modeCtx() { try { return (global.HapsDualMode && global.HapsDualMode.getContext()) || {}; } catch (e) { return {}; } }
  function call(fnName, arg) { try { return typeof global[fnName] === 'function' ? global[fnName](arg) : undefined; } catch (e) { return undefined; } }
  function category(q) { return call('qbCategoryOf', q) || 'PRACTICE'; }
  function years(q) { return call('qbExamYearTags', q) || []; }
  function formatOf(q) { return call('qbFormatGroupOf', q) || 'OTHER'; }
  function label(map, k) {
    var m = null;
    try {
      /* eslint-disable no-undef */
      if (map === 'QB_CATEGORY_LABELS') m = QB_CATEGORY_LABELS;
      else if (map === 'QB_FORMAT_LABELS') m = QB_FORMAT_LABELS;
      else if (map === 'QB_DIFFICULTY_LABELS') m = QB_DIFFICULTY_LABELS;
      /* eslint-enable no-undef */
    } catch (e) { m = null; }
    return (m && m[k]) || k;
  }
  function diffOf(q) { return String(q.difficulty || 'MEDIUM').toUpperCase(); }
  function marksOf(q) { return Number(q.marks || q.marks_weightage) || (diffOf(q) === 'EASY' ? 1 : diffOf(q) === 'HARD' ? 5 : 3); }
  function ownerId(q) { return (q.injected_by && q.injected_by.faculty_id) || ''; }
  function mine(q) { return ownerId(q) && ownerId(q) === teacher().id; }
  function isMcq(q) { return Array.isArray(q.options_latex) && q.options_latex.length >= 2; }
  function correctKey(q) {
    if (!isMcq(q)) return '';
    var c = q.options_latex.find(function (o) { return o.is_correct; });
    if (c) return c.key;
    var k = String(q.correct_answer || '').trim().toUpperCase().replace(/^\(?(?:OPTION\s*)?([A-D])\)?\.?$/, '$1');
    if (/^[A-D]$/.test(k)) return k;
    var t = String(q.correct_answer_latex || q.correct_answer || '').replace(/\s+/g, '').toLowerCase();
    if (t) { var hit = q.options_latex.find(function (o) { return String(o.latex || '').replace(/\s+/g, '').toLowerCase() === t; }); if (hit) return hit.key; }
    return '';
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/^(chapter|ch)\s*\d+\s*[:.\-]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Chapters: the syllabus list (from the hidden chapter select app.js fills) plus any chapter the data uses.
  function syllabusChapters() {
    var sel = $('selectQbChapter');
    if (!sel) return [];
    return Array.prototype.slice.call(sel.options).filter(function (o) { return o.value && o.value !== 'ALL'; }).map(function (o) {
      return { num: o.value, name: o.textContent.replace(/^Ch\s*\d*\s*:\s*/i, '').trim() };
    });
  }
  function chapterKey(q, syl) {
    if (q.chapter_number !== undefined && q.chapter_number !== null && q.chapter_number !== '') return 'n:' + q.chapter_number;
    var n = norm(q.chapter_name || q.chapter);
    if (!n) return 'x:other';
    var hit = (syl || []).find(function (c) { var cn = norm(c.name); return cn && (cn === n || n.indexOf(cn) !== -1 || cn.indexOf(n) !== -1); });
    return hit ? 'n:' + hit.num : 'x:' + n;
  }
  function chapterLabel(key, syl, q) {
    if (key.indexOf('n:') === 0) { var c = (syl || []).find(function (x) { return 'n:' + x.num === key; }); return c ? 'Ch ' + c.num + ': ' + c.name : 'Chapter ' + key.slice(2); }
    return (q && (q.chapter_name || q.chapter)) || 'Other';
  }

  // ---------------------------------------------------------------- data --
  function all() {
    // The server already sends only this class, subject and board/stream.
    return st().questionBankData || [];
  }
  function reportsFor(id) { return QB.reports.filter(function (r) { return r.questionId === id; }); }
  // Questions a DPP can use: multiple choice with a marked answer, or a numerical answer.
  function dppReady(q) {
    if (isMcq(q)) return Boolean(correctKey(q));
    var f = String(q.question_format || '').toUpperCase();
    return /NUMERIC|INTEGER/.test(f) && Boolean(String(q.correct_answer_latex || q.correct_answer || '').trim());
  }
  function inList(arr, v) { return Array.isArray(arr) ? (!arr.length || arr.indexOf(v) !== -1) : (arr === 'ALL' || arr === v); }
  function matches(q, skip) {
    var f = QB.f, syl = QB.syl;
    if (QB.view === 'mine' && !mine(q)) return false;
    if (QB.view === 'saved' && QB.saved.indexOf(q.id) === -1) return false;
    if (QB.view === 'reported' && !reportsFor(q.id).length) return false;
    if (QB.activity === 'dpp' && QB.dppOnly && !dppReady(q)) return false;
    if (skip !== 'chapter' && f.chapter !== 'ALL' && chapterKey(q, syl) !== f.chapter) return false;
    if (skip !== 'topic' && f.topic !== 'ALL' && (String(q.topic || '').trim() || '—') !== f.topic) return false;
    if (skip !== 'category' && f.category !== 'ALL' && category(q) !== f.category) return false;
    if (skip !== 'year' && f.year !== 'ALL') { var y = years(q); if (f.year === 'UNTAGGED' ? y.length : y.indexOf(f.year) === -1) return false; }
    if (skip !== 'difficulty' && !inList(f.difficulty, diffOf(q))) return false;
    if (skip !== 'format' && f.format !== 'ALL' && formatOf(q) !== f.format) return false;
    if (skip !== 'marks' && !inList(f.marks, String(marksOf(q)))) return false;
    if (QB.q) {
      var hay = [q.question_latex, q.questionText, q.solution_latex, q.topic, q.subtopic, q.chapter_name, q.pyq_appearance, q.question_source].join(' ').toLowerCase();
      if (QB.q.split(/\s+/).some(function (w) { return w && hay.indexOf(w) === -1; })) return false;
    }
    return true;
  }
  function filtered() {
    var list = all().filter(function (q) { return matches(q); });
    var order = { EASY: 1, MEDIUM: 2, HARD: 3 };
    if (QB.sort === 'newest') list.sort(function (a, b) { return String(b.imported_at || b.edited_at || '').localeCompare(String(a.imported_at || a.edited_at || '')); });
    else if (QB.sort === 'marks') list.sort(function (a, b) { return marksOf(b) - marksOf(a); });
    else if (QB.sort === 'easy') list.sort(function (a, b) { return (order[diffOf(a)] || 2) - (order[diffOf(b)] || 2); });
    else if (QB.sort === 'chapter') list.sort(function (a, b) { return chapterKey(a, QB.syl).localeCompare(chapterKey(b, QB.syl), undefined, { numeric: true }); });
    return list;
  }
  // Counts for one filter, with every OTHER filter applied (so the numbers always add up).
  function counts(field, fn) {
    var m = {};
    all().filter(function (q) { return matches(q, field); }).forEach(function (q) { [].concat(fn(q)).forEach(function (k) { m[k] = (m[k] || 0) + 1; }); });
    return m;
  }
  function anyFilter() { return Object.keys(QB.f).some(function (k) { var v = QB.f[k]; return Array.isArray(v) ? v.length : v !== 'ALL'; }); }
  function resetFilters() { QB.f = { chapter: 'ALL', topic: 'ALL', category: 'ALL', year: 'ALL', difficulty: [], format: 'ALL', marks: [] }; }

  function loadMeta() {
    var t = teacher();
    var key = t.id + '|' + t.subjectKey;
    if (QB.metaFor === key) return Promise.resolve();
    QB.metaFor = key;
    return Promise.all([
      api('/api/question-bank/saved?teacherId=' + encodeURIComponent(t.id)).then(function (b) { QB.saved = b.savedIds || []; }).catch(function () { QB.saved = []; }),
      api('/api/question-bank/reports?subjectKey=' + encodeURIComponent(t.subjectKey)).then(function (b) { QB.reports = b.reports || []; }).catch(function () { QB.reports = []; })
    ]);
  }

  // ------------------------------------------------------------- layout --
  function render() {
    var host = $('qbApp');
    if (!host) return;
    bindHeader();
    QB.syl = syllabusChapters();
    // A different class, subject or board/stream means different chapters: start the filters again.
    var s = st(), key = [s.currentQbSubjectKey, s.currentQbGrade, s.currentQbModeKey].join('|');
    if (QB.dataKey !== key) { QB.dataKey = key; resetFilters(); QB.selected = []; QB.page = 0; QB.activeId = null; }
    if (!host.getAttribute('data-ready')) { host.innerHTML = shell(); host.setAttribute('data-ready', '1'); bindShell(); }
    loadMeta().then(function () { paintAll(); });
    paintAll();
  }

  var ACTS = [
    ['test', 'file-check-2', 'Make a test', 'Any question type. Tick questions, then choose when students take it.'],
    ['dpp', 'target', 'Make a DPP', 'A DPP uses only multiple-choice questions with a marked answer and numerical-answer questions, so only those are shown.'],
    ['print', 'printer', 'Print a worksheet', 'Any question type. Tick questions, then print with an optional answer key.']
  ];
  function shell() {
    return '<div class="qb2">'
      + '<div class="qb2-actbar" id="qb2ActBar"></div>'
      + '<div class="qb2-top">'
      + '<div class="qb2-views" role="tablist" aria-label="Which questions">'
      + [['all', 'All questions'], ['mine', 'Added by me'], ['saved', 'Saved'], ['reported', 'Reported']].map(function (v) { return '<button type="button" role="tab" data-qb-view="' + v[0] + '">' + v[1] + ' <span class="qb2-n" data-qb-viewn="' + v[0] + '"></span></button>'; }).join('')
      + '</div>'
      + '<div class="qb2-search"><span>' + ico('search', 16) + '</span><input id="qb2Search" class="form-control" type="search" placeholder="Search words, formulas, topics or years" aria-label="Search questions"></div>'
      + '<select id="qb2Sort" class="form-select qb2-sort" aria-label="Sort"><option value="default">Sort: Bank order</option><option value="chapter">By chapter</option><option value="newest">Newest first</option><option value="marks">Most marks first</option><option value="easy">Easy to hard</option></select>'
      + '<label class="qb2-switch" title="Show the correct answers in the list and preview"><input type="checkbox" id="qb2ShowAns" checked> Show answers</label>'
      + '</div>'
      + '<div class="qb2-frow" id="qb2Filters" aria-label="Filters"></div>'
      + '<div class="qb2-body">'
      + '<section class="qb2-list" aria-label="Questions"><div class="qb2-listhead" id="qb2ListHead"></div><div id="qb2Rows"></div><div class="qb2-pager" id="qb2Pager"></div></section>'
      + '<section class="qb2-preview" id="qb2Preview" aria-live="polite"></section>'
      + '</div>'
      + '</div>';
  }

  function bindShell() {
    document.querySelectorAll('[data-qb-view]').forEach(function (b) {
      b.addEventListener('click', function () { QB.view = b.getAttribute('data-qb-view'); QB.page = 0; paintAll(); });
    });
    var t;
    $('qb2Search').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { QB.q = e.target.value.toLowerCase().trim(); QB.page = 0; paintAll(); }, 180); });
    $('qb2Sort').addEventListener('change', function (e) { QB.sort = e.target.value; QB.page = 0; paintAll(); });
    $('qb2ShowAns').addEventListener('change', function (e) { QB.showAnswers = e.target.checked; paintRows(); paintPreview(); });
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('.qb2-dd')) closeDropdowns(); });
  }

  function paintAll() {
    if (!$('qb2Rows')) return;
    var list = filtered();
    QB.list = list;
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (QB.page >= pages) QB.page = pages - 1;
    if (!QB.activeId || !list.some(function (q) { return q.id === QB.activeId; })) QB.activeId = list.length ? (list[QB.page * PER_PAGE] || list[0]).id : null;
    var a = all();
    var n = { all: a.length, mine: a.filter(mine).length, saved: a.filter(function (q) { return QB.saved.indexOf(q.id) !== -1; }).length, reported: a.filter(function (q) { return reportsFor(q.id).length; }).length };
    document.querySelectorAll('[data-qb-view]').forEach(function (b) { var v = b.getAttribute('data-qb-view'); b.classList.toggle('on', v === QB.view); b.setAttribute('aria-selected', String(v === QB.view)); });
    document.querySelectorAll('[data-qb-viewn]').forEach(function (s) { s.textContent = n[s.getAttribute('data-qb-viewn')]; });
    var cnt = $('qbCountLabel');
    if (cnt) cnt.textContent = a.length + ' questions in this bank';
    paintActBar();
    paintFilters();
    paintRows();
    paintPreview();
    icons();
    if (global.UnisoleShell && global.UnisoleShell.refresh) global.UnisoleShell.refresh();
  }

  // --------------------------------------------------- what are you making --
  function paintActBar() {
    var bar = $('qb2ActBar');
    if (!bar) return;
    var hdr = $('mainHeader');
    bar.style.top = ((hdr && hdr.offsetHeight) || 0) + 8 + 'px'; // stay below the sticky page header
    var qs = selectedQs();
    var marks = qs.reduce(function (s, q) { return s + marksOf(q); }, 0);
    var act = ACTS.find(function (x) { return x[0] === QB.activity; });
    bar.innerHTML = '<div class="qb2-act-left"><span class="qb2-act-q">What are you making?</span><div class="qb2-acts" role="radiogroup" aria-label="What are you making">'
      + ACTS.map(function (x) { var on = QB.activity === x[0]; return '<button type="button" role="radio" aria-checked="' + on + '" class="qb2-actbtn' + (on ? ' on' : '') + '" data-qb-activity="' + x[0] + '">' + ico(x[1], 16) + ' ' + x[2] + '</button>'; }).join('')
      + '</div>'
      + '<p class="qb2-act-hint">' + (act ? esc(act[3]) + (QB.activity === 'dpp' ? ' <label class="qb2-inline"><input type="checkbox" id="qb2DppOnly"' + (QB.dppOnly ? ' checked' : '') + '> Show only DPP-ready questions</label>' : '') : 'Choose what you are making first. Then tick the questions you want.') + '</p></div>'
      + '<div class="qb2-act-right" aria-live="polite">'
      + '<div class="qb2-selcount"><b>' + qs.length + '</b> ' + (qs.length === 1 ? 'Question' : 'Questions') + ' Selected' + (qs.length ? '<small>' + marks + ' marks</small>' : '') + '</div>'
      + (act ? '<button type="button" class="btn-primary" data-qb-go-act' + (qs.length ? '' : ' disabled') + '>' + ico('arrow-right', 16) + ' Continue</button>' : '')
      + (qs.length ? '<button type="button" class="btn-secondary" data-qb-clear-sel>Clear</button>' : '')
      + '</div>';
    bar.querySelectorAll('[data-qb-activity]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-qb-activity');
        QB.activity = QB.activity === k ? null : k;
        if (QB.activity === 'dpp') {
          var drop = QB.selected.filter(function (id) { var q = byId(id); return !q || !dppReady(q); });
          if (drop.length) { QB.selected = QB.selected.filter(function (id) { return drop.indexOf(id) === -1; }); toast(drop.length + ' selected question(s) cannot go in a DPP and were unticked.', 'warning'); }
        }
        if (!QB.activity) QB.selected = [];
        QB.page = 0;
        paintAll();
      });
    });
    var only = $('qb2DppOnly');
    if (only) only.addEventListener('change', function (e) { QB.dppOnly = e.target.checked; QB.page = 0; paintAll(); });
    var go = bar.querySelector('[data-qb-go-act]');
    if (go) go.addEventListener('click', function () { if (QB.activity === 'test') makeTest(); else if (QB.activity === 'dpp') makeDpp(); else printWorksheet(); });
    var clr = bar.querySelector('[data-qb-clear-sel]');
    if (clr) clr.addEventListener('click', function () { QB.selected = []; paintAll(); });
  }

  // ------------------------------------------------------------ filters --
  function closeDropdowns() { document.querySelectorAll('.qb2-dd.open').forEach(function (d) { d.classList.remove('open'); var b = d.querySelector('.qb2-dd-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }); }
  // One dropdown: entries are [value, label, count]. Multi = tick several (marks, difficulty).
  function dropdown(key, title, entries, allLabel, multi) {
    var cur = QB.f[key];
    var sel = multi ? cur : (cur === 'ALL' ? [] : [cur]);
    var lab = !sel.length ? allLabel : sel.length === 1 ? ((entries.find(function (e) { return e[0] === sel[0]; }) || [0, sel[0]])[1]) : sel.length + ' chosen';
    return '<div class="qb2-dd' + (sel.length ? ' set' : '') + '" data-qb-dd="' + key + '">'
      + '<span class="qb2-dd-title">' + title + '</span>'
      + '<button type="button" class="qb2-dd-btn" aria-haspopup="listbox" aria-expanded="false"><span>' + esc(lab) + '</span>' + ico('chevron-down', 14) + '</button>'
      + '<div class="qb2-dd-menu" role="listbox"' + (multi ? ' aria-multiselectable="true"' : '') + '>'
      + '<button type="button" role="option" class="qb2-dd-opt' + (!sel.length ? ' on' : '') + '" data-v="ALL">' + (multi ? '<span class="qb2-tick"></span>' : '') + '<span>' + allLabel + '</span></button>'
      + entries.map(function (e) { var on = sel.indexOf(e[0]) !== -1; return '<button type="button" role="option" aria-selected="' + on + '" class="qb2-dd-opt' + (on ? ' on' : '') + (e[2] ? '' : ' empty') + '" data-v="' + esc(e[0]) + '" title="' + esc(e[1]) + '">' + (multi ? '<span class="qb2-tick">' + (on ? ico('check', 12) : '') + '</span>' : '') + '<span>' + esc(e[1]) + '</span><b>' + (e[2] || 0) + '</b></button>'; }).join('')
      + '</div></div>';
  }
  function paintFilters() {
    var box = $('qb2Filters');
    if (!box) return;
    var syl = QB.syl;
    var chap = counts('chapter', function (q) { return chapterKey(q, syl); });
    var chapters = syl.map(function (c) { return { key: 'n:' + c.num, label: 'Ch ' + c.num + ': ' + c.name, n: chap['n:' + c.num] || 0 }; });
    Object.keys(chap).forEach(function (k) { if (!chapters.some(function (c) { return c.key === k; })) { var sample = all().find(function (q) { return chapterKey(q, syl) === k; }); chapters.push({ key: k, label: chapterLabel(k, syl, sample), n: chap[k] }); } });
    var topics = counts('topic', function (q) { return String(q.topic || '').trim() || '—'; });
    var cats = counts('category', category);
    var yrs = counts('year', function (q) { var y = years(q); return y.length ? y : ['UNTAGGED']; });
    var diffs = counts('difficulty', diffOf);
    var fmts = counts('format', formatOf);
    var marks = counts('marks', function (q) { return String(marksOf(q)); });
    // keep chosen values visible even when they have 0 questions in the new chapter
    var keepMarks = (QB.f.marks || []).filter(function (m) { return !(m in marks); });
    var keepDiff = (QB.f.difficulty || []).filter(function (d) { return !(d in diffs); });
    box.innerHTML = dropdown('chapter', 'Chapter', chapters.map(function (c) { return [c.key, c.label, c.n]; }), 'All chapters')
      + dropdown('topic', 'Topic', Object.keys(topics).sort().map(function (k) { return [k, k, topics[k]]; }), 'All topics')
      + dropdown('category', 'Type', Object.keys(cats).map(function (k) { return [k, label('QB_CATEGORY_LABELS', k), cats[k]]; }), 'All types')
      + dropdown('difficulty', 'Difficulty', ['EASY', 'MEDIUM', 'HARD'].filter(function (k) { return diffs[k] || keepDiff.indexOf(k) !== -1; }).map(function (k) { return [k, label('QB_DIFFICULTY_LABELS', k), diffs[k] || 0]; }), 'Any difficulty', true)
      + dropdown('marks', 'Marks', Object.keys(marks).concat(keepMarks).sort(function (a, b) { return a - b; }).map(function (k) { return [k, k + (k === '1' ? ' mark' : ' marks'), marks[k] || 0]; }), 'Any marks', true)
      + dropdown('format', 'Format', Object.keys(fmts).map(function (k) { return [k, label('QB_FORMAT_LABELS', k), fmts[k]]; }), 'All formats')
      + dropdown('year', 'Exam & year', Object.keys(yrs).filter(function (k) { return k !== 'UNTAGGED'; }).sort(function (a, b) { return b.slice(-4).localeCompare(a.slice(-4)); }).map(function (k) { return [k, k, yrs[k]]; }).concat(yrs.UNTAGGED ? [['UNTAGGED', 'No exam year', yrs.UNTAGGED]] : []), 'All exams')
      + (anyFilter() ? '<button type="button" class="qb2-resetall" data-qb-reset>' + ico('rotate-ccw', 14) + ' Clear filters</button>' : '');
    box.querySelectorAll('[data-qb-dd]').forEach(function (dd) {
      var key = dd.getAttribute('data-qb-dd');
      var multi = Array.isArray(QB.f[key]);
      dd.querySelector('.qb2-dd-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !dd.classList.contains('open');
        closeDropdowns();
        dd.classList.toggle('open', open);
        this.setAttribute('aria-expanded', String(open));
        if (open) { var on = dd.querySelector('.qb2-dd-opt.on') || dd.querySelector('.qb2-dd-opt'); if (on) on.focus(); }
      });
      dd.querySelectorAll('.qb2-dd-opt').forEach(function (o) {
        o.addEventListener('click', function () {
          var v = o.getAttribute('data-v');
          if (multi) {
            if (v === 'ALL') QB.f[key] = [];
            else { var arr = QB.f[key].slice(), i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1); QB.f[key] = arr; }
          } else QB.f[key] = v;
          if (key === 'chapter') QB.f.topic = 'ALL';
          QB.page = 0;
          paintAll();
          if (multi && v !== 'ALL') { var again = document.querySelector('[data-qb-dd="' + key + '"]'); if (again) { again.classList.add('open'); var ob = again.querySelector('[data-v="' + v + '"]'); if (ob) ob.focus(); } }
        });
      });
      dd.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDropdowns(); dd.querySelector('.qb2-dd-btn').focus(); } });
    });
    var r = box.querySelector('[data-qb-reset]');
    if (r) r.addEventListener('click', function () { resetFilters(); QB.page = 0; paintAll(); });
  }

  // --------------------------------------------------------------- list --
  function snippet(q) {
    var s = String(q.question_latex || q.questionText || '').replace(/\[\[figure:[^\]]+\]\]/g, ' [figure] ');
    return s.length > 260 ? s.slice(0, 257) + '...' : s;
  }
  function chips(q) {
    var d = diffOf(q);
    var y = years(q);
    var rep = reportsFor(q.id).length;
    return '<span class="qb2-chip">' + esc(chapterLabel(chapterKey(q, QB.syl), QB.syl, q).replace(/^Ch\s*(\d+):.*/, 'Ch $1')) + '</span>'
      + '<span class="qb2-chip">' + marksOf(q) + 'M</span>'
      + '<span class="qb2-chip qb2-d-' + d.toLowerCase() + '">' + esc(label('QB_DIFFICULTY_LABELS', d)) + '</span>'
      + '<span class="qb2-chip qb2-chip-soft">' + esc(y.length ? y[0] + (y.length > 1 ? ' +' + (y.length - 1) : '') : label('QB_CATEGORY_LABELS', category(q)).replace(/ \(.*\)/, '')) + '</span>'
      + (mine(q) ? '<span class="qb2-chip qb2-chip-mine">Added by you</span>' : (q.injected_by && q.injected_by.faculty_name ? '<span class="qb2-chip qb2-chip-soft">By ' + esc(q.injected_by.faculty_name) + '</span>' : ''))
      + (q.ai_generated ? '<span class="qb2-chip qb2-chip-soft">AI draft</span>' : '')
      + (rep ? '<span class="qb2-chip qb2-chip-flag">' + ico('flag', 12) + ' Reported</span>' : '');
  }
  function answerText(q) {
    var ck = correctKey(q);
    if (ck) return '(' + ck + ')';
    return String(q.correct_answer_latex || (q.correct_answer && !/^[A-D]$/i.test(q.correct_answer) ? q.correct_answer : '') || '').trim();
  }
  // Why a chapter view is empty, and what would fill it.
  function emptyHelp() {
    var help = [];
    ['marks', 'difficulty', 'topic', 'category', 'format', 'year'].forEach(function (k) {
      var v = QB.f[k];
      if (Array.isArray(v) ? !v.length : v === 'ALL') return;
      var saved = QB.f[k]; QB.f[k] = Array.isArray(v) ? [] : 'ALL';
      var n = all().filter(function (q) { return matches(q); }).length;
      QB.f[k] = saved;
      if (n) help.push('<button type="button" class="btn-secondary" data-qb-clear-one="' + k + '">Remove the ' + ({ marks: 'marks', difficulty: 'difficulty', topic: 'topic', category: 'type', format: 'format', year: 'exam & year' })[k] + ' filter (' + n + ' questions)</button>');
    });
    return help.join('');
  }
  function paintRows() {
    var rows = $('qb2Rows'), head = $('qb2ListHead'), pager = $('qb2Pager');
    if (!rows) return;
    var list = QB.list || [];
    var start = QB.page * PER_PAGE;
    var page = list.slice(start, start + PER_PAGE);
    var picking = Boolean(QB.activity);
    var pickable = page.filter(function (q) { return QB.activity !== 'dpp' || dppReady(q); });
    var allOnPage = pickable.length && pickable.every(function (q) { return QB.selected.indexOf(q.id) !== -1; });
    head.innerHTML = (picking ? '<label class="qb2-check"><input type="checkbox" id="qb2PageAll"' + (allOnPage ? ' checked' : '') + (pickable.length ? '' : ' disabled') + ' aria-label="Select all on this page"></label>' : '')
      + '<span>' + (list.length ? 'Showing ' + (start + 1) + '–' + (start + page.length) + ' of ' + list.length : 'No questions') + '</span>';
    if (!list.length) {
      var chapterOnly = QB.f.chapter !== 'ALL' && !QB.q && QB.view === 'all';
      var none = QB.view === 'mine' ? 'You have not added questions here yet.' : QB.view === 'saved' ? 'Star questions to keep them here.' : QB.view === 'reported' ? 'No question has an open mistake report.' : (chapterOnly && !emptyHelp() ? 'This chapter has no questions in the bank yet.' : 'No question matches these filters.');
      rows.innerHTML = '<div class="qb2-empty">' + ico('search-x', 28) + '<p>' + none + '</p>'
        + '<div class="qb2-empty-actions">' + emptyHelp()
        + (anyFilter() || QB.q ? '<button type="button" class="btn-secondary" data-qb-empty-reset>Clear all filters</button>' : '')
        + (chapterOnly ? '<button type="button" class="btn-primary" data-qb-empty-ai>' + ico('sparkles') + ' Draft questions with AI</button>' : '')
        + '<button type="button" class="btn-' + (chapterOnly ? 'secondary' : 'primary') + '" data-qb-empty-add>' + ico('plus') + ' Add questions</button></div></div>';
      rows.querySelectorAll('[data-qb-clear-one]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-qb-clear-one'); QB.f[k] = Array.isArray(QB.f[k]) ? [] : 'ALL'; paintAll(); }); });
      var er = rows.querySelector('[data-qb-empty-reset]');
      if (er) er.addEventListener('click', function () { resetFilters(); QB.q = ''; $('qb2Search').value = ''; paintAll(); });
      var ea = rows.querySelector('[data-qb-empty-ai]');
      if (ea) ea.addEventListener('click', function () { openAiDrafts(); });
      rows.querySelector('[data-qb-empty-add]').addEventListener('click', openAddMenu);
      pager.innerHTML = '';
      icons();
      return;
    }
    rows.innerHTML = page.map(function (q, i) {
      var n = start + i + 1, sel = QB.selected.indexOf(q.id) !== -1, saved = QB.saved.indexOf(q.id) !== -1;
      var can = QB.activity !== 'dpp' || dppReady(q);
      var ans = answerText(q);
      return '<div class="qb2-row' + (q.id === QB.activeId ? ' active' : '') + (sel ? ' sel' : '') + '" data-qb-row="' + esc(q.id) + '" tabindex="0" role="button" aria-label="Question ' + n + '">'
        + (picking ? '<label class="qb2-check" data-stop' + (can ? '' : ' title="Not for a DPP: needs a marked option or a numerical answer"') + '><input type="checkbox" data-qb-sel="' + esc(q.id) + '"' + (sel ? ' checked' : '') + (can ? '' : ' disabled') + ' aria-label="Select question ' + n + '"></label>' : '')
        + '<div class="qb2-row-main"><div class="qb2-row-top"><b>Q' + n + '</b>' + chips(q) + (saved ? '<span class="qb2-star on" title="Saved">' + ico('star', 13) + '</span>' : '') + '</div>'
        + '<div class="qb2-row-text">' + tex(snippet(q)) + '</div>'
        + (QB.showAnswers && ans ? '<div class="qb2-row-ans">Answer: ' + tex(ans.length > 80 ? ans.slice(0, 77) + '...' : ans) + '</div>' : '')
        + '</div></div>';
    }).join('');
    var pages = Math.ceil(list.length / PER_PAGE);
    pager.innerHTML = pages > 1 ? '<button type="button" class="btn-secondary" data-qb-page="-1"' + (QB.page === 0 ? ' disabled' : '') + '>' + ico('chevron-left') + ' Previous</button><span>Page ' + (QB.page + 1) + ' of ' + pages + '</span><button type="button" class="btn-secondary" data-qb-page="1"' + (QB.page >= pages - 1 ? ' disabled' : '') + '>Next ' + ico('chevron-right') + '</button>' : '';
    pager.querySelectorAll('[data-qb-page]').forEach(function (b) { b.addEventListener('click', function () { QB.page += Number(b.getAttribute('data-qb-page')); var l = QB.list[QB.page * PER_PAGE]; QB.activeId = l ? l.id : QB.activeId; paintAll(); $('qb2Rows').scrollIntoView({ block: 'nearest' }); }); });
    rows.querySelectorAll('[data-qb-row]').forEach(function (r) {
      var open = function (e) { if (e.target.closest('[data-stop]')) return; QB.activeId = r.getAttribute('data-qb-row'); rows.querySelectorAll('.qb2-row').forEach(function (x) { x.classList.toggle('active', x === r); }); paintPreview(); if (global.innerWidth < 1100) $('qb2Preview').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      r.addEventListener('click', open);
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    });
    rows.querySelectorAll('[data-qb-sel]').forEach(function (c) { c.addEventListener('change', function () { toggleSelect(c.getAttribute('data-qb-sel'), c.checked); }); });
    var pa = $('qb2PageAll');
    if (pa) pa.addEventListener('change', function (e) { pickable.forEach(function (q) { toggleSelect(q.id, e.target.checked, true); }); paintRows(); paintActBar(); icons(); });
    icons();
  }
  function toggleSelect(id, on, quiet) {
    var i = QB.selected.indexOf(id);
    if (on && i === -1) QB.selected.push(id);
    if (!on && i !== -1) QB.selected.splice(i, 1);
    if (!quiet) { var row = document.querySelector('[data-qb-row="' + CSS.escape(id) + '"]'); if (row) row.classList.toggle('sel', on); paintActBar(); if (QB.activeId === id) paintPreview(); icons(); }
  }
  function byId(id) { return (st().questionBankData || []).find(function (q) { return q.id === id; }); }

  // ------------------------------------------------------------ preview --
  // Steps from the stored solution: saved AI steps, or the solution text split into its lines / "Step n" parts.
  function solutionSteps(q) {
    if (Array.isArray(q.solution_steps) && q.solution_steps.length) return q.solution_steps;
    var s = String(q.solution_latex || '').replace(/\r/g, '').trim();
    if (!s) return [];
    var parts = s.split(/\n\s*\n|\n(?=\s*(?:step\s*\d+|\d+[.)]\s))/i).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length === 1) parts = s.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    return parts.map(function (p) {
      var m = /^(?:step\s*(\d+)\s*[:.)-]?|(\d+)[.)])\s*([^\n]*)\n?([\s\S]*)$/i.exec(p);
      if (m && m[4]) return { title: m[3], text: m[4] };
      return { title: '', text: p.replace(/^step\s*\d+\s*[:.)-]?\s*/i, '') };
    });
  }
  function solutionHtml(q) {
    var steps = solutionSteps(q);
    var aiBusy = QB.aiBusy === q.id;
    var thin = isThin(q);
    var body = steps.length
      ? '<ol class="qb2-steps">' + steps.map(function (s) { return '<li>' + (s.title ? '<b>' + tex(s.title) + '</b>' : '') + '<div>' + tex(s.text).replace(/\n/g, '<br>') + '</div></li>'; }).join('') + '</ol>'
      : '<p class="qb2-muted">No worked solution has been added for this question yet.</p>';
    var aiLine = aiBusy ? '<p class="qb2-ai-busy">' + ico('loader-2', 14) + ' Writing a detailed step-by-step solution...</p>'
      : (thin ? '<button type="button" class="btn-secondary qb2-ai-btn" data-qb-ai-sol>' + ico('sparkles', 14) + ' Write a detailed solution with AI</button>'
        : (q.solution_ai ? '<p class="qb2-muted qb2-ai-note">' + ico('sparkles', 12) + ' Detailed solution written by AI and saved for everyone. <button type="button" class="qb2-linkbtn" data-qb-ai-sol data-force="1">Write it again</button></p>' : ''));
    return body + aiLine;
  }
  function isThin(q) {
    var s = String(q.solution_latex || '').replace(/\s+/g, ' ').trim();
    if (q.solution_ai) return false;
    return s.length < 90 || (/solution attached|detailed step-by-step solution|see solution|refer (to )?ncert/i.test(s) && s.length < 200);
  }
  function writeSolution(q, force) {
    if (QB.aiBusy) return;
    QB.aiBusy = q.id;
    paintPreview();
    api('/api/question-bank/questions/' + encodeURIComponent(q.id) + '/solution', { method: 'POST', body: JSON.stringify({ teacher: teacher(), force: Boolean(force) }) })
      .then(function (b) {
        if (b.question) { var list = st().questionBankData || []; var at = list.findIndex(function (x) { return x.id === q.id; }); if (at !== -1) list[at] = Object.assign({}, list[at], { solution_latex: b.question.solution_latex, solution_steps: b.question.solution_steps, solution_ai: b.question.solution_ai }); }
      })
      .catch(function (e) { toast(e.message, 'error'); QB.aiFailed = q.id; })
      .then(function () { QB.aiBusy = null; QB.solOpen = true; paintPreview(); });
  }
  function paintPreview() {
    var box = $('qb2Preview');
    if (!box) return;
    var q = QB.activeId ? byId(QB.activeId) : null;
    if (!q) { box.innerHTML = '<div class="qb2-empty">' + ico('mouse-pointer-click', 26) + '<p>Click a question to see it in full.</p></div>'; icons(); return; }
    var ck = correctKey(q), saved = QB.saved.indexOf(q.id) !== -1, sel = QB.selected.indexOf(q.id) !== -1, reps = reportsFor(q.id);
    var canPick = QB.activity && (QB.activity !== 'dpp' || dppReady(q));
    var y = years(q);
    var ansLatex = ck ? ((q.options_latex.find(function (o) { return o.key === ck; }) || {}).latex || '') : answerText(q);
    box.innerHTML = '<div class="qb2-pv-actions">'
      + (canPick ? '<button type="button" class="qb2-act' + (sel ? ' on' : '') + '" data-qb-act="select">' + ico(sel ? 'check-square' : 'square') + (sel ? ' Selected' : ' Select') + '</button>' : '')
      + '<button type="button" class="qb2-act' + (saved ? ' on' : '') + '" data-qb-act="save" aria-pressed="' + saved + '">' + ico('star') + (saved ? ' Saved' : ' Save') + '</button>'
      + (mine(q) ? '<button type="button" class="qb2-act" data-qb-act="edit">' + ico('pencil') + ' Edit</button><button type="button" class="qb2-act qb2-act-del" data-qb-act="delete">' + ico('trash-2') + ' Delete</button>' : '')
      + '<button type="button" class="qb2-act" data-qb-act="report">' + ico('flag') + ' Report a mistake</button>'
      + '</div>'
      + '<div class="qb2-pv-meta">' + chips(q) + '</div>'
      + '<div class="qb2-pv-src">' + esc(chapterLabel(chapterKey(q, QB.syl), QB.syl, q)) + (q.topic ? ' &bull; ' + esc(q.topic) : '') + (y.length ? ' &bull; ' + esc(y.join(', ')) : '') + '</div>'
      + (reps.length ? '<div class="qb2-reports">' + reps.map(function (r) { var lab = (REPORT_REASONS.find(function (x) { return x[0] === r.reason; }) || [0, r.reason])[1]; return '<div class="qb2-report">' + ico('flag', 14) + '<div><b>' + esc(lab) + '</b>' + (r.note ? ' — ' + esc(r.note) : '') + '<small>Reported by ' + esc(r.reporterName || 'a teacher') + '</small></div><button type="button" class="btn-secondary" data-qb-fix="' + esc(r.id) + '">Mark fixed</button></div>'; }).join('') + '</div>' : '')
      + '<div class="qb2-pv-q">' + tex(q.question_latex || q.questionText || '') + '</div>'
      + (isMcq(q) ? '<div class="qb2-opts">' + q.options_latex.map(function (o) { return '<div class="qb2-opt' + (QB.showAnswers && o.key === ck ? ' right' : '') + '"><b>' + esc(o.key) + '</b><span>' + tex(o.latex) + '</span>' + (QB.showAnswers && o.key === ck ? ico('check', 16) : '') + '</div>'; }).join('') + '</div>' : '')
      + (QB.showAnswers ? (ansLatex ? '<div class="qb2-answer"><b>Correct answer' + (ck ? ' (' + ck + ')' : '') + '</b> ' + tex(ansLatex) + '</div>' : '<div class="qb2-answer qb2-answer-missing"><b>Answer not marked.</b> ' + (mine(q) ? 'Edit the question to mark it.' : 'Use "Report a mistake" so the teacher who added it can mark it.') + '</div>') : '')
      + '<details class="qb2-sol"' + (QB.solOpen ? ' open' : '') + '><summary>' + ico('book-open-check') + ' Step-by-step solution</summary>' + solutionHtml(q) + '</details>';
    var det = box.querySelector('.qb2-sol');
    det.addEventListener('toggle', function (e) { QB.solOpen = e.target.open; if (e.target.open && isThin(q) && QB.aiFailed !== q.id) writeSolution(q, false); });
    if (QB.solOpen && isThin(q) && !QB.aiBusy && QB.aiFailed !== q.id && QB.autoSolFor !== q.id) { QB.autoSolFor = q.id; writeSolution(q, false); }
    box.querySelectorAll('[data-qb-ai-sol]').forEach(function (b) { b.addEventListener('click', function () { QB.aiFailed = null; writeSolution(q, b.getAttribute('data-force') === '1'); }); });
    box.querySelectorAll('[data-qb-act]').forEach(function (b) { b.addEventListener('click', function () { previewAction(b.getAttribute('data-qb-act'), q); }); });
    box.querySelectorAll('[data-qb-fix]').forEach(function (b) { b.addEventListener('click', function () { fixReport(b.getAttribute('data-qb-fix')); }); });
    icons();
  }
  function previewAction(a, q) {
    if (a === 'select') { toggleSelect(q.id, QB.selected.indexOf(q.id) === -1, true); paintAll(); return; }
    if (a === 'save') {
      var on = QB.saved.indexOf(q.id) === -1;
      api('/api/question-bank/saved', { method: 'POST', body: JSON.stringify({ teacher: teacher(), questionId: q.id, saved: on }) })
        .then(function (b) { QB.saved = b.savedIds || []; toast(on ? 'Saved to your questions.' : 'Removed from saved.', 'success'); paintAll(); })
        .catch(function (e) { toast(e.message, 'error'); });
      return;
    }
    if (a === 'edit') { openQuestionForm(q); return; }
    if (a === 'delete') {
      if (!global.confirm('Delete this question from the bank for every teacher? This cannot be undone.')) return;
      api('/api/question-bank/questions/' + encodeURIComponent(q.id), { method: 'DELETE', body: JSON.stringify({ teacher: teacher() }) })
        .then(function () {
          st().questionBankData = (st().questionBankData || []).filter(function (x) { return x.id !== q.id; });
          QB.selected = QB.selected.filter(function (x) { return x !== q.id; });
          QB.activeId = null;
          toast('Question deleted.', 'success');
          paintAll();
        }).catch(function (e) { toast(e.message, 'error'); });
      return;
    }
    if (a === 'report') openReport(q);
  }

  // ------------------------------------------------------------- report --
  function modal(title, inner, actions, wide) {
    var ov = document.createElement('div');
    ov.className = 'qb2-modal';
    ov.innerHTML = '<div class="qb2-dialog glass-card' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="qb2-dhead"><h3>' + esc(title) + '</h3><button type="button" class="qb2-x" data-qb-close aria-label="Close">' + ico('x', 18) + '</button></div><div class="qb2-dbody">' + inner + '</div><div class="qb2-dfoot">' + (actions || '') + '</div></div>';
    document.body.appendChild(ov);
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onEsc); };
    var onEsc = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    ov.querySelector('[data-qb-close]').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    icons();
    return { el: ov, close: close, $: function (s) { return ov.querySelector(s); } };
  }
  function openReport(q) {
    var m = modal('Report a mistake', '<p class="qb2-muted">The teacher who added it and your subject colleagues will see this on the question.</p>'
      + '<div class="qb2-reasons">' + REPORT_REASONS.map(function (r, i) { return '<label><input type="radio" name="qb2Reason" value="' + r[0] + '"' + (i === 0 ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '</div>'
      + '<label class="qb2-field">What is wrong? (optional)<textarea class="form-control" id="qb2RepNote" rows="3" maxlength="600" placeholder="e.g. Answer should be B, the options are swapped."></textarea></label>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-primary" data-qb-send>' + ico('flag') + ' Send report</button>');
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-send]').addEventListener('click', function () {
      var reason = (m.$('input[name="qb2Reason"]:checked') || {}).value || 'OTHER';
      api('/api/question-bank/reports', { method: 'POST', body: JSON.stringify({ teacher: teacher(), questionId: q.id, reason: reason, note: m.$('#qb2RepNote').value }) })
        .then(function (b) { QB.reports.push(b.report); m.close(); toast('Thanks, the mistake was reported.', 'success'); paintAll(); })
        .catch(function (e) { toast(e.message, 'error'); });
    });
  }
  function fixReport(id) {
    api('/api/question-bank/reports/' + encodeURIComponent(id) + '/resolve', { method: 'POST', body: JSON.stringify({ teacher: teacher() }) })
      .then(function () { QB.reports = QB.reports.filter(function (r) { return r.id !== id; }); toast('Marked as fixed.', 'success'); paintAll(); })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  // -------------------------------------------------- selection actions --
  function selectedQs() { return QB.selected.map(byId).filter(Boolean); }
  function classes() { try { return typeof global.scopedPaperClassList === 'function' ? global.scopedPaperClassList() : []; } catch (e) { return []; } }
  function classLabel(c) { try { return typeof global.paperClassLabel === 'function' ? global.paperClassLabel(c) : c.name; } catch (e) { return c.name || c.id; } }
  function classSelect(id) {
    var cs = classes();
    var cur = String(tb().selectedClassId || '');
    if (!cs.length) return '<input class="form-control" id="' + id + '" value="' + esc(cur || '12-NonMed') + '">';
    return '<select class="form-select" id="' + id + '">' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(classLabel(c)) + '</option>'; }).join('') + '</select>';
  }
  function defaultTitle(qs) {
    var keys = qs.map(function (q) { return chapterKey(q, QB.syl); }).filter(function (k, i, a) { return a.indexOf(k) === i; });
    return keys.length === 1 ? chapterLabel(keys[0], QB.syl, qs[0]).replace(/^Ch\s*\d+:\s*/, '') + ' test' : teacher().subjectName + ' test';
  }

  function makeTest() {
    var qs = selectedQs();
    var marks = qs.reduce(function (s, q) { return s + marksOf(q); }, 0);
    var mins = Math.max(10, Math.round(qs.reduce(function (s, q) { return s + (Number(q.benchmark_time_seconds) || marksOf(q) * 90); }, 0) / 60 / 5) * 5);
    var m = modal('Make a test from ' + qs.length + ' questions',
      '<div class="qb2-grid2"><label class="qb2-field">Test title<input class="form-control" id="qb2TTitle" maxlength="120" value="' + esc(defaultTitle(qs)) + '"></label>'
      + '<label class="qb2-field">Class' + classSelect('qb2TClass') + '</label>'
      + '<label class="qb2-field">Duration (minutes)<input class="form-control" type="number" min="5" max="300" id="qb2TMins" value="' + mins + '"></label>'
      + '<div class="qb2-field"><span>Total</span><div class="qb2-static">' + qs.length + ' questions &bull; ' + marks + ' marks</div></div></div>'
      + '<p class="qb2-muted">Next you choose when students can take it (a fixed time slot, open between dates with a time limit each, or straight away).</p>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-primary" data-qb-go>' + ico('calendar-clock') + ' Next: choose when</button>');
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-go]').addEventListener('click', function () {
      var title = m.$('#qb2TTitle').value.trim();
      if (!title) { m.$('#qb2TTitle').focus(); return; }
      var section = m.$('#qb2TClass').value;
      var t = teacher();
      var btn = m.$('[data-qb-go]');
      btn.disabled = true;
      api('/api/assessments', { method: 'POST', body: JSON.stringify({
        status: 'DRAFT', title: title, section: section, grade: (String(section).match(/^\d+/) || [grade()])[0],
        board: modeCtx().board || 'CBSE', subject: t.subjectName, teacherName: t.name, teacherSubjectKey: t.subjectKey,
        durationMinutes: Number(m.$('#qb2TMins').value) || mins, totalMarks: marks,
        questions: qs.map(function (q) { return Object.assign({}, q, { question_type: isMcq(q) ? 'MCQ_SINGLE' : (q.question_format || 'SHORT_ANSWER'), correct_answer: correctKey(q) || q.correct_answer_latex || q.correct_answer || '' }); })
      }) }).then(function (b) {
        m.close();
        QB.selected = []; QB.activity = null; paintAll();
        try { st().currentDraftTest = b.assessment; } catch (e) { /* ignore */ }
        if (typeof global.publishDraftTest === 'function') global.publishDraftTest(b.assessment.id);
        else toast('Draft test created. Publish it from Create Test.', 'success');
      }).catch(function (e) { btn.disabled = false; toast(e.message, 'error'); });
    });
  }

  function makeDpp() {
    var qs = selectedQs();
    var mcq = qs.filter(dppReady);
    if (!mcq.length) { toast('A DPP needs multiple-choice questions with a marked answer or numerical-answer questions.', 'warning'); return; }
    var m = modal('Make a DPP from ' + mcq.length + ' questions',
      (mcq.length < qs.length ? '<p class="qb2-note">' + (qs.length - mcq.length) + ' selected question(s) cannot go in a DPP and will be left out.</p>' : '')
      + '<div class="qb2-grid2"><label class="qb2-field">DPP title<input class="form-control" id="qb2DTitle" maxlength="120" value="' + esc(defaultTitle(mcq).replace(/ test$/, ' DPP')) + '"></label>'
      + '<label class="qb2-field">Class' + classSelect('qb2DClass') + '</label>'
      + '<label class="qb2-field">Marking<select class="form-select" id="qb2DMark"><option value="4,-1">+4 / -1 (JEE / NEET)</option><option value="1,0">+1 / 0 (no negative)</option></select></label>'
      + '<label class="qb2-field">Time limit (minutes)<input class="form-control" type="number" min="5" max="180" id="qb2DMins" value="' + Math.max(5, Math.min(180, mcq.length * 2)) + '"></label></div>'
      + (global.SchedulePicker ? global.SchedulePicker.html('qb2DSched', { what: 'DPP', minutes: Math.max(5, mcq.length * 2), mode: 'NONE' }) : ''),
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-primary" data-qb-go>' + ico('send') + ' Assign DPP</button>', true);
    if (global.SchedulePicker) global.SchedulePicker.bind(m.el, 'qb2DSched');
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-go]').addEventListener('click', function () {
      var sched = null;
      if (global.SchedulePicker) { try { sched = global.SchedulePicker.read(m.el, 'qb2DSched'); } catch (e) { toast(e.message, 'warning'); return; } }
      var t = teacher(), ctx = modeCtx(), mk = m.$('#qb2DMark').value.split(',');
      var btn = m.$('[data-qb-go]');
      btn.disabled = true;
      api('/api/dpp', { method: 'POST', body: JSON.stringify({
        teacher: t, subjectKey: t.subjectKey, subjectName: t.subjectName, section: m.$('#qb2DClass').value,
        title: m.$('#qb2DTitle').value.trim(), timeLimitMinutes: Number(m.$('#qb2DMins').value) || 20, schedule: sched,
        correctMarks: Number(mk[0]), incorrectMarks: Number(mk[1]), mode: ctx.mode || null, track: ctx.mode === 'COMPETITIVE' ? ctx.stream : ctx.board,
        source: 'CUSTOM',
        questions: mcq.map(function (q) {
          var ck = correctKey(q);
          var base = { question_latex: q.question_latex, solution_latex: q.solution_latex || '', topic: q.topic, chapter_name: q.chapter_name, source_question_id: q.id };
          if (!isMcq(q)) return Object.assign(base, { question_type: 'NUMERICAL', numerical_answer: String(q.correct_answer_latex || q.correct_answer || '').trim() });
          return Object.assign(base, { options_latex: q.options_latex.map(function (o) { return { key: o.key, latex: o.latex, is_correct: o.key === ck }; }) });
        })
      }) }).then(function (b) {
        m.close();
        QB.selected = []; QB.activity = null; paintAll();
        toast('DPP "' + b.dpp.title + '" assigned (' + b.dpp.questions.length + ' questions).' + (sched && global.SchedulePicker ? ' Students see it ' + global.SchedulePicker.describe(sched) + '.' : ''), 'success');
      }).catch(function (e) { btn.disabled = false; toast(e.message, 'error'); });
    });
  }

  function printWorksheet() {
    var qs = selectedQs();
    var m = modal('Print a worksheet', '<label class="qb2-field">Title<input class="form-control" id="qb2PTitle" maxlength="120" value="' + esc(defaultTitle(qs).replace(/ test$/, ' worksheet')) + '"></label>'
      + '<label class="qb2-check-line"><input type="checkbox" id="qb2PKey" checked> Add an answer key at the end</label>'
      + '<label class="qb2-check-line"><input type="checkbox" id="qb2PSol"> Add worked solutions to the answer key</label>'
      + '<label class="qb2-check-line"><input type="checkbox" id="qb2PMarks" checked> Show marks next to each question</label>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-primary" data-qb-go>' + ico('printer') + ' Preview &amp; print</button>');
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-go]').addEventListener('click', function () {
      var title = m.$('#qb2PTitle').value.trim() || 'Worksheet';
      var key = m.$('#qb2PKey').checked, sol = m.$('#qb2PSol').checked, showM = m.$('#qb2PMarks').checked;
      var total = qs.reduce(function (s, q) { return s + marksOf(q); }, 0);
      var body = '<p class="pr-meta">' + qs.length + ' questions' + (showM ? ' &bull; ' + total + ' marks' : '') + ' &bull; Name: ____________________ &nbsp; Class: ________</p>'
        + qs.map(function (q, i) {
          return '<section class="pr-item"><div class="pr-qrow"><span class="pr-no">' + (i + 1) + '.</span><div class="pr-q">' + tex(q.question_latex || '') + '</div>' + (showM ? '<span class="pr-marks">[' + marksOf(q) + ']</span>' : '') + '</div>'
            + (isMcq(q) ? '<div class="pr-opts">' + q.options_latex.map(function (o) { return '<div class="pr-opt"><span class="pr-ol">(' + esc(o.key) + ')</span><span class="pr-ot">' + tex(o.latex) + '</span></div>'; }).join('') + '</div>' : '<div class="pr-lines"></div>') + '</section>';
        }).join('')
        + (key ? '<h2 class="pr-break">Answer key</h2><table class="pr-key"><thead><tr><th>Q</th><th>Answer</th>' + (sol ? '<th>Solution</th>' : '') + '</tr></thead><tbody>' + qs.map(function (q, i) {
          var ck = correctKey(q);
          var txt = ck ? '(' + ck + ') ' + tex((q.options_latex.find(function (o) { return o.key === ck; }) || {}).latex || '') : tex(answerText(q) || '—');
          var steps = sol ? solutionSteps(q) : [];
          return '<tr><td class="pr-kno">' + (i + 1) + '</td><td class="pr-kans">' + txt + '</td>' + (sol ? '<td class="pr-ksol">' + (steps.length ? steps.map(function (st) { return (st.title ? '<b>' + tex(st.title) + '</b> ' : '') + tex(st.text); }).join('<br>') : '—') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table>' : '');
      m.close();
      var K = global.UnisoleKit;
      if (K && K.printDoc) K.printDoc(title, '<style>.pr-item{margin:0 0 14px;break-inside:avoid}.pr-qrow{display:flex;gap:8px;align-items:flex-start}.pr-no{font-weight:700;min-width:22px}.pr-q{flex:1}.pr-marks{font-weight:700;white-space:nowrap}.pr-opts{margin:6px 0 0 30px;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}.pr-opt{display:flex;gap:6px;align-items:baseline}.pr-ol{font-weight:600;min-width:24px}.pr-lines{height:60px;border-bottom:1px dashed #bbb;margin:8px 0 0 30px}.pr-break{break-before:page;margin-top:24px}.pr-key{width:100%;border-collapse:collapse}.pr-key th,.pr-key td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.pr-kno{width:36px;font-weight:700}.pr-kans{width:30%}.pr-key tr{break-inside:avoid}.pr-ksol{font-size:.92em;color:#333}.pr-meta{color:#444}</style>' + body, teacher().subjectName + ' • ' + (classLabel({ id: tb().selectedClassId, name: tb().selectedClassId }) || ''));
      else toast('Printing is not available here.', 'warning');
    });
  }

  // ------------------------------------------------------ add questions --
  function openAddMenu(e) {
    var anchor = e && e.currentTarget;
    var old = $('qb2AddMenu');
    if (old) { old.parentNode.removeChild(old); return; }
    var menu = document.createElement('div');
    menu.id = 'qb2AddMenu';
    menu.className = 'qb2-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<button type="button" role="menuitem" data-qb-add="type">' + ico('pencil-line', 18) + '<span><b>Type a question</b><small>One question with options, answer and solution</small></span></button>'
      + '<button type="button" role="menuitem" data-qb-add="import">' + ico('clipboard-paste', 18) + '<span><b>Paste text, PDF or photos</b><small>Many questions from a paper; AI reads them, you check</small></span></button>'
      + '<button type="button" role="menuitem" data-qb-add="ai">' + ico('sparkles', 18) + '<span><b>Draft with AI</b><small>AI writes questions for a chapter; you check and save</small></span></button>'
      + '<button type="button" role="menuitem" data-qb-add="sheet">' + ico('sheet', 18) + '<span><b>Excel or CSV file</b><small>Fill our template, upload many at once</small></span></button>';
    document.body.appendChild(menu);
    var r = anchor ? anchor.getBoundingClientRect() : { right: global.innerWidth - 20, bottom: 120 };
    menu.style.top = (r.bottom + global.scrollY + 6) + 'px';
    menu.style.left = Math.max(8, r.right + global.scrollX - 330) + 'px';
    var close = function () { if (menu.parentNode) menu.parentNode.removeChild(menu); document.removeEventListener('mousedown', outside); };
    var outside = function (ev) { if (!menu.contains(ev.target) && ev.target !== anchor) close(); };
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);
    menu.querySelectorAll('[data-qb-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        close();
        var k = b.getAttribute('data-qb-add');
        if (k === 'type') openQuestionForm(null);
        else if (k === 'import') { if (typeof global.openInjectQuestionModal === 'function') global.openInjectQuestionModal(); }
        else if (k === 'ai') openAiDrafts();
        else openSheetImport();
      });
    });
    icons();
    var first = menu.querySelector('button'); if (first) first.focus();
  }

  var CATS = [['PRACTICE', 'Practice / my own'], ['PYQ', 'Previous year (board)'], ['NCERT_EXERCISE', 'NCERT exercise'], ['NCERT_EXAMPLE', 'NCERT solved example'], ['EXEMPLAR', 'NCERT Exemplar'], ['COMPETITIVE', 'JEE / NEET']];
  function categoryCode(cat, track, isComp) {
    if (cat === 'PYQ') return (track || 'CBSE') + '_PYQ';
    if (cat === 'NCERT_EXERCISE') return 'NCERT_EXERCISE';
    if (cat === 'NCERT_EXAMPLE') return 'NCERT_EXAMPLE';
    if (cat === 'EXEMPLAR') return 'NCERT_EXEMPLAR';
    if (cat === 'COMPETITIVE' || isComp) return 'COMPETITIVE_OTHER';
    return 'PRACTICE';
  }
  function chapterOptions(cur) {
    var syl = QB.syl && QB.syl.length ? QB.syl : syllabusChapters();
    var names = syl.map(function (c) { return c.name; });
    all().forEach(function (q) { var n = q.chapter_name || q.chapter; if (n && names.indexOf(n) === -1 && !syl.some(function (c) { return norm(c.name) === norm(n); })) names.push(n); });
    if (cur && names.indexOf(cur) === -1 && !names.some(function (n) { return norm(n) === norm(cur); })) names.unshift(cur);
    return names.map(function (n) { return '<option' + (cur && norm(n) === norm(cur) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
  }

  // Type one question (also used to edit a question you added).
  function openQuestionForm(q) {
    var edit = Boolean(q);
    var mcq = edit ? isMcq(q) : true;
    var ck = edit ? correctKey(q) : 'A';
    var opts = edit && isMcq(q) ? q.options_latex : [{}, {}, {}, {}];
    while (opts.length < 4) opts = opts.concat([{}]);
    var topics = all().map(function (x) { return String(x.topic || '').trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort();
    var m = modal(edit ? 'Edit question' : 'Type a question',
      '<div class="qb2-form">'
      + '<div class="qb2-seg" role="radiogroup" aria-label="Answer type"><label><input type="radio" name="qb2Type" value="MCQ"' + (mcq ? ' checked' : '') + '> Multiple choice</label><label><input type="radio" name="qb2Type" value="WRITTEN"' + (mcq ? '' : ' checked') + '> Written answer</label></div>'
      + '<label class="qb2-field">Question <small>Maths: put it between $ signs, e.g. $F = \\frac{kq_1q_2}{r^2}$</small><textarea class="form-control" id="qb2FQ" rows="4" maxlength="8000">' + esc(edit ? q.question_latex : '') + '</textarea></label>'
      + '<div class="qb2-preview-box" id="qb2FQPrev" aria-live="polite"></div>'
      + (edit ? '' : '<label class="qb2-field">Picture (optional)<input type="file" accept="image/*" id="qb2FImg" class="form-control"></label>')
      + '<div id="qb2FOpts"' + (mcq ? '' : ' hidden') + '><span class="qb2-flabel">Options <small>(choose the correct one)</small></span>'
      + ['A', 'B', 'C', 'D'].map(function (k, i) { return '<div class="qb2-optrow"><label class="qb2-radio" title="Correct answer"><input type="radio" name="qb2Correct" value="' + k + '"' + (ck === k ? ' checked' : '') + '><b>' + k + '</b></label><input class="form-control" data-qb-opt="' + k + '" maxlength="1500" placeholder="Option ' + k + '" value="' + esc(opts[i].latex || '') + '"></div>'; }).join('') + '</div>'
      + '<label class="qb2-field" id="qb2FAnsWrap"' + (mcq ? ' hidden' : '') + '>Correct answer<textarea class="form-control" id="qb2FAns" rows="2" maxlength="3000">' + esc(edit && !isMcq(q) ? (q.correct_answer_latex || '') : '') + '</textarea></label>'
      + '<label class="qb2-field">Solution (optional) <small>One step per line</small><textarea class="form-control" id="qb2FSol" rows="4" maxlength="12000">' + esc(edit ? q.solution_latex || '' : '') + '</textarea></label>'
      + '<div class="qb2-grid3">'
      + '<label class="qb2-field">Chapter<select class="form-select" id="qb2FCh">' + chapterOptions(edit ? (q.chapter_name || q.chapter) : (QB.f.chapter !== 'ALL' ? chapterLabel(QB.f.chapter, QB.syl).replace(/^Ch\s*\d+:\s*/, '') : '')) + '</select></label>'
      + '<label class="qb2-field">Topic<input class="form-control" id="qb2FTopic" list="qb2Topics" maxlength="160" value="' + esc(edit ? q.topic || '' : '') + '"><datalist id="qb2Topics">' + topics.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></label>'
      + '<label class="qb2-field">Difficulty<select class="form-select" id="qb2FDiff">' + ['EASY', 'MEDIUM', 'HARD'].map(function (d) { return '<option value="' + d + '"' + ((edit ? diffOf(q) : 'MEDIUM') === d ? ' selected' : '') + '>' + label('QB_DIFFICULTY_LABELS', d) + '</option>'; }).join('') + '</select></label>'
      + '<label class="qb2-field">Marks<input class="form-control" type="number" min="1" max="20" id="qb2FMarks" value="' + (edit ? marksOf(q) : (mcq ? 1 : 3)) + '"></label>'
      + (edit ? '' : '<label class="qb2-field">Type of question<select class="form-select" id="qb2FCat">' + CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></label>'
        + '<label class="qb2-field">Exam year (optional)<input class="form-control" id="qb2FYear" inputmode="numeric" maxlength="4" placeholder="e.g. 2024"></label>')
      + '</div></div>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button>' + (edit ? '' : '<button type="button" class="btn-secondary" data-qb-save="again">Save &amp; add another</button>') + '<button type="button" class="btn-primary" data-qb-save="done">' + ico('check') + (edit ? ' Save changes' : ' Save question') + '</button>', true);
    var $m = m.$;
    var prev = function () { $m('#qb2FQPrev').innerHTML = $m('#qb2FQ').value.trim() ? tex($m('#qb2FQ').value) : '<span class="qb2-muted">The question will appear here as students see it.</span>'; };
    $m('#qb2FQ').addEventListener('input', prev);
    prev();
    m.el.querySelectorAll('input[name="qb2Type"]').forEach(function (r) {
      r.addEventListener('change', function () { var isM = $m('input[name="qb2Type"]:checked').value === 'MCQ'; $m('#qb2FOpts').hidden = !isM; $m('#qb2FAnsWrap').hidden = isM; });
    });
    $m('[data-qb-close2]').addEventListener('click', m.close);
    var image = null;
    if (!edit) {
      $m('#qb2FImg').addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) { image = null; return; }
        var K = global.UnisoleKit;
        (K && K.readImage ? K.readImage(f) : new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(f); }))
          .then(function (d) { image = d; toast('Picture added. It will be shown under the question.', 'info'); })
          .catch(function () { toast('That picture could not be read.', 'warning'); });
      });
    }
    m.el.querySelectorAll('[data-qb-save]').forEach(function (b) {
      b.addEventListener('click', function () {
        var again = b.getAttribute('data-qb-save') === 'again';
        var isM = $m('input[name="qb2Type"]:checked').value === 'MCQ';
        var qText = $m('#qb2FQ').value.trim();
        if (qText.length < 5) { toast('Type the question first.', 'warning'); $m('#qb2FQ').focus(); return; }
        var options = [];
        if (isM) {
          var corr = ($m('input[name="qb2Correct"]:checked') || {}).value;
          ['A', 'B', 'C', 'D'].forEach(function (k) { var v = $m('[data-qb-opt="' + k + '"]').value.trim(); if (v) options.push({ key: k, latex: v, is_correct: k === corr }); });
          if (options.length < 2) { toast('Give at least two options.', 'warning'); return; }
          if (!options.some(function (o) { return o.is_correct; })) { toast('Choose the correct option (the circle next to it).', 'warning'); return; }
          options.forEach(function (o, i) { o.key = 'ABCD'[i]; });
        } else if (!$m('#qb2FAns').value.trim()) { toast('Write the correct answer.', 'warning'); return; }
        var marks = Number($m('#qb2FMarks').value) || 1;
        var common = {
          question_latex: qText, options_latex: options, solution_latex: $m('#qb2FSol').value.trim(),
          chapter_name: $m('#qb2FCh').value, chapter: $m('#qb2FCh').value, topic: $m('#qb2FTopic').value.trim() || $m('#qb2FCh').value,
          difficulty: $m('#qb2FDiff').value, marks: marks
        };
        b.disabled = true;
        if (edit) {
          api('/api/question-bank/questions/' + encodeURIComponent(q.id), { method: 'PUT', body: JSON.stringify({ teacher: teacher(), changes: {
            question_latex: common.question_latex, options: options, correct_answer_latex: isM ? undefined : $m('#qb2FAns').value.trim(),
            solution_latex: common.solution_latex, chapter: common.chapter_name, topic: common.topic, difficulty: common.difficulty, marks: marks
          } }) }).then(function (r) {
            var list = st().questionBankData || [];
            var at = list.findIndex(function (x) { return x.id === q.id; });
            if (at !== -1) list[at] = r.question;
            m.close(); toast('Question updated.', 'success'); paintAll();
          }).catch(function (e) { b.disabled = false; toast(e.message, 'error'); });
          return;
        }
        var withFig = image ? api('/api/questions/figures', { method: 'POST', body: JSON.stringify({ dataUrl: image, teacherSubjectKey: teacher().subjectKey, description: 'Figure for a typed question' }) }).then(function (r) { return r.token; }).catch(function () { toast('The picture could not be saved; the question is saved without it.', 'warning'); return ''; }) : Promise.resolve('');
        withFig.then(function (token) {
          var sq = Object.assign({}, common, {
            question_latex: token ? qText + '\n' + token : qText,
            question_format: isM ? 'MCQ_SINGLE' : (marks >= 5 ? 'LONG_DERIVATION' : 'SHORT_ANSWER'),
            correct_answer: isM ? options.find(function (o) { return o.is_correct; }).key : null,
            correct_answer_latex: isM ? options.find(function (o) { return o.is_correct; }).latex : $m('#qb2FAns').value.trim(),
            pyq_year: $m('#qb2FYear').value.trim() || undefined
          });
          return saveQuestions([sq], $m('#qb2FCat').value);
        }).then(function (n) {
          b.disabled = false;
          if (!n) return;
          toast('Question saved to the bank.', 'success');
          if (again) {
            $m('#qb2FQ').value = ''; $m('#qb2FSol').value = ''; $m('#qb2FAns').value = ''; image = null; if ($m('#qb2FImg')) $m('#qb2FImg').value = '';
            m.el.querySelectorAll('[data-qb-opt]').forEach(function (x) { x.value = ''; });
            prev(); $m('#qb2FQ').focus();
          } else m.close();
        }).catch(function (e) { b.disabled = false; toast(e.message, 'error'); });
      });
    });
    $m('#qb2FQ').focus();
  }

  // Sends structured questions through the same import used for papers (subject lock, de-duplication).
  function saveQuestions(list, cat) {
    var t = teacher(), ctx = modeCtx();
    var mode = String(ctx.mode || 'BOARD').toUpperCase();
    var track = mode === 'BOARD' ? (ctx.board || 'CBSE') : (ctx.stream || 'JEE');
    var chunks = [];
    for (var i = 0; i < list.length; i += 100) chunks.push(list.slice(i, i + 100));
    var added = 0;
    return chunks.reduce(function (p, chunk) {
      return p.then(function () {
        return api('/api/questions/inject', { method: 'POST', body: JSON.stringify({
          teacher: t, targetSubject: t.subjectName, targetSubjectKey: t.subjectKey, subject: t.subjectName,
          mode: mode, track: track, grade: grade(), category: categoryCode(cat, track, mode === 'COMPETITIVE'), sourceType: 'text', action: 'APPROVE',
          questions: chunk
        }) }).then(function (b) {
          added += b.count || chunk.length;
          // Show the new questions straight away (the full reload below follows).
          var fresh = Array.isArray(b.questions) ? b.questions : (b.question ? [b.question] : []);
          var data = st().questionBankData || (st().questionBankData = []);
          fresh.forEach(function (q) { if (q && q.id && !data.some(function (x) { return x.id === q.id; })) data.unshift(q); });
          paintAll();
        });
      });
    }, Promise.resolve()).then(function () {
      if (typeof global.loadQuestionBankView === 'function') global.loadQuestionBankView(true);
      return added;
    });
  }

  // -------------------------------------------------- AI question drafts --
  // For chapters with few or no questions: the AI drafts questions, the teacher ticks the good ones and saves them.
  function openAiDrafts() {
    var ch = QB.f.chapter !== 'ALL' ? chapterLabel(QB.f.chapter, QB.syl).replace(/^Ch\s*\d+:\s*/, '') : '';
    var comp = String(modeCtx().mode || '').toUpperCase() === 'COMPETITIVE';
    var m = modal('Draft questions with AI', '<p class="qb2-muted">The AI drafts new questions for this chapter. Check each one, untick any you do not want, then save. Nothing is added until you save.</p>'
      + '<div class="qb2-grid3"><label class="qb2-field">Chapter<select class="form-select" id="qb2AiCh">' + chapterOptions(ch) + '</select></label>'
      + '<label class="qb2-field">How many<select class="form-select" id="qb2AiN"><option>5</option><option selected>10</option><option>3</option></select></label>'
      + '<label class="qb2-field">Difficulty<select class="form-select" id="qb2AiD"><option value="MIXED">Mixed</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label></div>'
      + '<label class="qb2-field">Topic (optional)<input class="form-control" id="qb2AiT" maxlength="160" placeholder="e.g. Significant figures"></label>'
      + (comp ? '' : '<label class="qb2-check-line"><input type="checkbox" id="qb2AiMix"> Include short written questions (not only multiple choice)</label>')
      + '<div id="qb2AiOut"></div>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-secondary" data-qb-ai-make>' + ico('sparkles') + ' Draft questions</button><button type="button" class="btn-primary" data-qb-ai-save disabled>' + ico('check') + ' Save ticked questions</button>', true);
    var drafts = [];
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-ai-make]').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      m.$('#qb2AiOut').innerHTML = '<p class="qb2-ai-busy">' + ico('loader-2', 14) + ' Drafting questions...</p>'; icons();
      api('/api/question-bank/generate', { method: 'POST', body: JSON.stringify({ teacher: teacher(), chapter: m.$('#qb2AiCh').value, topic: m.$('#qb2AiT').value.trim(), count: Number(m.$('#qb2AiN').value), difficulty: m.$('#qb2AiD').value, grade: grade(), mode: modeCtx().mode || 'BOARD', kind: m.$('#qb2AiMix') && m.$('#qb2AiMix').checked ? 'MIXED' : 'MCQ' }) })
        .then(function (b) {
          drafts = b.questions || [];
          m.$('#qb2AiOut').innerHTML = '<div class="qb2-drafts">' + drafts.map(function (q, i) {
            var ck = q.correct_answer;
            return '<label class="qb2-draft"><input type="checkbox" data-qb-draft="' + i + '" checked><div><div class="qb2-pv-q">' + tex(q.question_latex) + '</div>'
              + (q.options_latex.length ? '<div class="qb2-opts">' + q.options_latex.map(function (o) { return '<div class="qb2-opt' + (o.key === ck ? ' right' : '') + '"><b>' + o.key + '</b><span>' + tex(o.latex) + '</span></div>'; }).join('') + '</div>' : '<div class="qb2-answer"><b>Answer</b> ' + tex(q.correct_answer_latex) + '</div>')
              + (q.solution_latex ? '<details class="qb2-sol"><summary>Solution</summary><div class="qb2-soltext">' + tex(q.solution_latex) + '</div></details>' : '')
              + '<small class="qb2-muted">' + esc(q.topic) + ' &bull; ' + esc(label('QB_DIFFICULTY_LABELS', q.difficulty)) + ' &bull; ' + q.marks + 'M</small></div></label>';
          }).join('') + '</div>';
          m.$('[data-qb-ai-save]').disabled = !drafts.length;
          icons();
        })
        .catch(function (e) { m.$('#qb2AiOut').innerHTML = '<p class="qb2-note">' + esc(e.message) + '</p>'; })
        .then(function () { btn.disabled = false; });
    });
    m.$('[data-qb-ai-save]').addEventListener('click', function () {
      var keep = Array.prototype.filter.call(m.el.querySelectorAll('[data-qb-draft]'), function (c) { return c.checked; }).map(function (c) { return drafts[Number(c.getAttribute('data-qb-draft'))]; });
      if (!keep.length) { toast('Tick at least one question to save.', 'warning'); return; }
      var btn = this; btn.disabled = true;
      saveQuestions(keep, comp ? 'COMPETITIVE' : 'PRACTICE').then(function (n) { m.close(); toast(n + ' question' + (n === 1 ? '' : 's') + ' added to the bank.', 'success'); })
        .catch(function (e) { btn.disabled = false; toast(e.message, 'error'); });
    });
  }

  // ------------------------------------------------- Excel / CSV import --
  var COLS = ['type', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'solution', 'chapter', 'topic', 'difficulty', 'marks', 'source', 'year'];
  function templateCsv() {
    var ch = (QB.syl[0] && QB.syl[0].name) || 'Electric Charges and Fields';
    var rows = [COLS,
      ['MCQ', 'The SI unit of electric charge is', 'ampere', 'coulomb', 'volt', 'ohm', 'B', 'Charge is measured in coulomb (C).', ch, 'Electric charge', 'Easy', '1', 'PYQ', '2023'],
      ['WRITTEN', 'State Coulomb\'s law in vector form.', '', '', '', '', '$\\vec F_{12} = \\frac{1}{4\\pi\\epsilon_0}\\frac{q_1q_2}{r^2}\\hat r_{12}$', 'Write the law, then the vector form.', ch, 'Coulomb\'s law', 'Medium', '2', 'NCERT_EXERCISE', '']];
    return rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text).replace(/^\uFEFF/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  // Reads the first sheet of an .xlsx file (a zip of XML files) with the browser's own unzip.
  function readXlsx(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error('This is not an Excel (.xlsx) file.'));
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), files = {};
    for (var k = 0; k < n; k++) {
      var nameLen = dv.getUint16(off + 28, true), extra = dv.getUint16(off + 30, true), cmt = dv.getUint16(off + 32, true);
      var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
      files[name] = { method: dv.getUint16(off + 10, true), size: dv.getUint32(off + 20, true), local: dv.getUint32(off + 42, true) };
      off += 46 + nameLen + extra + cmt;
    }
    var get = function (name) {
      var f = files[name];
      if (!f) return Promise.resolve(null);
      var lo = f.local, start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      var data = u8.subarray(start, start + f.size);
      if (f.method === 0) return Promise.resolve(new TextDecoder().decode(data));
      if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot open Excel files. Save the sheet as CSV and upload that.'));
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    var sheetName = Object.keys(files).filter(function (f) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(f); }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); })[0];
    if (!sheetName) return Promise.reject(new Error('No sheet was found in this Excel file.'));
    return Promise.all([get('xl/sharedStrings.xml'), get(sheetName)]).then(function (res) {
      var dp = new DOMParser();
      var shared = [];
      if (res[0]) dp.parseFromString(res[0], 'application/xml').querySelectorAll('si').forEach(function (si) { shared.push(Array.prototype.map.call(si.querySelectorAll('t'), function (t) { return t.textContent; }).join('')); });
      var rows = [];
      dp.parseFromString(res[1], 'application/xml').querySelectorAll('sheetData row').forEach(function (r) {
        var out = [];
        r.querySelectorAll('c').forEach(function (c) {
          var ref = c.getAttribute('r') || '', col = 0;
          (ref.match(/^[A-Z]+/) || [''])[0].split('').forEach(function (ch) { col = col * 26 + ch.charCodeAt(0) - 64; });
          var t = c.getAttribute('t'), v = c.querySelector('v'), val = '';
          if (t === 's' && v) val = shared[Number(v.textContent)] || '';
          else if (t === 'inlineStr') val = Array.prototype.map.call(c.querySelectorAll('t'), function (x) { return x.textContent; }).join('');
          else if (v) val = v.textContent;
          out[Math.max(0, col - 1)] = val;
        });
        for (var j = 0; j < out.length; j++) if (out[j] === undefined) out[j] = '';
        rows.push(out);
      });
      return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
    });
  }
  function rowsToQuestions(rows) {
    if (!rows.length) return { items: [], errors: ['The file is empty.'] };
    var head = rows[0].map(function (h) { return String(h).toLowerCase().trim().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); });
    var idx = {};
    COLS.forEach(function (c) { idx[c] = head.indexOf(c); });
    if (idx.question === -1) return { items: [], errors: ['The first row must have the column names from the template (at least "question").'] };
    var items = [];
    rows.slice(1).forEach(function (r, i) {
      var g = function (c) { return idx[c] === -1 ? '' : String(r[idx[c]] == null ? '' : r[idx[c]]).trim(); };
      var line = i + 2, errs = [];
      var qText = g('question');
      if (!qText) return;
      var opts = ['a', 'b', 'c', 'd'].map(function (k) { return g('option_' + k); }).filter(Boolean);
      var type = /written|short|long|subjective|numerical/i.test(g('type')) ? 'WRITTEN' : (opts.length >= 2 ? 'MCQ' : 'WRITTEN');
      var correct = g('correct');
      var options = [];
      if (type === 'MCQ') {
        var key = /^\(?[a-dA-D]\)?$/.test(correct) ? correct.replace(/[()]/g, '').toUpperCase() : '';
        if (!key) { var at = opts.findIndex(function (o) { return o.toLowerCase() === correct.toLowerCase(); }); if (at !== -1) key = 'ABCD'[at]; }
        options = opts.map(function (o, j) { return { key: 'ABCD'[j], latex: o, is_correct: 'ABCD'[j] === key }; });
        if (!key) errs.push('"correct" must be A, B, C or D');
      } else if (!correct) errs.push('"correct" (the answer) is empty');
      var d = g('difficulty').toUpperCase();
      var marks = Number(g('marks')) || (type === 'MCQ' ? 1 : 3);
      var src = g('source').toUpperCase().replace(/[^A-Z_]/g, '_');
      items.push({
        line: line, errors: errs, cat: CATS.some(function (c) { return c[0] === src; }) ? src : (src === 'NCERT' ? 'NCERT_EXERCISE' : (g('year') ? 'PYQ' : 'PRACTICE')),
        q: {
          question_latex: qText, options_latex: options, question_format: type === 'MCQ' ? 'MCQ_SINGLE' : (marks >= 5 ? 'LONG_DERIVATION' : 'SHORT_ANSWER'),
          correct_answer: type === 'MCQ' ? ((options.find(function (o) { return o.is_correct; }) || {}).key || null) : null,
          correct_answer_latex: type === 'MCQ' ? ((options.find(function (o) { return o.is_correct; }) || {}).latex || '') : correct,
          solution_latex: g('solution'), chapter_name: g('chapter'), chapter: g('chapter'), topic: g('topic') || g('chapter'),
          difficulty: ['EASY', 'MEDIUM', 'HARD'].indexOf(d) !== -1 ? d : 'MEDIUM', marks: marks, pyq_year: g('year') || undefined
        }
      });
    });
    return { items: items, errors: [] };
  }
  function openSheetImport() {
    var m = modal('Add questions from Excel or CSV',
      '<ol class="qb2-howto"><li>Download the template and fill one question per row (keep the first row as it is).</li><li>For multiple choice, put the right option letter (A–D) in <b>correct</b>; for written questions put the answer there.</li><li>Upload the file: you will see every row checked before anything is saved.</li></ol>'
      + '<div class="qb2-row-btns"><button type="button" class="btn-secondary" data-qb-tpl>' + ico('download') + ' Download template (CSV, opens in Excel)</button></div>'
      + '<label class="qb2-drop"><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="qb2SheetFile">' + ico('file-spreadsheet', 22) + '<span id="qb2SheetName">Choose or drop your .xlsx or .csv file</span></label>'
      + '<div id="qb2SheetPreview"></div>',
      '<button type="button" class="btn-secondary" data-qb-close2>Cancel</button><button type="button" class="btn-primary" data-qb-go disabled>' + ico('upload') + ' Add questions</button>', true);
    m.$('[data-qb-close2]').addEventListener('click', m.close);
    m.$('[data-qb-tpl]').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\uFEFF' + templateCsv()], { type: 'text/csv;charset=utf-8' }));
      a.download = 'question-bank-template.csv';
      document.body.appendChild(a); a.click(); a.remove();
    });
    var ready = [];
    var read = function (f) {
      if (!f) return;
      m.$('#qb2SheetName').textContent = f.name + ' — reading...';
      var p = /\.xlsx$/i.test(f.name) ? f.arrayBuffer().then(readXlsx) : f.text().then(parseCsv);
      p.then(function (rows) {
        var res = rowsToQuestions(rows);
        var ok = res.items.filter(function (x) { return !x.errors.length; });
        ready = ok;
        m.$('#qb2SheetName').textContent = f.name + ' • ' + res.items.length + ' questions found';
        m.$('#qb2SheetPreview').innerHTML = (res.errors.length ? '<p class="qb2-note">' + esc(res.errors.join(' ')) + '</p>' : '')
          + (res.items.length ? '<div class="qb2-sheet-sum"><b class="ok">' + ok.length + ' ready</b>' + (res.items.length - ok.length ? ' &bull; <b class="bad">' + (res.items.length - ok.length) + ' need fixing (they will be skipped)</b>' : '') + '</div>'
            + '<div class="qb2-sheet-table"><table><thead><tr><th>Row</th><th>Question</th><th>Answer</th><th>Chapter</th><th>Marks</th><th>Status</th></tr></thead><tbody>'
            + res.items.slice(0, 200).map(function (x) { return '<tr' + (x.errors.length ? ' class="bad"' : '') + '><td>' + x.line + '</td><td>' + esc(x.q.question_latex.slice(0, 90)) + '</td><td>' + esc(x.q.correct_answer || String(x.q.correct_answer_latex || '').slice(0, 30)) + '</td><td>' + esc(x.q.chapter_name || '—') + '</td><td>' + x.q.marks + '</td><td>' + (x.errors.length ? esc(x.errors.join('; ')) : 'OK') + '</td></tr>'; }).join('')
            + '</tbody></table></div>' : '');
        m.$('[data-qb-go]').disabled = !ok.length;
        m.$('[data-qb-go]').innerHTML = ico('upload') + ' Add ' + ok.length + ' question' + (ok.length === 1 ? '' : 's');
        icons();
      }).catch(function (e) { m.$('#qb2SheetName').textContent = e.message; ready = []; m.$('[data-qb-go]').disabled = true; });
    };
    m.$('#qb2SheetFile').addEventListener('change', function (e) { read(e.target.files[0]); });
    var drop = m.$('.qb2-drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); read(e.dataTransfer.files[0]); });
    m.$('[data-qb-go]').addEventListener('click', function () {
      if (!ready.length) return;
      var btn = m.$('[data-qb-go]');
      btn.disabled = true;
      btn.textContent = 'Adding...';
      // one request per question type, so each keeps its source label
      var groups = {};
      ready.forEach(function (x) { (groups[x.cat] = groups[x.cat] || []).push(x.q); });
      var total = 0;
      Object.keys(groups).reduce(function (p, cat) { return p.then(function () { return saveQuestions(groups[cat], cat).then(function (n) { total += n; }); }); }, Promise.resolve())
        .then(function () { m.close(); toast(total + ' question' + (total === 1 ? '' : 's') + ' added to the bank.', 'success'); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Add questions'; toast(e.message, 'error'); });
    });
  }

  // Opens the bank on one chapter (used by chapter links elsewhere in the app).
  function setChapter(num) { resetFilters(); QB.f.chapter = 'n:' + num; QB.view = 'all'; QB.page = 0; QB.activeId = null; }

  function bindHeader() {
    var add = $('btnQbAdd'), ref = $('btnQbRefresh');
    if (add && !add.getAttribute('data-bound')) { add.setAttribute('data-bound', '1'); add.addEventListener('click', openAddMenu); }
    if (ref && !ref.getAttribute('data-bound')) {
      ref.setAttribute('data-bound', '1');
      ref.addEventListener('click', function () { QB.metaFor = null; if (typeof global.loadQuestionBankView === 'function') global.loadQuestionBankView(true); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHeader); else bindHeader();

  // Shows one question in the preview (clears filters and search so it is in the list).
  function openQuestion(id) { resetFilters(); QB.q = ''; QB.view = 'all'; var se = $('qb2Search'); if (se) se.value = ''; var list = filtered(); var at = list.findIndex(function (q) { return q.id === id; }); if (at === -1) return false; QB.page = Math.floor(at / PER_PAGE); QB.activeId = id; paintAll(); return true; }

  // Views as sub-tabs under the header (js/appShell.js).
  function subtabs() {
    var a = all();
    var n = { all: a.length, mine: a.filter(mine).length, saved: a.filter(function (q) { return QB.saved.indexOf(q.id) !== -1; }).length, reported: a.filter(function (q) { return reportsFor(q.id).length; }).length };
    return [['all', 'All questions'], ['mine', 'Added by me'], ['saved', 'Saved'], ['reported', 'Reported']].map(function (v) {
      return { label: v[1] + (a.length ? ' (' + n[v[0]] + ')' : ''), active: QB.view === v[0], run: function () { QB.view = v[0]; QB.page = 0; paintAll(); } };
    });
  }

  global.QuestionBank = { render: render, setChapter: setChapter, open: openQuestion, subtabs: subtabs, openAddMenu: openAddMenu, openQuestionForm: openQuestionForm, openSheetImport: openSheetImport, _parseCsv: parseCsv, _rowsToQuestions: rowsToQuestions };
})(window);
