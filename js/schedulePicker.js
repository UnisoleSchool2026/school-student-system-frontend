/* =============================================================================
   SCHEDULE PICKER (2026-11-21)
   When students may take a test or DPP, and how the time runs:
     - "Fixed time slot": everyone writes between From and To (e.g. today 9:00-10:00);
       the test closes at To.
     - "Open between dates, timed per student": students can open it any time between
       From and To, and each gets N minutes from the moment they open it.
     - "Open now": no schedule (as before).
   Used by the test publish dialog (app.js) and the DPP form (teacherDpp.js).
   Also: describe(schedule) for labels and countdown(el, schedule, onEnd) for students.
   ========================================================================== */
(function (global) {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  // A Date as the value of an <input type="datetime-local"> (the device's local time).
  function local(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function roundUp(d, mins) { var m = mins * 60000; return new Date(Math.ceil(d.getTime() / m) * m); }

  // id: a prefix for element ids. opts: { what: 'test' | 'DPP', minutes: default minutes, mode: default mode }
  function html(id, opts) {
    opts = opts || {};
    var what = opts.what || 'test';
    var start = roundUp(new Date(), 15);
    var end = new Date(start.getTime() + 60 * 60000);
    var mode = opts.mode || 'WINDOW';
    var opt = function (val, title, sub) {
      return '<label class="spk-opt"><input type="radio" name="' + id + '_mode" value="' + val + '"' + (mode === val ? ' checked' : '') + '><span><b>' + title + '</b><small>' + sub + '</small></span></label>';
    };
    return '<fieldset class="spk" id="' + id + '"><legend>When can students take this ' + esc(what) + '?</legend>'
      + '<div class="spk-modes">'
      + opt('WINDOW', 'Fixed time slot', 'Everyone writes between the start and end time, e.g. today 9:00 to 10:00. It closes at the end time.')
      + opt('DURATION', 'Open between dates, timed per student', 'Students can open it any time between the two dates; each gets the minutes you set from the moment they open it.')
      + opt('NONE', 'Open now, no schedule', 'Students can take it straight away, any time.')
      + '</div>'
      + '<div class="spk-fields">'
      + '<label>' + 'Opens' + '<input type="datetime-local" class="form-control" id="' + id + '_from" value="' + local(start) + '"></label>'
      + '<label>' + 'Closes' + '<input type="datetime-local" class="form-control" id="' + id + '_to" value="' + local(end) + '"></label>'
      + '<label class="spk-mins">Minutes for each student<input type="number" class="form-control" id="' + id + '_mins" min="5" max="600" value="' + (opts.minutes || 60) + '"></label>'
      + '</div>'
      + '<div class="spk-quick" aria-label="Quick choices">'
      + '<button type="button" data-spk="today">Today</button><button type="button" data-spk="tomorrow">Tomorrow</button><button type="button" data-spk="week">For a week</button>'
      + '</div>'
      + '<p class="spk-summary" aria-live="polite"></p>'
      + '</fieldset>';
  }

  function $(root, id, part) { return root.querySelector('#' + id + '_' + part); }
  function modeOf(root, id) { var c = root.querySelector('input[name="' + id + '_mode"]:checked'); return c ? c.value : 'NONE'; }

  // Wires the quick buttons and keeps the fields and summary in step with the chosen mode.
  function bind(root, id) {
    var box = root.querySelector('#' + id);
    if (!box) return;
    var sync = function () {
      var m = modeOf(root, id);
      box.querySelector('.spk-fields').hidden = m === 'NONE';
      box.querySelector('.spk-quick').hidden = m === 'NONE';
      box.querySelector('.spk-mins').hidden = m !== 'DURATION';
      var sum = box.querySelector('.spk-summary');
      try { var s = read(root, id); sum.textContent = s ? 'Students will see it: ' + describe(s) + '.' : 'Students can take it straight away.'; sum.classList.remove('spk-bad'); }
      catch (e) { sum.textContent = e.message; sum.classList.add('spk-bad'); }
    };
    box.addEventListener('change', sync);
    box.addEventListener('input', sync);
    box.querySelectorAll('[data-spk]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-spk');
        var from = new Date($(root, id, 'from').value || Date.now());
        var to = new Date($(root, id, 'to').value || Date.now());
        var len = Math.max(15 * 60000, to - from);
        var day = new Date();
        if (k === 'tomorrow') day.setDate(day.getDate() + 1);
        if (k === 'week') {
          var s = roundUp(new Date(), 15);
          var e = new Date(s); e.setDate(e.getDate() + 7); e.setHours(23, 59, 0, 0);
          $(root, id, 'from').value = local(s); $(root, id, 'to').value = local(e);
        } else {
          // keep the chosen clock times, move them to that day
          var s2 = new Date(day); s2.setHours(from.getHours(), from.getMinutes(), 0, 0);
          if (k === 'today' && s2 < new Date()) s2 = roundUp(new Date(), 15);
          $(root, id, 'from').value = local(s2); $(root, id, 'to').value = local(new Date(s2.getTime() + len));
        }
        sync();
      });
    });
    sync();
  }

  // The chosen schedule as { opensAt, closesAt, mode, durationMinutes } (ISO), or null for "open now".
  // Throws an Error with a message for the teacher if something is wrong.
  function read(root, id) {
    var m = modeOf(root, id);
    if (m === 'NONE') return null;
    var fromV = $(root, id, 'from').value, toV = $(root, id, 'to').value;
    if (!fromV || !toV) throw new Error('Choose when it opens and when it closes.');
    var from = new Date(fromV), to = new Date(toV);
    if (isNaN(from) || isNaN(to)) throw new Error('Choose when it opens and when it closes.');
    if (to <= from) throw new Error('The closing time must be after the opening time.');
    if (to < new Date()) throw new Error('The closing time is already in the past.');
    var out = { opensAt: from.toISOString(), closesAt: to.toISOString(), mode: m };
    if (m === 'DURATION') {
      var mins = Math.round(Number($(root, id, 'mins').value));
      if (!(mins >= 5 && mins <= 600)) throw new Error('Minutes for each student must be between 5 and 600.');
      out.durationMinutes = mins;
    }
    return out;
  }

  function fmt(iso, withDay) {
    var d = new Date(iso);
    var today = new Date(); var tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    var same = function (a, b) { return a.toDateString() === b.toDateString(); };
    var t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (!withDay) return t;
    var day = same(d, today) ? 'today' : same(d, tmr) ? 'tomorrow' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return day + ' ' + t;
  }
  function describe(s) {
    if (!s) return 'open now';
    var sameDay = new Date(s.opensAt).toDateString() === new Date(s.closesAt).toDateString();
    var range = fmt(s.opensAt, true) + ' to ' + fmt(s.closesAt, !sameDay);
    return s.mode === 'DURATION' ? 'any time ' + range + ', ' + s.durationMinutes + ' min for each student' : range + ' (fixed slot)';
  }

  // Counts down to schedule.deadline using the server's clock. Returns a stop function.
  function countdown(el, s, onEnd) {
    if (!el || !s || !s.deadline) return function () {};
    var skew = s.serverNow ? Date.parse(s.serverNow) - Date.now() : 0;
    var end = Date.parse(s.deadline);
    var done = false;
    var tick = function () {
      var left = Math.round((end - (Date.now() + skew)) / 1000);
      if (left <= 0) {
        el.textContent = 'Time over';
        el.classList.add('spk-urgent');
        if (!done) { done = true; clearInterval(h); if (onEnd) onEnd(); }
        return;
      }
      var hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
      el.textContent = (hh ? hh + ':' + pad(mm) : pad(mm)) + ':' + pad(ss) + ' left';
      el.classList.toggle('spk-urgent', left <= 300);
    };
    var h = setInterval(tick, 1000);
    tick();
    return function () { clearInterval(h); };
  }

  global.SchedulePicker = { html: html, bind: bind, read: read, describe: describe, countdown: countdown, fmt: fmt };
})(window);
