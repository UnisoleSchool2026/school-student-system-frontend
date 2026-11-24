/* =============================================================================
   UNISOLE APP SHELL (2026-11-16 redesign)
   - PC (>= 900px): top tab bar under the header + hamburger menu for everything else.
   - Phone (< 900px): compact top bar + bottom tab bar (4 main tabs + "More").
   The tabs mirror the existing drawer cards (teacher / student workspaces and the
   Board/Competitive mode tools), so every tab still runs the original click handler
   and all existing logic (scoping, dual mode, feature flags) stays in charge of
   which features exist. This file only renders navigation; it owns no data.
   ========================================================================== */
(function (global) {
  'use strict';

  var MOBILE_MAX = 899;
  var MAX_TABS = 7; // PC top bar: at most 7 tabs; anything beyond goes under "More"

  // Short labels for the bottom bar and the phone page title.
  var SHORT = {
    'NCERT': 'NCERT',
    'NCERT Reading Engine': 'NCERT',
    'Create Test & Paper': 'Tests & DPPs',
    'Tests & DPPs': 'Tests & DPPs',
    'Class Progress & Tests': 'Progress',
    'Question Bank & PYQs': 'Question Bank',
    'Scan Paper Sheets': 'Scan Sheets',
    'Chapter-wise DPP': 'DPP',
    'Roadmap & Milestones': 'Roadmap',
    'Definition & Derivation Cards': 'Cards',
    'Homework Sets': 'Homework',
    'Predictive Rank Analytics': 'Rank',
    'Take Test / Practice': 'Tests',
    'Weekly Report Card': 'Report Card',
    'Record of Previous Tests': 'My Results',
    'Personalized Assignments': 'Practice',
    'School Overview': 'Overview',
    'Tests & Topics': 'Tests & Topics',
    'Study Board': 'Study Board',
    'Class Desk': 'Class Desk'
  };
  var TINY = { // bottom bar (very short)
    'NCERT': 'NCERT',
    'Create Test': 'Create', 'Progress': 'Progress', 'Question Bank': 'Bank', 'Scan Sheets': 'Scan',
    'Report Card': 'Report', 'My Results': 'Results', 'Cheat Sheet': 'Formulas', 'Tests & Topics': 'Tests',
    'Study Board': 'Board', 'Class Desk': 'Desk'
  };
  var TAB_LABEL = { // top tab bar (PC)
    'NCERT': 'NCERT',
    'NCERT Reading Engine': 'NCERT',
    'Create Test & Paper': 'Tests & DPPs',
    'Class Progress & Tests': 'Class Progress',
    'Question Bank & PYQs': 'Question Bank',
    'Scan Paper Sheets': 'Scan Sheets',
    'Take Test / Practice': 'Tests',
    'Weekly Report Card': 'Report Card',
    'Record of Previous Tests': 'My Results',
    'Personalized Assignments': 'Practice',
    'Definition & Derivation Cards': 'Revision Cards'
  };
  var PORTAL = { teacher: 'Teacher', student: 'Student', director: 'Principal' };

  function byId(id) { return document.getElementById(id); }
  function activeRole() {
    try { if (typeof state !== 'undefined' && state && state.activeRole) return state.activeRole; } catch (e) { /* ignore */ }
    if (byId('studentView') && byId('studentView').classList.contains('active')) return 'student';
    if (byId('directorView') && byId('directorView').classList.contains('active')) return 'director';
    return 'teacher';
  }
  function isShown(el) {
    if (!el || el.hidden || el.classList.contains('dm-hidden')) return false;
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.hidden) return false;
      if (n.style && n.style.display === 'none' && n.id !== 'sidebarNavDrawer') return false;
    }
    return true;
  }
  function iconOf(card) {
    var i = card.querySelector('[data-lucide]');
    if (i) return i.getAttribute('data-lucide');
    var svg = card.querySelector('svg.lucide');
    if (svg) {
      var cls = Array.prototype.find.call(svg.classList, function (c) { return c.indexOf('lucide-') === 0; });
      if (cls) return cls.replace('lucide-', '');
    }
    return 'circle';
  }
  function titleOf(card) {
    var t = card.querySelector('.drawer-nav-card-title');
    return (t ? t.textContent : card.textContent).replace(/\s+/g, ' ').trim();
  }

  // Nav items for the active role, in drawer order.
  function navItems() {
    var role = activeRole();
    var cards = [];
    if (role === 'teacher') {
      cards = Array.prototype.slice.call(document.querySelectorAll('#drawerSectionTeacherWorkspaces .drawer-nav-card'));
    } else if (role === 'student') {
      cards = Array.prototype.slice.call(document.querySelectorAll('#drawerSectionStudentWorkspaces .drawer-nav-card'));
      var tools = byId('drawerSectionModeTools');
      if (tools && !tools.hidden) cards = cards.concat(Array.prototype.slice.call(tools.querySelectorAll('.drawer-nav-card')));
    } else {
      cards = Array.prototype.slice.call(document.querySelectorAll('#drawerSectionPrincipalNav .drawer-nav-card'));
    }
    return cards.filter(isShown).map(function (card, i) {
      var label = titleOf(card);
      var shortL = SHORT[label] || label;
      return {
        key: card.getAttribute('data-tab') || card.getAttribute('data-tool') || card.getAttribute('data-ptab') || ('item' + i),
        label: label,
        tab: TAB_LABEL[label] || shortL,
        short: shortL,
        tiny: TINY[shortL] || shortL,
        icon: iconOf(card),
        active: card.classList.contains('active'),
        run: function () { card.click(); }
      };
    });
  }

  // The header class pill belongs to the teacher. Students see their own class; the principal sees none.
  var teacherBadgeText = null;
  function syncClassBadge(role) {
    var badge = byId('headerFacultyClassBadge');
    if (!badge) return;
    if (role === 'teacher') {
      if (teacherBadgeText !== null && badge.getAttribute('data-shell-owned') === '1') badge.textContent = teacherBadgeText;
      badge.removeAttribute('data-shell-owned');
      badge.style.display = '';
      return;
    }
    if (badge.getAttribute('data-shell-owned') !== '1') teacherBadgeText = badge.textContent;
    badge.setAttribute('data-shell-owned', '1');
    if (role === 'student') {
      var sp = global.ACTIVE_STUDENT_PROFILE || {};
      var sec = String(sp.section || '');
      var nice = /NonMed/.test(sec) ? 'Non-Medical' : /Med/.test(sec) ? 'Medical' : '';
      badge.textContent = 'Class ' + (sp.grade || '') + (nice ? ' ' + nice : '');
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function iconHtml(name) { return '<i data-lucide="' + name + '" aria-hidden="true"></i>'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var lastSig = '';
  function render() {
    var items = navItems();
    var role = activeRole();
    var activeIdx = items.findIndex(function (it) { return it.active; });
    var sig = role + '|' + items.map(function (it) { return it.key + (it.active ? '*' : '') + it.tab; }).join(',');
    var portal = byId('shellPortalLabel');
    if (portal) portal.textContent = (PORTAL[role] || 'Teacher') + ' Portal';
    var title = byId('shellPageTitle');
    if (title) title.textContent = activeIdx >= 0 ? items[activeIdx].short : (PORTAL[role] || 'Unisole');
    document.body.setAttribute('data-shell-role', role);
    syncClassBadge(role);
    placeModeBar();
    if (sig === lastSig) { paintSubtabs(items); paintDrawerSubtabs(items); paintHeader(role); return; }
    lastSig = sig;

    // PC top tabs (at most MAX_TABS; the rest sit in a "More" menu. An active tab from "More" takes the last slot.)
    // The bar under the header shows only the sub-tabs of the open section (2026-11-24);
    // sections themselves are chosen from the menu (hamburger).
    paintSubtabs(items);
    paintDrawerSubtabs(items);
    paintHeader(role);

    var bottom = byId('shellBottomNav');
    if (bottom) {
      var slots = items.slice(0, 4);
      if (activeIdx >= 4) slots[3] = items[activeIdx];
      var moreActive = false;
      var html = slots.map(function (it) {
        var i = items.indexOf(it);
        return '<button type="button" class="shell-bottom-btn' + (it.active ? ' is-active' : '') + '" data-shell-idx="' + i + '" aria-label="' + esc(it.label) + '"' + (it.active ? ' aria-current="page"' : '') + '>'
          + iconHtml(it.icon) + '<span>' + esc(it.tiny) + '</span></button>';
      }).join('');
      html += '<button type="button" class="shell-bottom-btn' + (moreActive ? ' is-active' : '') + '" id="shellBottomMore" aria-label="More options and menu">'
        + iconHtml('menu') + '<span>More</span></button>';
      bottom.innerHTML = html;
      bindRun(bottom, items);
      var more = byId('shellBottomMore');
      if (more) more.addEventListener('click', function (e) { if (typeof global.toggleSidebarDrawer === 'function') global.toggleSidebarDrawer(e); });
    }
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      try { global.lucide.createIcons(); } catch (e) { /* ignore */ }
    }
  }
  // When the tab row does not fit, drop the icons and tighten the spacing instead of scrolling.
  function fitTabs() {
    var tabs = byId('shellTabs');
    if (!tabs || !tabs.clientWidth) return;
    tabs.classList.remove('shell-tabs-compact');
    if (tabs.scrollWidth > tabs.clientWidth + 1) tabs.classList.add('shell-tabs-compact');
  }

  // "More" menu for the PC tab bar. It is attached to <body> so the scrolling tab row cannot clip it.
  function closeMoreMenu() {
    var m = byId('shellMoreMenu');
    if (m) m.parentNode.removeChild(m);
    var b = byId('shellMoreBtn');
    if (b) b.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', closeMoreMenu);
    document.removeEventListener('keydown', moreMenuKey);
  }
  function moreMenuKey(e) {
    if (e.key === 'Escape') { var b = byId('shellMoreBtn'); closeMoreMenu(); if (b) b.focus(); }
  }
  function toggleMoreMenu(btn, extra, items) {
    if (byId('shellMoreMenu')) { closeMoreMenu(); return; }
    var menu = document.createElement('div');
    menu.id = 'shellMoreMenu';
    menu.className = 'shell-more-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = extra.map(function (it) {
      return '<button type="button" role="menuitem" data-shell-idx="' + items.indexOf(it) + '">' + iconHtml(it.icon) + '<span>' + esc(it.tab) + '</span></button>';
    }).join('');
    document.body.appendChild(menu);
    var r = btn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    bindRun(menu, items);
    if (global.lucide && typeof global.lucide.createIcons === 'function') { try { global.lucide.createIcons(); } catch (e) { /* ignore */ } }
    var first = menu.querySelector('button');
    if (first) first.focus();
    setTimeout(function () { document.addEventListener('click', closeMoreMenu); document.addEventListener('keydown', moreMenuKey); }, 0);
  }

  function bindRun(root, items) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-shell-idx]'), function (btn) {
      btn.addEventListener('click', function () {
        var it = items[Number(btn.getAttribute('data-shell-idx'))];
        if (it) it.run();
        if (typeof global.closeSidebarDrawer === 'function') global.closeSidebarDrawer();
        setTimeout(schedule, 30);
        if (window.innerWidth <= MOBILE_MAX) window.scrollTo({ top: 0, behavior: 'auto' });
      });
    });
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (global.requestAnimationFrame || setTimeout)(function () { pending = false; render(); }, 16);
  }

  // "Create Test & Paper": the assessment type dropdown becomes a simple two-button switch.
  function buildPaperModeSwitch() {
    var sel = byId('selectPaperModeDropdown');
    var strip = byId('paperModeSelectionStrip');
    if (!sel || !strip || byId('shellPaperModeSwitch')) return;
    var wrap = document.createElement('div');
    wrap.id = 'shellPaperModeSwitch';
    wrap.className = 'shell-segmented';
    wrap.setAttribute('role', 'tablist');
    wrap.setAttribute('aria-label', 'Type of paper');
    strip.parentNode.insertBefore(wrap, strip);
    var labels = { unit_test: 'Unit Test / Quiz', board_paper: 'Full Board Paper' };
    function paint() {
      wrap.innerHTML = Array.prototype.map.call(sel.options, function (o) {
        var on = o.value === sel.value;
        return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? 'is-active' : '') + '" data-value="' + esc(o.value) + '"'
          + (o.disabled ? ' disabled title="Not available for this subject"' : '') + '>' + esc(labels[o.value] || o.textContent.replace(/^\d+\.\s*/, '')) + '</button>';
      }).join('');
      Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled || sel.value === b.getAttribute('data-value')) return;
          sel.value = b.getAttribute('data-value');
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          paint();
        });
      });
    }
    paint();
    sel.addEventListener('change', paint);
    new MutationObserver(paint).observe(sel, { attributes: true, childList: true, subtree: true });
    var origSwitch = global.switchPaperCreationMode;
    if (typeof origSwitch === 'function') {
      global.switchPaperCreationMode = function () { var r = origSwitch.apply(this, arguments); setTimeout(paint, 0); return r; };
    }
  }

  // Move the Board/Competitive control into the tab bar so it is one slim row, not a big card.
  function placeModeBar() {
    var bar = byId('modeSwitchBar');
    var slot = byId('drawerModeSlot') || byId('shellModeSlot');
    if (bar && slot && bar.parentNode !== slot) slot.appendChild(bar);
  }

  function init() {
    if (!byId('shellTabs')) return;
    placeModeBar();
    buildPaperModeSwitch();
    render();
    var drawer = byId('sidebarNavDrawer');
    var obs = new MutationObserver(schedule);
    if (drawer) obs.observe(drawer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    ['teacherView', 'studentView', 'directorView'].forEach(function (id) {
      var el = byId(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    global.addEventListener('haps:modechange', schedule);
    global.addEventListener('resize', function () { closeMoreMenu(); schedule(); });
  }


  // =====================================================================
  // 2026-11-24: sub-tabs, header class chip + profile, menu sub-tabs,
  // class switcher and "Manage classes & students".
  // =====================================================================
  function visible(el) { return Boolean(el && el.offsetParent !== null); }
  function tabEl(key) { return key ? byId(key) : null; }
  // Sub-tabs of one section: [{label, active, run}]
  var STATIC_SUBS = {
    tabTeacherClassDesk: ['Doubts', 'Notices & homework', 'Reports'],
    tabStudentClassDesk: ['Notices & homework', 'My doubts'],
    tabTeacherStudyBoard: ['Learn a topic', 'Practice with hints'],
    tabStudentStudyBoard: ['Learn a topic', 'Solve my doubt', 'Practice with hints'],
    tabStudentRemedial: ['Assigned DPPs', 'Mistake notebook']
  };
  function subtabsOf(it) {
    if (!it) return [];
    var key = it.key;
    try {
      if (key === 'tabTeacherCreateTestAndPaper' && global.TestsDpps) return global.TestsDpps.subtabs();
      if (key === 'tabQuestionBank' && global.QuestionBank && global.QuestionBank.subtabs) return global.QuestionBank.subtabs();
      if (key === 'tabTeacherClasses' && typeof global.switchClassProgressSubView === 'function') {
        var roster = byId('viewEnrolledStudentsRoster');
        var onRoster = roster && roster.style.display !== 'none' && roster.style.display !== '';
        return [
          { label: 'Tests & reports', active: !onRoster, run: function () { global.switchClassProgressSubView('tests'); } },
          { label: 'Students', active: Boolean(onRoster), run: function () { global.switchClassProgressSubView('roster'); } }
        ];
      }
    } catch (e) { return []; }
    // Any page with its own segmented tab strip: mirror it.
    var page = tabEl(key);
    var strip = page && page.querySelector('.shell-segmented[role="tablist"]');
    if (!strip) {
      // Not drawn yet: the menu still lists its views; picking one opens the page, then the view.
      var names = STATIC_SUBS[key] || [];
      return names.map(function (label, i) {
        return { label: label, active: false, run: function () { setTimeout(function () { var p2 = tabEl(key); var st2 = p2 && p2.querySelector('.shell-segmented[role="tablist"]'); var bs = st2 ? st2.querySelectorAll('button, [role="tab"]') : []; if (bs[i]) bs[i].click(); }, 250); } };
      });
    }
    strip.classList.add('shell-mirrored');
    return Array.prototype.map.call(strip.querySelectorAll('button, [role="tab"]'), function (b) {
      return { label: b.textContent.replace(/\s+/g, ' ').trim(), active: b.classList.contains('is-active') || b.getAttribute('aria-selected') === 'true', run: function () { b.click(); } };
    }).filter(function (x) { return x.label; });
  }
  var subSig = '';
  function paintSubtabs(items) {
    var bar = byId('shellTabs'), wrap = byId('shellTabbar');
    if (!bar) return;
    var it = items.find(function (x) { return x.active; });
    var subs = subtabsOf(it);
    var sig = (it ? it.key : '') + '|' + subs.map(function (x) { return x.label + (x.active ? '*' : ''); }).join(',');
    document.body.classList.toggle('shell-has-subtabs', subs.length > 0);
    if (wrap) wrap.hidden = !subs.length;
    if (sig === subSig) return;
    subSig = sig;
    bar.setAttribute('aria-label', (it ? it.short : 'Section') + ' views');
    bar.innerHTML = '<span class="shell-sub-title">' + esc(it ? it.short : '') + '</span>' + subs.map(function (x, i) {
      return '<button type="button" class="shell-tab' + (x.active ? ' is-active' : '') + '" role="tab" aria-selected="' + Boolean(x.active) + '" data-sub="' + i + '"><span>' + esc(x.label) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(bar.querySelectorAll('[data-sub]'), function (b) {
      b.addEventListener('click', function () { var x = subs[Number(b.getAttribute('data-sub'))]; if (x) x.run(); subSig = ''; setTimeout(schedule, 40); });
    });
  }
  // The menu lists every section with its sub-tabs underneath.
  var drawerSig = '';
  function paintDrawerSubtabs(items) {
    var sig = items.map(function (it) { return it.key + ':' + subtabsOf(it).map(function (x) { return x.label; }).join('/'); }).join('|');
    if (sig === drawerSig) return;
    drawerSig = sig;
    document.querySelectorAll('.drawer-subtabs').forEach(function (el) { el.parentNode.removeChild(el); });
    items.forEach(function (it) {
      var subs = subtabsOf(it);
      if (!subs.length) return;
      var card = document.querySelector('.drawer-nav-card[data-tab="' + it.key + '"]');
      if (!card) return;
      var list = document.createElement('div');
      list.className = 'drawer-subtabs';
      list.innerHTML = subs.map(function (x, i) { return '<button type="button" data-dsub="' + i + '">' + esc(x.label.replace(/\s*\(\d+\)$/, '')) + '</button>'; }).join('');
      card.parentNode.insertBefore(list, card.nextSibling);
      Array.prototype.forEach.call(list.querySelectorAll('[data-dsub]'), function (b) {
        b.addEventListener('click', function () {
          var i = Number(b.getAttribute('data-dsub'));
          it.run();
          setTimeout(function () { var fresh = subtabsOf(navItems().find(function (x) { return x.key === it.key; }) || it); if (fresh[i]) fresh[i].run(); subSig = ''; schedule(); }, 60);
          if (typeof global.closeSidebarDrawer === 'function') global.closeSidebarDrawer();
        });
      });
    });
  }

  // ---------------------------------------------------- header + profile --
  var HONORIFIC = /^(dr|mr|mrs|ms|miss|er|prof|sh|smt)\.?$/i;
  function userOf(role) {
    try {
      if (role === 'teacher') { var t = (typeof teacherBuilderState !== 'undefined' && teacherBuilderState.activeTeacher) || {}; return { id: t.id || 'teacher', name: t.name || t.full_name || (byId('headerFacultyName') || {}).textContent || 'Teacher', line: (t.subjectName || t.subject || '') + (t.designation ? ' • ' + String(t.designation).split('&')[0].trim() : ''), phone: t.phone || '' }; } // eslint-disable-line no-undef
      if (role === 'student') { var p = global.ACTIVE_STUDENT_PROFILE || {}; return { id: p.id || 'student', name: p.name || p.full_name || 'Student', line: 'Student' + (p.roll_number || p.roll ? ' • Roll ' + (p.roll_number || p.roll) : ''), phone: '' }; }
    } catch (e) { /* fall through */ }
    var card = byId('drawerPrincipalProfileCard');
    return { id: 'principal', name: card ? card.querySelector('strong').textContent : 'Principal', line: 'Principal', phone: '' };
  }
  function initialOf(name) { var w = String(name || '').trim().split(/\s+/).filter(function (x) { return !HONORIFIC.test(x); }); return ((w[0] || name || '?').charAt(0) || '?').toUpperCase(); }
  function photoKey(u) { return 'unisole_avatar_' + u.id; }
  function photoOf(u) { try { return localStorage.getItem(photoKey(u)) || ''; } catch (e) { return ''; } }
  function avatarHtml(u, big) { var ph = photoOf(u); return ph ? '<img src="' + esc(ph) + '" alt="">' : '<span>' + esc(initialOf(u.name)) + '</span>'; }
  var NICE = { NonMed: 'Non-Medical', Med: 'Medical' };
  function classText(id) {
    var m = /^(\d+)-(.*)$/.exec(String(id || ''));
    if (!m) return String(id || '');
    return 'Class ' + m[1] + ' · ' + (NICE[m[2]] || m[2].replace(/-/g, ' '));
  }
  function currentClassId(role) {
    if (role === 'student') return (global.ACTIVE_STUDENT_PROFILE || {}).section || '';
    try { return teacherBuilderState.selectedClassId || ''; } catch (e) { return ''; } // eslint-disable-line no-undef
  }
  function paintHeader(role) {
    var right = document.querySelector('#mainHeader .header-right');
    if (!right) return;
    var cls = byId('shellClassBtn'), av = byId('shellAvatarBtn');
    if (!cls) {
      cls = document.createElement('button'); cls.type = 'button'; cls.id = 'shellClassBtn'; cls.className = 'shell-class-btn';
      cls.addEventListener('click', function () { if (activeRole() === 'teacher') openClassSwitcher(); });
      right.insertBefore(cls, right.firstChild);
      av = document.createElement('button'); av.type = 'button'; av.id = 'shellAvatarBtn'; av.className = 'shell-avatar'; av.setAttribute('aria-haspopup', 'menu');
      av.addEventListener('click', function (e) { e.stopPropagation(); toggleProfileMenu(); });
      right.insertBefore(av, cls.nextSibling);
    }
    var u = userOf(role);
    var cid = currentClassId(role);
    cls.hidden = role === 'director' || !cid;
    cls.innerHTML = '<span>' + esc(classText(cid)) + '</span>' + (role === 'teacher' ? iconHtml('chevrons-up-down') : '');
    cls.disabled = role !== 'teacher';
    cls.setAttribute('aria-label', role === 'teacher' ? 'Class: ' + classText(cid) + '. Switch class' : 'Class: ' + classText(cid));
    var sig = u.id + '|' + u.name + '|' + photoOf(u).length;
    if (av.getAttribute('data-sig') !== sig) { av.setAttribute('data-sig', sig); av.innerHTML = avatarHtml(u); av.setAttribute('aria-label', 'Profile: ' + u.name); av.title = u.name; }
    if (global.lucide && global.lucide.createIcons) { try { global.lucide.createIcons(); } catch (e) { /* ignore */ } }
  }
  function closeProfileMenu() { var m = byId('shellProfileMenu'); if (m) m.parentNode.removeChild(m); document.removeEventListener('mousedown', outsideProfile); var b = byId('shellAvatarBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function outsideProfile(e) { var m = byId('shellProfileMenu'); if (m && !m.contains(e.target) && e.target !== byId('shellAvatarBtn')) closeProfileMenu(); }
  function toggleProfileMenu() {
    if (byId('shellProfileMenu')) { closeProfileMenu(); return; }
    var role = activeRole(), u = userOf(role), has = Boolean(photoOf(u));
    var m = document.createElement('div');
    m.id = 'shellProfileMenu'; m.className = 'shell-profile-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<div class="spm-head"><span class="shell-avatar big">' + avatarHtml(u) + '</span><div><b>' + esc(u.name) + '</b><small>' + esc(u.line || '') + '</small>' + (u.phone ? '<small>' + esc(u.phone) + '</small>' : '') + '</div></div>'
      + '<label class="spm-item" role="menuitem" tabindex="0">' + iconHtml('camera') + '<span>' + (has ? 'Change photo' : 'Add a photo') + '</span><input type="file" accept="image/*" hidden id="spmFile"></label>'
      + (has ? '<button type="button" class="spm-item" role="menuitem" data-spm="remove">' + iconHtml('image-off') + '<span>Remove photo</span></button>' : '')
      + '<button type="button" class="spm-item spm-out" role="menuitem" data-spm="out">' + iconHtml('log-out') + '<span>Sign out</span></button>';
    document.body.appendChild(m);
    var b = byId('shellAvatarBtn'), r = b.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 8) + 'px';
    m.style.right = Math.round(Math.max(8, window.innerWidth - r.right)) + 'px';
    b.setAttribute('aria-expanded', 'true');
    byId('spmFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas'), n = 160, sc = Math.max(n / img.width, n / img.height);
          c.width = n; c.height = n;
          c.getContext('2d').drawImage(img, (n - img.width * sc) / 2, (n - img.height * sc) / 2, img.width * sc, img.height * sc);
          try { localStorage.setItem(photoKey(u), c.toDataURL('image/jpeg', 0.85)); } catch (err) { if (global.showToast) global.showToast('The photo could not be saved on this device.', 'warning'); }
          closeProfileMenu(); paintHeader(role);
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    m.querySelector('label.spm-item').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); byId('spmFile').click(); } });
    var rm = m.querySelector('[data-spm="remove"]');
    if (rm) rm.addEventListener('click', function () { try { localStorage.removeItem(photoKey(u)); } catch (e) { /* ignore */ } closeProfileMenu(); paintHeader(role); });
    m.querySelector('[data-spm="out"]').addEventListener('click', function () { closeProfileMenu(); if (typeof global.signOutCurrentUser === 'function') global.signOutCurrentUser(); else if (typeof global.handleTeacherSignOut === 'function') global.handleTeacherSignOut(); });
    if (global.lucide && global.lucide.createIcons) { try { global.lucide.createIcons(); } catch (e) { /* ignore */ } }
    setTimeout(function () { document.addEventListener('mousedown', outsideProfile); }, 0);
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeProfileMenu(); b.focus(); } });
    var first = m.querySelector('.spm-item'); if (first) first.focus();
  }

  // ------------------------------------------------------ class switcher --
  var TRACK = { NonMed: 'JEE • CBSE / HP Board', Med: 'NEET • CBSE / HP Board' };
  // Every class this teacher teaches (all grades) plus classes they created.
  function teacherClasses() {
    try {
      var key = String(teacherBuilderState.teacherSubjectKey || (teacherBuilderState.activeTeacher || {}).subjectKey || '').toUpperCase(); // eslint-disable-line no-undef
      var list = (FACULTY_SUBJECT_CLASSES[key] || []).map(function (c) { return { id: c.id, name: c.name }; }); // eslint-disable-line no-undef
      var custom = [];
      try { custom = JSON.parse(localStorage.getItem('haps_teacher_custom_classes') || '[]').filter(function (c) { return String(c.subjectKey || '').toUpperCase() === key; }); } catch (e) { custom = []; }
      custom.forEach(function (c) { var id = c.id || c.section; if (id && !list.some(function (x) { return x.id === id; })) list.push({ id: id, name: c.name || id }); });
      return list.sort(function (a, b) { return String(b.id).localeCompare(String(a.id), undefined, { numeric: true }); });
    } catch (e) { return typeof global.scopedPaperClassList === 'function' ? global.scopedPaperClassList() : []; }
  }
  function overlay(title, inner, wide) {
    var ov = document.createElement('div');
    ov.className = 'ucs-modal';
    ov.innerHTML = '<div class="ucs-dialog' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="ucs-head"><h3>' + esc(title) + '</h3><button type="button" class="ucs-x" aria-label="Close">' + iconHtml('x') + '</button></div><div class="ucs-body">' + inner + '</div></div>';
    document.body.appendChild(ov);
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', esc1); };
    var esc1 = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc1);
    ov.querySelector('.ucs-x').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    if (global.lucide && global.lucide.createIcons) { try { global.lucide.createIcons(); } catch (e) { /* ignore */ } }
    return { el: ov, close: close };
  }
  function rosterCount(id) { try { var r = CLASS_ROSTERS[id]; return r && Array.isArray(r.students) ? r.students.length : null; } catch (e) { return null; } } // eslint-disable-line no-undef
  function openClassSwitcher() {
    if (typeof global.closeSidebarDrawer === 'function') global.closeSidebarDrawer();
    var cur = currentClassId('teacher');
    var subj = userOf('teacher').line.split(' • ')[0];
    var list = teacherClasses();
    var o = overlay('Switch class', '<p class="ucs-sub">Everything you see (tests, question bank, students) follows the class you pick.</p><div class="ucs-list" role="radiogroup" aria-label="Classes">'
      + list.map(function (c) {
        var m = /^(\d+)-(.*)$/.exec(c.id) || [];
        var n = rosterCount(c.id);
        var on = c.id === cur;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="ucs-class' + (on ? ' on' : '') + '" data-class="' + esc(c.id) + '"><span class="ucs-grade">' + esc(m[1] || '') + '</span><span class="ucs-text"><b>' + esc(classText(c.id)) + '</b><small>' + esc(subj) + (TRACK[m[2]] ? ' • ' + TRACK[m[2]] : '') + '</small></span><span class="ucs-meta">' + (n === null ? '' : n + ' student' + (n === 1 ? '' : 's')) + (on ? '<em>Current</em>' : '') + '</span></button>';
      }).join('') + '</div>' + (list.length ? '' : '<p class="ucs-sub">No classes are linked to your subject yet.</p>'));
    Array.prototype.forEach.call(o.el.querySelectorAll('[data-class]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-class');
        o.close();
        if (id !== cur && typeof global.switchFacultyClassScope === 'function') global.switchFacultyClassScope(id);
        setTimeout(function () { lastSig = ''; subSig = ''; render(); if (global.TestsDpps && byId('tdApp') && visible(byId('tdApp'))) global.TestsDpps.show(); }, 80);
      });
    });
    var on = o.el.querySelector('.ucs-class.on') || o.el.querySelector('.ucs-class'); if (on) on.focus();
  }

  // --------------------------------------------- manage classes & students --
  function api(path, opts) {
    var base = typeof global.getApiBaseUrl === 'function' ? global.getApiBaseUrl() : '';
    return fetch(base + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {})).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok || b.success === false) throw new Error(b.error || 'Request failed'); return b; }); });
  }
  function openManageClasses(startId) {
    if (typeof global.closeSidebarDrawer === 'function') global.closeSidebarDrawer();
    var list = teacherClasses();
    var cur = startId || currentClassId('teacher') || (list[0] && list[0].id);
    var o = overlay('Manage classes & students', '<div class="ucs-tabs" role="tablist">' + list.map(function (c) { return '<button type="button" role="tab" data-mc="' + esc(c.id) + '" aria-selected="' + (c.id === cur) + '" class="' + (c.id === cur ? 'on' : '') + '">' + esc(classText(c.id)) + '</button>'; }).join('') + '</div><div id="ucsRoster"></div>', true);
    function paint() {
      var box = o.el.querySelector('#ucsRoster');
      box.innerHTML = '<p class="ucs-sub">Loading students...</p>';
      api('/api/curriculum/students?section=' + encodeURIComponent(cur)).then(function (b) {
        var st = b.students || [];
        box.innerHTML = '<form class="ucs-add" id="ucsAdd"><b>Add a student to ' + esc(classText(cur)) + '</b><input class="form-control" name="name" placeholder="Full name" required maxlength="80"><input class="form-control" name="roll" placeholder="Roll number" required maxlength="20"><input class="form-control" name="parent" placeholder="Parent phone (optional)" maxlength="20"><button type="submit" class="btn-primary">' + iconHtml('user-plus') + ' Add</button></form>'
          + '<table class="ucs-table"><thead><tr><th>Roll</th><th>Name</th><th>Move to</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>'
          + (st.length ? st.map(function (s) {
            return '<tr><td>' + esc(s.roll_number || '') + '</td><td>' + esc(s.full_name) + '</td><td><select class="form-select" data-move="' + esc(s.id) + '" aria-label="Move ' + esc(s.full_name) + ' to another class"><option value="">Keep in this class</option>' + list.filter(function (c) { return c.id !== cur; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(classText(c.id)) + '</option>'; }).join('') + '</select></td><td><button type="button" class="btn-secondary ucs-rm" data-rm="' + esc(s.id) + '" data-name="' + esc(s.full_name) + '">' + iconHtml('user-minus') + ' Remove</button></td></tr>';
          }).join('') : '<tr><td colspan="4">No students in this class yet.</td></tr>') + '</tbody></table>';
        if (global.lucide && global.lucide.createIcons) { try { global.lucide.createIcons(); } catch (e) { /* ignore */ } }
        box.querySelector('#ucsAdd').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target;
          api('/api/curriculum/students', { method: 'POST', body: JSON.stringify({ name: f.name.value.trim(), rollNumber: f.roll.value.trim(), parentPhone: f.parent.value.trim() || undefined, section: cur }) })
            .then(function (r) { if (global.showToast) global.showToast(r.message || 'Student added.', 'success'); changed(); paint(); })
            .catch(function (err) { if (global.showToast) global.showToast(err.message, 'error'); });
        });
        Array.prototype.forEach.call(box.querySelectorAll('[data-move]'), function (sel) {
          sel.addEventListener('change', function () {
            if (!sel.value) return;
            api('/api/curriculum/students/' + encodeURIComponent(sel.getAttribute('data-move')), { method: 'PUT', body: JSON.stringify({ section: sel.value, fromSection: cur }) })
              .then(function (r) { if (global.showToast) global.showToast(r.message, 'success'); changed(); paint(); })
              .catch(function (err) { if (global.showToast) global.showToast(err.message, 'error'); sel.value = ''; });
          });
        });
        Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'), function (btn) {
          btn.addEventListener('click', function () {
            if (!global.confirm('Remove ' + btn.getAttribute('data-name') + ' from ' + classText(cur) + '? Their past marks are kept.')) return;
            api('/api/curriculum/students/' + encodeURIComponent(btn.getAttribute('data-rm')) + '?section=' + encodeURIComponent(cur), { method: 'DELETE' })
              .then(function (r) { if (global.showToast) global.showToast(r.message, 'success'); changed(); paint(); })
              .catch(function (err) { if (global.showToast) global.showToast(err.message, 'error'); });
          });
        });
      }).catch(function (e) { box.innerHTML = '<p class="ucs-sub">' + esc(e.message) + '</p>'; });
    }
    function changed() { try { if (typeof syncTeacherClassDataFromBackend === 'function') syncTeacherClassDataFromBackend(); } catch (e) { /* ignore */ } } // eslint-disable-line no-undef
    Array.prototype.forEach.call(o.el.querySelectorAll('[data-mc]'), function (b) { b.addEventListener('click', function () { cur = b.getAttribute('data-mc'); Array.prototype.forEach.call(o.el.querySelectorAll('[data-mc]'), function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); }); paint(); }); });
    paint();
  }
  global.openClassSwitcher = openClassSwitcher;
  global.openManageClasses = openManageClasses;

  global.UnisoleShell = { refresh: function () { lastSig = ''; render(); }, openClassSwitcher: openClassSwitcher, openManageClasses: openManageClasses };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
