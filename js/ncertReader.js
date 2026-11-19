/* =============================================================================
   NCERT READER (2026-11-19)
   The NCERT tab: a shelf of whole NCERT books (PDFs uploaded by teachers) and
   a reader that shows every page exactly as printed (pdf.js, vendor/pdfjs).
   - Only the pages on screen are drawn; the PDF is fetched in pieces (HTTP range).
   - Tap a paragraph (grow it with Previous / Next) or drag over text to:
     Study on the board, Explain simply, Summary, Quiz me. Each page has the
     same buttons for the whole page, and "Add to quiz" for multi-page quizzes.
   - "Study a diagram": draw a box around any figure, then Explain / Study on
     board / Quiz / Ask about it (the AI sees a sharp copy of just that box).
   - "Several pages": a summary or quiz on up to 5 pages (a range, or pages
     ticked with "Pick page").
   - AI help gets only the selected text (or that page's text), so it is cheap;
     answers are cached on the server.
   Mounted by dualModeEngine.js for the "ncert_core" tool: NcertReader.mount(el).
   ========================================================================== */
(function (global) {
  'use strict';

  var K = global.UnisoleKit;
  var PDFJS = 'vendor/pdfjs/';
  var S = { host: null, books: [], filter: { classNo: '', subject: '', q: '' }, book: null, pdf: null, pages: [], scale: 0, observer: null, sel: null, lang: pref('lang', 'en') };

  function pref(k, d) { try { return global.localStorage.getItem('sb_' + k) || d; } catch (e) { return d; } }
  function setPref(k, v) { try { global.localStorage.setItem('sb_' + k, v); } catch (e) { /* private mode */ } }
  function esc(v) { return K.esc(v); }
  function base() { return typeof global.getApiBaseUrl === 'function' ? global.getApiBaseUrl() : ''; }
  function role() { var r = K.role(); return r === 'principal' ? 'principal' : (r === 'teacher' ? 'teacher' : 'student'); }
  function userKey() { var r = role(); return r === 'student' ? 'stu:' + K.student().id : r + ':' + (K.teacher().subjectKey || ''); }
  function tex(v) { return /[$\\]/.test(v) && typeof global.renderLatexString === 'function' ? global.renderLatexString(v) : esc(v); }
  function icons() { K.icons(); }

  // pdf.js is loaded only when the NCERT tab is first opened.
  var libPromise = null;
  function lib() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (!libPromise) {
      libPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PDFJS + 'pdf.min.js';
        s.onload = function () { global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; resolve(global.pdfjsLib); };
        s.onerror = function () { libPromise = null; reject(new Error('The book viewer could not be loaded.')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }
  function openDoc(src) {
    return lib().then(function (pdfjs) {
      return pdfjs.getDocument(Object.assign({
        cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/',
        isEvalSupported: false, // never run code from a PDF
        disableAutoFetch: true, disableStream: false, rangeChunkSize: 262144
      }, src)).promise;
    });
  }

  // ================================================================ shelf --
  function mount(host) {
    S.host = host;
    if (!K) { host.innerHTML = '<p>Loading...</p>'; return; }
    if (S.book && S.pdf) { renderReader(); return; }
    var st = K.student();
    if (role() === 'student' && st.grade && !S.filter.classNo) S.filter.classNo = st.grade;
    loadShelf();
  }

  function loadShelf() {
    S.host.innerHTML = '<div class="ncr">' + K.loading('Opening the NCERT shelf...') + '</div>';
    K.api('/api/ncert-library/books').then(function (r) { S.books = r.books || []; renderShelf(); })
      .catch(function (err) { S.host.innerHTML = '<div class="ncr">' + K.errorBox(err) + '</div>'; });
  }

  function renderShelf() {
    var f = S.filter;
    var classes = uniq(S.books.map(function (b) { return String(b.classNo); })).sort(function (a, b) { return a - b; });
    var subjects = uniq(S.books.filter(function (b) { return !f.classNo || String(b.classNo) === f.classNo; }).map(function (b) { return b.subject; })).sort();
    var q = f.q.toLowerCase();
    var shown = S.books.filter(function (b) {
      return (!f.classNo || String(b.classNo) === f.classNo) && (!f.subject || b.subject === f.subject) && (!q || (b.title + ' ' + b.subject).toLowerCase().indexOf(q) !== -1);
    });
    var canAdd = role() !== 'student';
    S.host.innerHTML = '<div class="ncr ncr-shelf">'
      + '<div class="ncr-shelf-head"><div><h2>NCERT books</h2><p>Read the real textbook pages. Select any line to get it explained on the board, summarised or turned into a quiz.</p></div>'
      + (canAdd ? '<button type="button" class="btn-primary" data-ncr="add"><i data-lucide="upload" aria-hidden="true"></i> Add a book</button>' : '') + '</div>'
      + '<div class="ncr-filters">'
      + '<select class="form-select" data-ncr-f="classNo" aria-label="Class"><option value="">All classes</option>' + classes.map(function (c) { return '<option value="' + c + '"' + (c === f.classNo ? ' selected' : '') + '>Class ' + c + '</option>'; }).join('') + '</select>'
      + '<select class="form-select" data-ncr-f="subject" aria-label="Subject"><option value="">All subjects</option>' + subjects.map(function (s) { return '<option' + (s === f.subject ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>'
      + '<input class="form-control" data-ncr-f="q" placeholder="Search books" value="' + esc(f.q) + '" aria-label="Search books"></div>'
      + (shown.length ? '<div class="ncr-grid">' + shown.map(bookCard).join('') + '</div>'
        : K.empty('book-open', S.books.length ? 'No book matches' : 'No books yet', S.books.length ? 'Try another class or subject.' : (canAdd ? 'Add a full NCERT book (PDF) and every student can read it here.' : 'Your teacher has not added any NCERT book yet.')))
      + '</div>';
    S.host.querySelectorAll('[data-ncr-f]').forEach(function (el) {
      el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () {
        f[el.getAttribute('data-ncr-f')] = el.value;
        if (el.getAttribute('data-ncr-f') === 'classNo') f.subject = '';
        var pos = el.selectionStart;
        renderShelf();
        if (el.tagName === 'INPUT') { var again = S.host.querySelector('[data-ncr-f="q"]'); again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
      });
    });
    S.host.querySelectorAll('[data-ncr-open]').forEach(function (el) { el.addEventListener('click', function () { openBook(el.getAttribute('data-ncr-open')); }); });
    S.host.querySelectorAll('[data-ncr-del]').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); removeBook(el.getAttribute('data-ncr-del')); }); });
    var add = S.host.querySelector('[data-ncr="add"]');
    if (add) add.addEventListener('click', uploadDialog);
    icons();
  }

  function bookCard(b) {
    var last = lastPage(b.id);
    var mine = role() === 'principal' || (role() === 'teacher' && b.uploadedById === 'teacher:' + K.teacher().subjectKey);
    return '<div class="ncr-book" role="button" tabindex="0" data-ncr-open="' + esc(b.id) + '" aria-label="Open ' + esc(b.title) + '">'
      + '<div class="ncr-cover">' + (b.hasCover ? '<img loading="lazy" alt="" src="' + base() + '/api/ncert-library/books/' + esc(b.id) + '/cover">' : '<span>' + esc(b.subject) + '</span>') + '</div>'
      + '<div class="ncr-book-meta"><b>' + esc(b.title) + '</b><span>Class ' + esc(b.classNo) + ' • ' + esc(b.subject) + (b.pages ? ' • ' + b.pages + ' pages' : '') + '</span>'
      + (last > 1 ? '<span class="ncr-continue">Continue from page ' + last + '</span>' : '') + '</div>'
      + (mine ? '<button type="button" class="ncr-del" data-ncr-del="' + esc(b.id) + '" title="Remove this book" aria-label="Remove ' + esc(b.title) + '"><i data-lucide="trash-2" aria-hidden="true"></i></button>' : '')
      + '</div>';
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function lastPage(id) { try { return parseInt(global.localStorage.getItem('ncr_page_' + userKey() + '_' + id), 10) || 1; } catch (e) { return 1; } }
  function saveLastPage(id, n) { try { global.localStorage.setItem('ncr_page_' + userKey() + '_' + id, String(n)); } catch (e) { /* ignore */ } }

  function removeBook(id) {
    var b = S.books.find(function (x) { return x.id === id; });
    if (!b || !global.confirm('Remove "' + b.title + '" from the shelf for everyone?')) return;
    var t = K.teacher();
    fetch(base() + '/api/ncert-library/books/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(role() === 'principal' ? { role: 'principal' } : { teacherSubjectKey: t.subjectKey }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error(j.error || 'Could not remove the book.'); }); })
      .then(function () { K.toast('Book removed.', 'success'); loadShelf(); })
      .catch(function (err) { K.toast(err.message, 'error'); });
  }

  // ------------------------------------------------------------- upload --
  function uploadDialog() {
    var t = K.teacher();
    var ov = document.createElement('div');
    ov.className = 'ncr-modal';
    ov.innerHTML = '<div class="ncr-dialog glass-card" role="dialog" aria-modal="true" aria-labelledby="ncrUpTitle">'
      + '<h3 id="ncrUpTitle">Add an NCERT book</h3>'
      + '<p class="ncr-muted">Upload the full book as one PDF (from ncert.nic.in or your scan). Students will see the pages exactly as printed.</p>'
      + '<label class="ncr-drop"><input type="file" accept="application/pdf,.pdf" data-ncr-up="file"><i data-lucide="file-up" aria-hidden="true"></i><span data-ncr-up="name">Choose or drop the PDF</span></label>'
      + '<div class="ncr-up-grid"><label>Class<select class="form-select" data-ncr-up="classNo">' + range(1, 12).map(function (c) { return '<option' + (c === 12 ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>'
      + '<label>Subject<input class="form-control" data-ncr-up="subject" maxlength="60" value="' + esc(t.subjectName && t.subjectName !== t.subjectKey ? t.subjectName : '') + '" placeholder="e.g. Physics"></label>'
      + '<label class="ncr-span2">Book title<input class="form-control" data-ncr-up="title" maxlength="120" placeholder="e.g. Physics Part I"></label>'
      + '<label>Language<select class="form-select" data-ncr-up="language"><option value="en">English</option><option value="hi">Hindi</option></select></label></div>'
      + '<div class="ncr-progress" hidden><div></div></div><p class="ncr-up-msg ncr-muted" aria-live="polite"></p>'
      + '<div class="ncr-dialog-actions"><button type="button" class="btn-secondary" data-ncr-up="cancel">Cancel</button><button type="button" class="btn-primary" data-ncr-up="go" disabled>Upload</button></div></div>';
    document.body.appendChild(ov);
    icons();
    var $ = function (k) { return ov.querySelector('[data-ncr-up="' + k + '"]'); };
    var info = null, file = null;
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
    $('cancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var pick = function (f) {
      if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { K.toast('Choose a PDF file.', 'warning'); return; }
      file = f;
      $('name').textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB) - reading...';
      $('go').disabled = true;
      readLocal(f).then(function (i) {
        info = i;
        $('name').textContent = f.name + ' • ' + i.pages + ' pages';
        if (!$('title').value) $('title').value = i.title || f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        $('go').disabled = false;
      }).catch(function () { $('name').textContent = 'This PDF could not be opened. Choose another file.'; file = null; });
    };
    $('file').addEventListener('change', function () { pick($('file').files[0]); });
    ov.querySelector('.ncr-drop').addEventListener('dragover', function (e) { e.preventDefault(); });
    ov.querySelector('.ncr-drop').addEventListener('drop', function (e) { e.preventDefault(); pick(e.dataTransfer.files[0]); });
    $('go').addEventListener('click', function () {
      if (!file || !info) return;
      if (!$('subject').value.trim()) { $('subject').focus(); K.toast('Enter the subject.', 'warning'); return; }
      var fd = new FormData();
      fd.append('classNo', $('classNo').value);
      fd.append('subject', $('subject').value.trim());
      fd.append('title', $('title').value.trim());
      fd.append('language', $('language').value);
      fd.append('pages', String(info.pages));
      fd.append('cover', info.cover || '');
      if (role() === 'principal') fd.append('role', 'principal'); else { fd.append('teacherSubjectKey', t.subjectKey); fd.append('uploaderName', t.name); }
      fd.append('file', file);
      var xhr = new XMLHttpRequest();
      var bar = ov.querySelector('.ncr-progress');
      bar.hidden = false;
      $('go').disabled = true;
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) { bar.firstChild.style.width = Math.round(e.loaded * 100 / e.total) + '%'; ov.querySelector('.ncr-up-msg').textContent = 'Uploading... ' + Math.round(e.loaded * 100 / e.total) + '%'; } };
      xhr.onload = function () {
        var j = {};
        try { j = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && j.success) { close(); K.toast('Book added to the shelf.', 'success'); loadShelf(); }
        else { $('go').disabled = false; ov.querySelector('.ncr-up-msg').textContent = j.error || 'Upload failed. Please try again.'; }
      };
      xhr.onerror = function () { $('go').disabled = false; ov.querySelector('.ncr-up-msg').textContent = 'Upload failed. Check the connection and try again.'; };
      xhr.open('POST', base() + '/api/ncert-library/books');
      xhr.send(fd);
    });
  }
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  // Reads the PDF in the browser: page count, title, and a small cover picture.
  function readLocal(file) {
    return file.arrayBuffer().then(function (buf) { return openDoc({ data: new Uint8Array(buf) }); }).then(function (doc) {
      return doc.getMetadata().catch(function () { return {}; }).then(function (meta) {
        return doc.getPage(1).then(function (p) {
          var v = p.getViewport({ scale: 1 });
          var vp = p.getViewport({ scale: 260 / v.width });
          var c = document.createElement('canvas');
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          return p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
            var title = meta && meta.info && meta.info.Title;
            var out = { pages: doc.numPages, title: title && title.length < 100 && !/untitled|microsoft|\.indd|\.pdf/i.test(title) ? title : '', cover: c.toDataURL('image/jpeg', 0.72) };
            doc.destroy();
            return out;
          });
        });
      });
    });
  }

  // =============================================================== reader --
  // Ways to study, shown as buttons a student can always see:
  //   - tap any paragraph (highlighted; "+ Previous" / "+ Next" grow it) or drag to select text
  //   - "Study a diagram": draw a box around any figure
  //   - "Several pages": a summary or quiz on up to 5 pages (a range, or pages ticked with "Pick page")
  var MAX_QUIZ_PAGES = 5;

  function openBook(id) {
    var b = S.books.find(function (x) { return x.id === id; });
    if (!b) return;
    S.host.innerHTML = '<div class="ncr">' + K.loading('Opening ' + esc(b.title) + '...') + '</div>';
    closeDoc();
    openDoc({ url: base() + '/api/ncert-library/books/' + encodeURIComponent(id) + '/file' }).then(function (pdf) {
      S.book = b; S.pdf = pdf; S.outline = null; S.scale = 0; S.zoomed = false; S.ticked = []; S.pick = null; S.snip = false;
      return pdf.getPage(1).then(function (p1) {
        S.base = p1.getViewport({ scale: 1 });
        S.pages = [];
        for (var i = 1; i <= pdf.numPages; i++) S.pages.push({ n: i, state: 'empty' });
        renderReader();
        goTo(Math.min(lastPage(id), pdf.numPages), true);
        loadOutline();
      });
    }).catch(function (err) {
      S.host.innerHTML = '<div class="ncr">' + K.errorBox(new Error('This book could not be opened (' + (err && err.message ? err.message : 'error') + ').')) + '</div>';
    });
  }
  function closeDoc() {
    if (S.observer) S.observer.disconnect();
    if (S.pdf) { try { S.pdf.destroy(); } catch (e) { /* ignore */ } }
    S.pdf = null; S.book = null; S.pages = []; S.sel = null; S.pick = null; S.ticked = [];
    document.removeEventListener('keydown', onKey);
  }

  function ico(name) { return '<i data-lucide="' + name + '" aria-hidden="true"></i>'; }
  function renderReader() {
    var b = S.book;
    var n = S.pdf.numPages;
    var tipsSeen = pref('ncr_tips', '') === '1';
    S.host.innerHTML = '<div class="ncr ncr-reader">'
      + '<div class="ncr-bar">'
      + '<button type="button" class="btn-secondary ncr-icon" data-ncr="shelf" title="Back to the shelf" aria-label="Back to the shelf">' + ico('arrow-left') + '</button>'
      + '<button type="button" class="btn-secondary ncr-icon" data-ncr="toc" title="Contents" aria-label="Contents">' + ico('list') + '</button>'
      + '<div class="ncr-title"><b>' + esc(b.title) + '</b><span>Class ' + esc(b.classNo) + ' • ' + esc(b.subject) + '</span></div>'
      + '<button type="button" class="ncr-tool" data-ncr="snip" aria-pressed="false">' + ico('scan') + '<span>Study a diagram</span></button>'
      + '<button type="button" class="ncr-tool" data-ncr="multiquiz">' + ico('book-copy') + '<span>Several pages</span></button>'
      + '<div class="ncr-pageno"><input class="form-control" data-ncr="page" inputmode="numeric" aria-label="Page number" value="1"><span>/ ' + n + '</span></div>'
      + '<button type="button" class="btn-secondary ncr-icon" data-ncr="zoom-out" title="Smaller" aria-label="Smaller">' + ico('zoom-out') + '</button>'
      + '<button type="button" class="btn-secondary ncr-icon" data-ncr="zoom-in" title="Bigger" aria-label="Bigger">' + ico('zoom-in') + '</button>'
      + '<select class="form-select ncr-lang" data-ncr="lang" aria-label="Language of help">' + [['en', 'English'], ['hinglish', 'Hinglish'], ['hi', 'हिंदी']].map(function (o) { return '<option value="' + o[0] + '"' + (S.lang === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'
      + '</div>'
      + (tipsSeen ? '' : '<div class="ncr-tips"><span>' + ico('mouse-pointer-click') + '<b>Tap any paragraph</b> to explain, summarise or quiz it</span><span>' + ico('scan') + '<b>Study a diagram:</b> draw a box around any figure</span><span>' + ico('book-copy') + '<b>Several pages:</b> summary or quiz on up to 5 pages</span><button type="button" data-ncr="tips-ok">Got it</button></div>')
      + '<div class="ncr-snipbar" hidden>' + ico('scan') + ' Drag a box around the diagram you want to study. <button type="button" data-ncr="snip-cancel">Cancel</button></div>'
      + '<div class="ncr-body"><nav class="ncr-toc" hidden aria-label="Contents"></nav><div class="ncr-pages" tabindex="0"></div><aside class="ncr-panel" hidden aria-live="polite"></aside></div>'
      + '<div class="ncr-pop" hidden role="toolbar" aria-label="Study the selected part"></div>'
      + '<div class="ncr-tickbar" hidden></div>'
      + '</div>';
    var pagesEl = q('.ncr-pages');
    pagesEl.innerHTML = S.pages.map(function (p) {
      return '<section class="ncr-page" data-n="' + p.n + '" aria-label="Page ' + p.n + '">'
        + '<div class="ncr-page-tools"><span class="ncr-pg">Page ' + p.n + '</span>'
        + '<button type="button" class="ncr-pt ncr-pt-main" data-ncr-page="board" data-n="' + p.n + '">' + ico('presentation') + 'Study on board</button>'
        + '<button type="button" class="ncr-pt" data-ncr-page="summary" data-n="' + p.n + '">' + ico('list-ordered') + 'Summary</button>'
        + '<button type="button" class="ncr-pt" data-ncr-page="explain" data-n="' + p.n + '">' + ico('lightbulb') + 'Explain</button>'
        + '<button type="button" class="ncr-pt" data-ncr-page="quiz" data-n="' + p.n + '">' + ico('circle-help') + 'Quiz</button>'
        + '<label class="ncr-pt ncr-tick" title="Pick up to 5 pages for one summary or quiz"><input type="checkbox" data-ncr-tick="' + p.n + '"> Pick page</label></div>'
        + '<div class="ncr-sheet"></div></section>';
    }).join('');
    S.pages.forEach(function (p) { p.el = pagesEl.querySelector('.ncr-page[data-n="' + p.n + '"]'); p.state = 'empty'; p.paras = null; });
    if (!S.scale) S.scale = fitScale();
    sizePages();
    bindReader();
    icons();
  }
  function q(sel) { return S.host.querySelector(sel); }
  function fitScale() {
    var w = Math.max(280, (q('.ncr-pages') || S.host).clientWidth - 24);
    return Math.min(1.6, w / S.base.width);
  }
  function sizePages() {
    S.pages.forEach(function (p) {
      var sh = p.el.querySelector('.ncr-sheet');
      sh.style.width = Math.round((p.w || S.base.width) * S.scale) + 'px';
      sh.style.height = Math.round((p.h || S.base.height) * S.scale) + 'px';
    });
  }

  function bindReader() {
    var pagesEl = q('.ncr-pages');
    q('[data-ncr="shelf"]').addEventListener('click', function () { closeDoc(); renderShelf(); });
    q('[data-ncr="toc"]').addEventListener('click', function () { var t = q('.ncr-toc'); t.hidden = !t.hidden; if (!t.hidden) renderToc(); });
    q('[data-ncr="zoom-in"]').addEventListener('click', function () { zoom(1.15); });
    q('[data-ncr="zoom-out"]').addEventListener('click', function () { zoom(1 / 1.15); });
    q('[data-ncr="lang"]').addEventListener('change', function (e) { S.lang = e.target.value; setPref('lang', S.lang); });
    q('[data-ncr="snip"]').addEventListener('click', function () { setSnip(!S.snip); });
    q('[data-ncr="snip-cancel"]').addEventListener('click', function () { setSnip(false); });
    q('[data-ncr="multiquiz"]').addEventListener('click', quizDialog);
    var tipsOk = q('[data-ncr="tips-ok"]');
    if (tipsOk) tipsOk.addEventListener('click', function () { setPref('ncr_tips', '1'); var t = q('.ncr-tips'); if (t) t.parentNode.removeChild(t); });
    var pageInput = q('[data-ncr="page"]');
    pageInput.addEventListener('change', function () { goTo(parseInt(pageInput.value, 10) || 1); });
    pageInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') goTo(parseInt(pageInput.value, 10) || 1); });
    pagesEl.querySelectorAll('[data-ncr-page]').forEach(function (btn) {
      btn.addEventListener('click', function () { pageAction(btn.getAttribute('data-ncr-page'), parseInt(btn.getAttribute('data-n'), 10)); });
    });
    pagesEl.querySelectorAll('[data-ncr-tick]').forEach(function (box) {
      box.addEventListener('change', function () { tick(parseInt(box.getAttribute('data-ncr-tick'), 10), box.checked, box); });
    });
    // Draw the pages near the screen; forget far ones so long books stay light.
    S.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var p = S.pages[parseInt(en.target.getAttribute('data-n'), 10) - 1];
        p.visible = en.isIntersecting;
        if (en.isIntersecting) drawPage(p);
      });
      var cur = current();
      S.pages.forEach(function (p) { if (p.state === 'done' && Math.abs(p.n - cur) > 6) unload(p); });
    }, { root: pagesEl, rootMargin: '600px 0px' });
    S.pages.forEach(function (p) { S.observer.observe(p.el); });
    // The page number shown is the page covering the upper third of the screen.
    var scrollT = null;
    pagesEl.addEventListener('scroll', function () {
      positionPop();
      if (scrollT) return;
      scrollT = setTimeout(function () {
        scrollT = null;
        if (!S.pdf) return;
        var y = pagesEl.scrollTop + pagesEl.clientHeight / 3, lo = 0, hi = S.pages.length - 1;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (S.pages[mid].el.offsetTop <= y) lo = mid; else hi = mid - 1; }
        if (document.activeElement !== pageInput) pageInput.value = lo + 1;
        saveLastPage(S.book.id, lo + 1);
      }, 120);
    }, { passive: true });
    // Selecting: a drag selects freely; a tap picks the paragraph under the finger.
    pagesEl.addEventListener('pointerdown', function (e) { S.down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    pagesEl.addEventListener('pointerup', function (e) {
      if (S.snip || !S.down) return;
      var moved = Math.abs(e.clientX - S.down.x) + Math.abs(e.clientY - S.down.y);
      var sheet = e.target.closest && e.target.closest('.ncr-sheet');
      setTimeout(function () {
        var s = selectionInfo();
        if (s && moved > 6) { clearPick(); S.sel = s; showPop('text', s.rect); return; }
        if (moved <= 6 && sheet) tapAt(sheet, e.clientX, e.clientY);
      }, 30);
    });
    document.addEventListener('keydown', onKey);
    var resizeT;
    S.onResize = function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (!S.pdf || !q('.ncr-pages')) return; var keep = current(); S.scale = fitScale(); redrawAll(); goTo(keep, true); }, 250); };
    if (S.onResizeBound) global.removeEventListener('resize', S.onResizeBound);
    S.onResizeBound = S.onResize;
    global.addEventListener('resize', S.onResizeBound);
  }
  function onKey(e) {
    if (!S.pdf || !q('.ncr-pages')) return;
    if (e.key === 'Escape') { if (S.snip) setSnip(false); else { clearPick(); hidePop(); } return; }
    if (/input|select|textarea/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'PageDown') { e.preventDefault(); goTo(current() + 1); }
    if (e.key === 'PageUp') { e.preventDefault(); goTo(current() - 1); }
  }
  function current() { var i = q('[data-ncr="page"]'); return i ? parseInt(i.value, 10) || 1 : 1; }
  function goTo(n, instant) {
    n = Math.max(1, Math.min(S.pdf.numPages, n));
    q('.ncr-pages').scrollTo({ top: S.pages[n - 1].el.offsetTop - 8, behavior: instant ? 'auto' : 'smooth' });
    q('[data-ncr="page"]').value = n;
  }
  function zoom(f) {
    var keep = current();
    S.zoomed = true;
    S.scale = Math.max(0.5, Math.min(3, S.scale * f));
    redrawAll();
    goTo(keep, true);
  }
  function redrawAll() { clearPick(); hidePop(); S.pages.forEach(function (p) { unload(p); }); sizePages(); S.pages.forEach(function (p) { if (p.visible) drawPage(p); }); }
  function unload(p) {
    if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } }
    if (S.pick && S.pick.page === p.n) { clearPick(); hidePop(); }
    p.el.querySelector('.ncr-sheet').innerHTML = '';
    p.state = 'empty';
    p.paras = null;
  }

  function drawPage(p) {
    if (p.state !== 'empty' || !S.pdf) return;
    p.state = 'drawing';
    var pdf = S.pdf, scale = S.scale;
    pdf.getPage(p.n).then(function (page) {
      if (S.pdf !== pdf || p.state !== 'drawing') return;
      var v1 = page.getViewport({ scale: 1 });
      p.w = v1.width; p.h = v1.height;
      var vp = page.getViewport({ scale: scale });
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var sheet = p.el.querySelector('.ncr-sheet');
      sheet.style.width = Math.round(vp.width) + 'px';
      sheet.style.height = Math.round(vp.height) + 'px';
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = Math.round(vp.width) + 'px';
      canvas.style.height = Math.round(vp.height) + 'px';
      var textDiv = document.createElement('div');
      textDiv.className = 'ncr-text textLayer';
      textDiv.style.setProperty('--scale-factor', scale);
      var hl = document.createElement('div');
      hl.className = 'ncr-hl';
      sheet.innerHTML = '';
      sheet.appendChild(canvas);
      sheet.appendChild(hl);
      sheet.appendChild(textDiv);
      p.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      return p.task.promise.then(function () {
        return page.getTextContent();
      }).then(function (tc) {
        p.text = textOf(tc);
        return global.pdfjsLib.renderTextLayer({ textContentSource: tc, container: textDiv, viewport: vp, textDivs: [] }).promise;
      }).then(function () { p.state = 'done'; });
    }).catch(function (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      p.state = 'empty';
    });
  }
  function textOf(tc) { return tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join('').replace(/[ \t]+/g, ' ').trim(); }
  function pageText(n) {
    var p = S.pages[n - 1];
    if (p.text) return Promise.resolve(p.text);
    return S.pdf.getPage(n).then(function (page) { return page.getTextContent(); }).then(function (tc) { p.text = textOf(tc); return p.text; });
  }

  // ---------------------------------------------------------- contents --
  function loadOutline() {
    S.pdf.getOutline().then(function (items) { S.outline = items || []; }).catch(function () { S.outline = []; });
  }
  function renderToc() {
    var t = q('.ncr-toc');
    var items = S.outline || [];
    if (!items.length) {
      t.innerHTML = '<p class="ncr-muted">This PDF has no list of chapters. Jump by page number:</p><div class="ncr-toc-pages">'
        + range(1, Math.min(S.pdf.numPages, 400)).filter(function (n) { return n === 1 || n % 10 === 0; }).map(function (n) { return '<button type="button" data-ncr-go="' + n + '">' + n + '</button>'; }).join('') + '</div>';
    } else {
      var html = function (list, d) {
        return '<ul>' + list.map(function (it, i) { return '<li><button type="button" data-ncr-oi="' + d + '.' + i + '">' + esc(it.title) + '</button>' + (it.items && it.items.length && d.split('.').length < 3 ? html(it.items, d + '.' + i) : '') + '</li>'; }).join('') + '</ul>';
      };
      t.innerHTML = '<h4>Contents</h4>' + html(items, 'r');
    }
    t.querySelectorAll('[data-ncr-go]').forEach(function (b) { b.addEventListener('click', function () { goTo(parseInt(b.getAttribute('data-ncr-go'), 10)); }); });
    t.querySelectorAll('[data-ncr-oi]').forEach(function (b) {
      b.addEventListener('click', function () {
        var path = b.getAttribute('data-ncr-oi').split('.').slice(1).map(Number);
        var it = { items: items };
        path.forEach(function (k) { it = it.items[k]; });
        var dest = it.dest;
        (typeof dest === 'string' ? S.pdf.getDestination(dest) : Promise.resolve(dest)).then(function (d) {
          if (!d) return null;
          return typeof d[0] === 'object' ? S.pdf.getPageIndex(d[0]) : d[0];
        }).then(function (idx) { if (idx != null) { goTo(idx + 1); if (global.innerWidth < 900) t.hidden = true; } }).catch(function () { /* ignore */ });
      });
    });
  }

  // ------------------------------------------------ paragraphs on a page --
  // Lines and paragraphs are worked out from where the words sit on the page:
  // a line never joins words from two columns, and a paragraph ends at an indent,
  // a short last line, a bigger gap or a change of font size.
  function paragraphs(p) {
    if (p.paras) return p.paras;
    var sheet = p.el.querySelector('.ncr-sheet');
    var box = sheet.getBoundingClientRect();
    var items = [];
    sheet.querySelectorAll('.ncr-text span').forEach(function (el) {
      if (el.querySelector('span')) return;
      var t = el.textContent;
      if (!t || !t.trim()) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      items.push({ el: el, t: t, x1: r.left - box.left, x2: r.right - box.left, y1: r.top - box.top, y2: r.bottom - box.top, h: r.height });
    });
    items.sort(function (a, b) { return (a.y1 - b.y1) || (a.x1 - b.x1); });
    var lines = [];
    items.forEach(function (it) {
      var cy = (it.y1 + it.y2) / 2;
      var ln = null;
      for (var i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
        var L = lines[i];
        if (Math.abs(cy - (L.y1 + L.y2) / 2) < Math.min(it.h, L.h) * 0.5 && it.x1 - L.x2 < Math.max(it.h, L.h) * 2.2 && it.x2 > L.x1 - it.h) { ln = L; break; }
      }
      if (!ln) { ln = { items: [], x1: it.x1, x2: it.x2, y1: it.y1, y2: it.y2, h: it.h }; lines.push(ln); }
      ln.items.push(it);
      ln.x1 = Math.min(ln.x1, it.x1); ln.x2 = Math.max(ln.x2, it.x2); ln.y1 = Math.min(ln.y1, it.y1); ln.y2 = Math.max(ln.y2, it.y2); ln.h = Math.max(ln.h, it.h);
    });
    lines.forEach(function (L) { L.items.sort(function (a, b) { return a.x1 - b.x1; }); L.text = L.items.map(function (i) { return i.t; }).join(' ').replace(/\s+/g, ' ').trim(); });
    lines.sort(function (a, b) { return (a.y1 - b.y1) || (a.x1 - b.x1); });
    var paras = [];
    lines.forEach(function (L) {
      var best = null, bestGap = 1e9;
      paras.forEach(function (P) {
        if (P.closed) return;
        var last = P.lines[P.lines.length - 1];
        var gap = L.y1 - last.y2;
        var overlap = Math.min(L.x2, P.x2) - Math.max(L.x1, P.x1);
        var narrow = Math.min(L.x2 - L.x1, P.x2 - P.x1);
        if (gap < -last.h * 0.3 || gap > last.h * 0.85) return;
        if (overlap < narrow * 0.5) return;
        if (Math.abs(L.h - P.h) > P.h * 0.3) return;
        if (L.x1 - P.x1 > L.h * 1.0 && last.x2 > P.x2 - L.h * 2 && P.lines.length > 1) return; // indented: a new paragraph
        if (gap < bestGap) { best = P; bestGap = gap; }
      });
      if (best) {
        var prev = best.lines[best.lines.length - 1];
        if (prev.x2 < best.x2 - L.h * 4 && best.lines.length > 1) { best.closed = true; best = null; } // last line was short
      }
      if (!best) { best = { lines: [], x1: L.x1, x2: L.x2, y1: L.y1, y2: L.y2, h: L.h }; paras.push(best); }
      best.lines.push(L);
      best.x1 = Math.min(best.x1, L.x1); best.x2 = Math.max(best.x2, L.x2); best.y2 = Math.max(best.y2, L.y2);
    });
    paras.forEach(function (P) {
      P.text = P.lines.reduce(function (acc, L) { return /[A-Za-z]-$/.test(acc) ? acc.slice(0, -1) + L.text : (acc ? acc + ' ' : '') + L.text; }, '');
    });
    paras = paras.filter(function (P) { return P.text.replace(/\s/g, '').length > 1; });
    paras.sort(function (a, b) { return (a.y1 - b.y1) || (a.x1 - b.x1); });
    p.paras = paras;
    return paras;
  }
  function tapAt(sheet, cx, cy) {
    var n = parseInt(sheet.closest('.ncr-page').getAttribute('data-n'), 10);
    var p = S.pages[n - 1];
    if (p.state !== 'done') return;
    var box = sheet.getBoundingClientRect();
    var x = cx - box.left, y = cy - box.top;
    var paras = paragraphs(p);
    var hit = -1, pad = 4;
    paras.forEach(function (P, i) { if (hit === -1 && x >= P.x1 - pad && x <= P.x2 + pad && y >= P.y1 - pad && y <= P.y2 + pad) hit = i; });
    if (hit === -1) { clearPick(); hidePop(); return; }
    if (S.pick && S.pick.page === n && S.pick.idx.indexOf(hit) !== -1 && S.pick.idx.length === 1) { clearPick(); hidePop(); return; } // tap again = unselect
    global.getSelection().removeAllRanges();
    S.pick = { page: n, idx: [hit] };
    paintPick();
  }
  // The paragraph just below (or above) in the same column; else the next one on the page.
  function neighbour(paras, from, dir) {
    var P = paras[from], best = -1, bestD = 1e9;
    paras.forEach(function (Q, i) {
      if (i === from) return;
      var overlap = Math.min(P.x2, Q.x2) - Math.max(P.x1, Q.x1);
      var d = dir > 0 ? Q.y1 - P.y2 : P.y1 - Q.y2;
      if (d < -P.h * 0.5) return;
      var penalty = overlap > 0 ? 0 : 5000;
      if (d + penalty < bestD) { bestD = d + penalty; best = i; }
    });
    return best;
  }
  function grow(dir) {
    if (!S.pick) return;
    var p = S.pages[S.pick.page - 1];
    var paras = paragraphs(p);
    var idx = S.pick.idx;
    var edge = dir > 0 ? idx[idx.length - 1] : idx[0];
    var nb = neighbour(paras, edge, dir);
    if (nb === -1 || idx.indexOf(nb) !== -1) { K.toast(dir > 0 ? 'That was the last paragraph on this page.' : 'That was the first paragraph on this page.', 'info'); return; }
    if (dir > 0) idx.push(nb); else idx.unshift(nb);
    paintPick();
  }
  function paintPick() {
    S.pages.forEach(function (p) { var hl = p.el.querySelector('.ncr-hl'); if (hl) hl.innerHTML = ''; });
    if (!S.pick) return;
    var p = S.pages[S.pick.page - 1];
    var paras = paragraphs(p);
    var hl = p.el.querySelector('.ncr-hl');
    var html = '';
    var top = 1e9, bottom = 0, left = 1e9, right = 0;
    S.pick.idx.forEach(function (i) {
      var P = paras[i];
      P.lines.forEach(function (L) { html += '<div style="left:' + (L.x1 - 3) + 'px;top:' + (L.y1 - 2) + 'px;width:' + (L.x2 - L.x1 + 6) + 'px;height:' + (L.y2 - L.y1 + 4) + 'px"></div>'; });
      top = Math.min(top, P.y1); bottom = Math.max(bottom, P.y2); left = Math.min(left, P.x1); right = Math.max(right, P.x2);
    });
    hl.innerHTML = html;
    S.pick.text = S.pick.idx.map(function (i) { return paras[i].text; }).join('\n').slice(0, 6000);
    S.pick.box = { left: left, top: top, right: right, bottom: bottom };
    S.sel = { text: S.pick.text, page: S.pick.page };
    showPop('para');
  }
  function clearPick() {
    if (S.pick) { var p = S.pages[S.pick.page - 1]; var hl = p && p.el.querySelector('.ncr-hl'); if (hl) hl.innerHTML = ''; }
    S.pick = null;
    S.fig = null;
    S.pages.forEach(function (p) { var b = p.el && p.el.querySelector('.ncr-snipbox'); if (b) b.parentNode.removeChild(b); });
  }

  // --------------------------------------------------------- selection --
  function selectionInfo() {
    var sel = global.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.replace(/\s/g, '').length < 2) return null;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentNode;
    var pageEl = el.closest('.ncr-page') || (sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode).closest('.ncr-page'));
    if (!pageEl || !S.host.contains(pageEl)) return null;
    return { text: text.slice(0, 6000), page: parseInt(pageEl.getAttribute('data-n'), 10), rect: sel.getRangeAt(0).getBoundingClientRect() };
  }
  var POP = {
    text: [['board', 'presentation', 'Study on board'], ['explain', 'lightbulb', 'Explain simply'], ['summary', 'list-ordered', 'Summary'], ['quiz', 'circle-help', 'Quiz me']],
    figure: [['figure', 'lightbulb', 'Explain diagram'], ['figboard', 'presentation', 'Study on board'], ['figure_quiz', 'circle-help', 'Quiz on it'], ['figure_ask', 'message-circle-question', 'Ask about it']]
  };
  function showPop(kind, rect) {
    var pop = q('.ncr-pop');
    S.popKind = kind;
    S.popRect = rect || null;
    var acts = kind === 'figure' ? POP.figure : POP.text;
    pop.innerHTML = acts.map(function (a) { return '<button type="button" data-ncr-act="' + a[0] + '">' + ico(a[1]) + '<span>' + a[2] + '</span></button>'; }).join('')
      + (kind === 'para' ? '<span class="ncr-pop-sep"></span><button type="button" data-ncr-grow="-1" title="Add the paragraph above">' + ico('arrow-up') + '<span>Previous</span></button><button type="button" data-ncr-grow="1" title="Add the paragraph below">' + ico('arrow-down') + '<span>Next</span></button>' : '')
      + '<button type="button" class="ncr-pop-x" data-ncr-act="close" aria-label="Clear selection">' + ico('x') + '</button>';
    pop.querySelectorAll('button').forEach(function (btn) { btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
    pop.querySelectorAll('[data-ncr-grow]').forEach(function (btn) { btn.addEventListener('click', function () { grow(parseInt(btn.getAttribute('data-ncr-grow'), 10)); }); });
    pop.querySelectorAll('[data-ncr-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.getAttribute('data-ncr-act');
        if (a === 'close') { clearPick(); hidePop(); global.getSelection().removeAllRanges(); return; }
        if (kind === 'figure') { figureAction(a); return; }
        var s = S.sel;
        if (s) act(a, s.text, s.page);
      });
    });
    pop.hidden = false;
    icons();
    positionPop();
  }
  // Keeps the toolbar next to what is selected, also while scrolling.
  function positionPop() {
    var pop = q('.ncr-pop');
    if (!pop || pop.hidden) return;
    var rect = S.popRect;
    var holder = S.pick ? S.pages[S.pick.page - 1] : (S.fig ? S.pages[S.fig.page - 1] : null);
    if (holder && (S.pick || S.fig)) {
      var sb = holder.el.querySelector('.ncr-sheet').getBoundingClientRect();
      var bx = S.pick ? S.pick.box : S.fig.box;
      rect = { left: sb.left + bx.left, right: sb.left + bx.right, top: sb.top + bx.top, bottom: sb.top + bx.bottom, width: bx.right - bx.left };
    }
    if (!S.pick && !S.fig) {
      var sel = global.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) rect = sel.getRangeAt(0).getBoundingClientRect();
    }
    if (!rect) return;
    var box = S.host.querySelector('.ncr-reader').getBoundingClientRect();
    var pages = q('.ncr-pages').getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(8, Math.min(box.width - w - 8, rect.left - box.left + (rect.right - rect.left) / 2 - w / 2));
    var top = rect.top - box.top - h - 10;
    if (rect.top - h - 10 < pages.top) top = rect.bottom - box.top + 10;
    top = Math.max(pages.top - box.top + 4, Math.min(pages.bottom - box.top - h - 4, top));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function hidePop() { var pop = q('.ncr-pop'); if (pop) pop.hidden = true; }

  // ---------------------------------------------------------- diagrams --
  function setSnip(on) {
    S.snip = on;
    var btn = q('[data-ncr="snip"]');
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
    q('.ncr-snipbar').hidden = !on;
    q('.ncr-pages').classList.toggle('ncr-snipping', on);
    if (on) { clearPick(); hidePop(); global.getSelection().removeAllRanges(); bindSnip(); }
  }
  function bindSnip() {
    var pagesEl = q('.ncr-pages');
    if (pagesEl._snipBound) return;
    pagesEl._snipBound = true;
    var drag = null;
    pagesEl.addEventListener('pointerdown', function (e) {
      if (!S.snip) return;
      var sheet = e.target.closest && e.target.closest('.ncr-sheet');
      if (!sheet) return;
      e.preventDefault();
      var b = sheet.getBoundingClientRect();
      var el = document.createElement('div');
      el.className = 'ncr-snipbox';
      sheet.appendChild(el);
      drag = { sheet: sheet, b: b, x: e.clientX - b.left, y: e.clientY - b.top, el: el };
      try { sheet.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    pagesEl.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.max(0, Math.min(drag.b.width, e.clientX - drag.b.left)), y = Math.max(0, Math.min(drag.b.height, e.clientY - drag.b.top));
      drag.box = { left: Math.min(x, drag.x), top: Math.min(y, drag.y), right: Math.max(x, drag.x), bottom: Math.max(y, drag.y) };
      var s = drag.el.style;
      s.left = drag.box.left + 'px'; s.top = drag.box.top + 'px'; s.width = (drag.box.right - drag.box.left) + 'px'; s.height = (drag.box.bottom - drag.box.top) + 'px';
    });
    var end = function () {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (!d.box || d.box.right - d.box.left < 30 || d.box.bottom - d.box.top < 30) { d.el.parentNode.removeChild(d.el); K.toast('Drag a bigger box around the whole diagram.', 'info'); return; }
      var n = parseInt(d.sheet.closest('.ncr-page').getAttribute('data-n'), 10);
      setSnip(false);
      d.sheet.appendChild(d.el);
      S.fig = { page: n, box: d.box, image: null };
      crop(n, d.box).then(function (img) { if (S.fig && S.fig.box === d.box) S.fig.image = img; }).catch(function () { K.toast('That part of the page could not be copied. Try again.', 'warning'); });
      showPop('figure');
    };
    pagesEl.addEventListener('pointerup', end);
    pagesEl.addEventListener('pointercancel', end);
  }
  // A sharp copy of the boxed part of the page (drawn again at high resolution, then cut out).
  function crop(n, bx) {
    var p = S.pages[n - 1];
    return S.pdf.getPage(n).then(function (page) {
      var w = (bx.right - bx.left) / S.scale, h = (bx.bottom - bx.top) / S.scale; // in PDF units
      var k = Math.min(3, 1400 / Math.max(w, h)); // longest side about 1400 px
      var vp = page.getViewport({ scale: k });
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      var ox = bx.left / S.scale * k, oy = bx.top / S.scale * k;
      return page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -ox, -oy] }).promise.then(function () {
        return c.toDataURL('image/jpeg', 0.85);
      });
    }).then(function (img) { if (p) p.lastCrop = img; return img; });
  }
  function figureAction(a) {
    var f = S.fig;
    if (!f) return;
    hidePop();
    var ready = f.image ? Promise.resolve(f.image) : crop(f.page, f.box);
    ready.then(function (img) {
      f.image = img;
      return pageText(f.page).then(function (t) {
        if (a === 'figboard') {
          hidePop();
          openBoard({ title: 'Figure on page ' + f.page + ' of ' + S.book.title, text: (t || '').slice(0, 3000), source: source(f.page), subjectName: S.book.subject, image: img });
          return;
        }
        if (a === 'figure_ask') { hidePop(); askFigure(f, img, t); return; }
        runAi(a, { text: (t || '').slice(0, 3000), page: f.page, image: img, count: 5 }, { label: a === 'figure' ? 'The diagram, explained' : 'Quiz on the diagram', where: 'Diagram, page ' + f.page, image: img });
      });
    }).catch(function () { K.toast('That part of the page could not be copied. Try again.', 'warning'); });
  }
  function askFigure(f, img, t) {
    var panel = openPanel('Ask about the diagram', 'Diagram, page ' + f.page, img);
    panel.insertAdjacentHTML('beforeend', '<form class="ncr-ask" data-ncr-ask><label for="ncrAskQ">Your question about this diagram</label><textarea id="ncrAskQ" class="form-control" rows="2" maxlength="300" placeholder="e.g. Why are the field lines closer near the charge?"></textarea><button type="submit" class="btn-primary">Ask</button></form>');
    var form = panel.querySelector('[data-ncr-ask]');
    form.querySelector('textarea').focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var qn = form.querySelector('textarea').value.trim();
      if (qn.length < 3) return;
      runAi('figure_ask', { text: (t || '').slice(0, 3000), page: f.page, image: img, question: qn }, { label: 'Your question', where: qn, image: img });
    });
  }

  // ------------------------------------------------------ multi-page quiz --
  function tick(n, on, box) {
    var list = S.ticked;
    if (on) {
      if (list.length >= MAX_QUIZ_PAGES) { box.checked = false; K.toast('You can pick up to ' + MAX_QUIZ_PAGES + ' pages at once.', 'info'); return; }
      if (list.indexOf(n) === -1) list.push(n);
    } else S.ticked = list = list.filter(function (x) { return x !== n; });
    list.sort(function (a, b) { return a - b; });
    var bar = q('.ncr-tickbar');
    if (!list.length) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '<span>' + ico('book-copy') + ' Page' + (list.length > 1 ? 's ' : ' ') + list.join(', ') + '</span>'
      + '<button type="button" class="ncr-bar-btn" data-ncr-tsum>' + ico('list-ordered') + ' Summary</button>'
      + '<select class="form-select" data-ncr-tq aria-label="Number of questions">' + [5, 10, 15].map(function (c) { return '<option value="' + c + '"' + (c === Math.min(15, list.length * 5) ? ' selected' : '') + '>' + c + ' questions</option>'; }).join('') + '</select>'
      + '<button type="button" class="btn-primary" data-ncr-tgo>' + ico('circle-help') + ' Quiz</button><button type="button" class="ncr-icon-btn" data-ncr-tclear aria-label="Clear picked pages">' + ico('x') + '</button>';
    bar.querySelector('[data-ncr-tgo]').addEventListener('click', function () { multiPages('quiz', S.ticked.slice(), parseInt(bar.querySelector('[data-ncr-tq]').value, 10)); });
    bar.querySelector('[data-ncr-tsum]').addEventListener('click', function () { multiPages('summary', S.ticked.slice()); });
    bar.querySelector('[data-ncr-tclear]').addEventListener('click', function () {
      S.ticked = [];
      S.host.querySelectorAll('[data-ncr-tick]').forEach(function (c) { c.checked = false; });
      bar.hidden = true;
    });
    icons();
  }
  function quizDialog() {
    var cur = current(), max = S.pdf.numPages;
    var ov = document.createElement('div');
    ov.className = 'ncr-modal';
    ov.innerHTML = '<div class="ncr-dialog glass-card" role="dialog" aria-modal="true" aria-labelledby="ncrQzTitle"><h3 id="ncrQzTitle">Study several pages</h3>'
      + '<p class="ncr-muted">Choose up to ' + MAX_QUIZ_PAGES + ' pages in a row. Tip: you can also tick "Pick page" on any pages while reading.</p>'
      + '<div class="ncr-up-grid"><label>From page<input class="form-control" type="number" min="1" max="' + max + '" data-qz="from" value="' + cur + '"></label>'
      + '<label>To page<input class="form-control" type="number" min="1" max="' + max + '" data-qz="to" value="' + Math.min(max, cur + 2) + '"></label>'
      + '<label>Quiz questions<select class="form-select" data-qz="count"><option>5</option><option selected>10</option><option>15</option></select></label></div>'
      + '<p class="ncr-up-msg ncr-muted" aria-live="polite"></p>'
      + '<div class="ncr-dialog-actions"><button type="button" class="btn-secondary" data-qz="cancel">Cancel</button><button type="button" class="btn-secondary" data-qz="sum">Summary</button><button type="button" class="btn-primary" data-qz="go">Quiz</button></div></div>';
    document.body.appendChild(ov);
    var $ = function (k) { return ov.querySelector('[data-qz="' + k + '"]'); };
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
    $('cancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var start = function (what) {
      var a = parseInt($('from').value, 10), b = parseInt($('to').value, 10);
      var msg = ov.querySelector('.ncr-up-msg');
      if (!(a >= 1 && b >= a && b <= max)) { msg.textContent = 'Enter pages between 1 and ' + max + ', with "To" not before "From".'; return; }
      if (b - a + 1 > MAX_QUIZ_PAGES) { msg.textContent = 'That is ' + (b - a + 1) + ' pages. Choose at most ' + MAX_QUIZ_PAGES + '.'; return; }
      close();
      multiPages(what, range(a, b), parseInt($('count').value, 10));
    };
    $('go').addEventListener('click', function () { start('quiz'); });
    $('sum').addEventListener('click', function () { start('summary'); });
    $('from').focus();
  }
  function multiPages(what, list, count) {
    Promise.all(list.map(pageText)).then(function (texts) {
      var useful = [], parts = [];
      texts.forEach(function (t, i) { if (t && t.replace(/\s/g, '').length > 40) { useful.push(list[i]); parts.push('[Page ' + list[i] + '] ' + t.slice(0, 3000)); } });
      if (!useful.length) { K.toast('These pages have almost no text (they may be picture pages).', 'info'); return; }
      var where = 'Page' + (useful.length > 1 ? 's ' : ' ') + useful.join(', ');
      if (what === 'summary') runAi('summary', { text: parts.join('\n'), pages: useful, page: useful[0] }, { label: 'Summary of ' + useful.length + ' page' + (useful.length > 1 ? 's' : ''), where: where });
      else runAi('quiz', { text: parts.join('\n'), pages: useful, page: useful[0], count: count }, { label: count + '-question quiz', where: where });
    });
  }

  // ----------------------------------------------------------- actions --
  function pageAction(action, n) {
    pageText(n).then(function (t) {
      if (!t || t.replace(/\s/g, '').length < 40) { K.toast('This page has almost no text (it may be a picture page). Use "Study a diagram" to study a figure.', 'info'); return; }
      act(action, t, n, true);
    });
  }
  function source(page) { return S.book.title + ', Class ' + S.book.classNo + ' ' + S.book.subject + ', page ' + page; }
  function openBoard(p) {
    if (!global.StudyBoard || !global.StudyBoard.openText) { K.toast('The Study Board is not available.', 'warning'); return; }
    global.StudyBoard.openText(role() === 'student' ? 'student' : 'teacher', p);
  }
  function act(action, text, page, wholePage) {
    global.getSelection().removeAllRanges();
    hidePop();
    if (action === 'board') {
      var first = text.split(/(?<=[.?!])\s/)[0] || text;
      openBoard({ title: wholePage ? 'Page ' + page + ' of ' + S.book.title : (first.length > 70 ? first.slice(0, 67) + '...' : first), text: text, source: source(page), subjectName: S.book.subject });
      return;
    }
    var label = { summary: 'Summary', explain: 'Explained simply', quiz: 'Quiz' }[action];
    var where = (wholePage ? 'Whole page ' : 'Your selection, page ') + page;
    if (!wholePage && text.length < 160) {
      // Only a heading or a line: the page around it tells the AI what the topic is about.
      pageText(page).then(function (t) { runAi(action, { text: text, page: page, count: 5, context: (t || '').slice(0, 4000) }, { label: label, where: where }); });
      return;
    }
    runAi(action, { text: text, page: page, count: 5 }, { label: label, where: where });
  }
  function openPanel(label, where, image) {
    var panel = q('.ncr-panel');
    var wasHidden = panel.hidden;
    panel.hidden = false;
    panel.innerHTML = '<div class="ncr-panel-head"><div><b>' + esc(label) + '</b><span>' + esc(where) + '</span></div>'
      + '<button type="button" class="ncr-icon-btn" data-ncr-p="close" aria-label="Close">' + ico('x') + '</button></div>'
      + (image ? '<img class="ncr-figimg" alt="The diagram you selected" src="' + image + '">' : '');
    panel.querySelector('[data-ncr-p="close"]').addEventListener('click', function () { panel.hidden = true; S.lastAsk = null; if (!S.zoomed && global.innerWidth > 900) S.onResize(); });
    if (wasHidden && !S.zoomed && global.innerWidth > 900) S.onResize(); // pages shrink to fit beside the panel
    icons();
    return panel;
  }
  function runAi(action, body, view) {
    var panel = openPanel(view.label, view.where, view.image);
    panel.insertAdjacentHTML('beforeend', '<div class="ncr-wait">' + K.loading(/quiz/.test(action) ? 'Making your quiz...' : (view.image ? 'Looking at the diagram...' : 'Reading the text...')) + '</div>');
    var ask = S.lastAsk = { action: action, body: body, view: view };
    K.post('/api/ncert-library/ai', Object.assign({ action: action, language: S.lang, bookId: S.book.id }, body)).then(function (r) {
      if (S.lastAsk !== ask) return;
      var res = r.result || {};
      var kind = action === 'figure' ? 'figure' : (/quiz/.test(action) ? 'quiz' : (action === 'summary' ? 'summary' : 'explain'));
      var wait = panel.querySelector('.ncr-wait');
      if (wait) wait.parentNode.removeChild(wait);
      var f = panel.querySelector('[data-ncr-ask]');
      if (f) f.parentNode.removeChild(f);
      panel.insertAdjacentHTML('beforeend', (res.offline ? '<p class="ncr-note">' + (res.reason ? 'The AI helper could not answer: ' + esc(res.reason) + ' ' : '') + (view.image ? '' : 'This was made directly from the book text.') + '</p>' : '')
        + (kind === 'summary' ? summaryHtml(res) : kind === 'explain' ? explainHtml(res) : kind === 'figure' ? figureHtml(res) : quizHtml(res))
        + '<div class="ncr-panel-actions">'
        + (body.pages && body.pages.length > 1 ? '' : '<button type="button" class="btn-secondary" data-ncr-p="board">' + ico('presentation') + ' Study this on the board</button>')
        + (kind !== 'quiz' ? '<button type="button" class="btn-secondary" data-ncr-p="quiz">' + ico('circle-help') + ' Quiz me on it</button>' : '')
        + (view.image ? '<button type="button" class="btn-secondary" data-ncr-p="ask">' + ico('message-circle-question') + ' Ask about it</button>' : '') + '</div>');
      var b = panel.querySelector('[data-ncr-p="board"]');
      if (b) b.addEventListener('click', function () {
        if (view.image) openBoard({ title: 'Figure on page ' + body.page + ' of ' + S.book.title, text: body.text, source: source(body.page), subjectName: S.book.subject, image: view.image });
        else act('board', body.text, body.page);
      });
      var z = panel.querySelector('[data-ncr-p="quiz"]');
      if (z) z.addEventListener('click', function () { runAi(view.image ? 'figure_quiz' : 'quiz', Object.assign({}, body, { count: 5 }), { label: view.image ? 'Quiz on the diagram' : 'Quiz', where: view.where, image: view.image }); });
      var aq = panel.querySelector('[data-ncr-p="ask"]');
      if (aq) aq.addEventListener('click', function () { askFigure({ page: body.page }, view.image, body.text); });
      if (kind === 'quiz') bindQuiz(panel, res);
      icons();
    }).catch(function (err) {
      if (S.lastAsk !== ask) return;
      var wait = panel.querySelector('.ncr-wait');
      if (wait) wait.outerHTML = K.errorBox(err);
      icons();
    });
  }
  function summaryHtml(r) {
    return (r.title ? '<h4>' + tex(r.title) + '</h4>' : '')
      + '<ol class="ncr-points">' + (r.points || []).map(function (p) { return '<li>' + tex(p) + '</li>'; }).join('') + '</ol>'
      + ((r.formulas || []).length ? '<h5>Formulas</h5><div class="ncr-formulas">' + r.formulas.map(function (f) { return '<div>' + tex(f) + '</div>'; }).join('') + '</div>' : '')
      + ((r.terms || []).length ? '<h5>Words to know</h5><dl class="ncr-terms">' + r.terms.map(function (t) { return '<dt>' + tex(t.term) + '</dt><dd>' + tex(t.meaning) + '</dd>'; }).join('') + '</dl>' : '');
  }
  function explainHtml(r) {
    return (r.title ? '<h4>' + tex(r.title) + '</h4>' : '')
      + '<div class="ncr-steps">' + (r.simple || []).map(function (l, i) { return '<p><span>' + (i + 1) + '</span>' + tex(l) + '</p>'; }).join('') + '</div>'
      + (r.example ? '<div class="ncr-example"><b>Example</b> ' + tex(r.example) + '</div>' : '')
      + (r.remember ? '<div class="ncr-remember"><b>Remember</b> ' + tex(r.remember) + '</div>' : '');
  }
  function figureHtml(r) {
    return (r.title ? '<h4>' + tex(r.title) + '</h4>' : '')
      + (r.what ? '<p class="ncr-what">' + tex(r.what) + '</p>' : '')
      + ((r.parts || []).length ? '<h5>Parts of the diagram</h5><dl class="ncr-terms">' + r.parts.map(function (t) { return '<dt>' + tex(t.label) + '</dt><dd>' + tex(t.meaning) + '</dd>'; }).join('') + '</dl>' : '')
      + ((r.steps || []).length ? '<h5>How to read it</h5><div class="ncr-steps">' + r.steps.map(function (l, i) { return '<p><span>' + (i + 1) + '</span>' + tex(l) + '</p>'; }).join('') + '</div>' : '')
      + (r.remember ? '<div class="ncr-remember"><b>Remember</b> ' + tex(r.remember) + '</div>' : '');
  }
  function quizHtml(r) {
    var qs = r.questions || [];
    if (!qs.length) return '<p class="ncr-muted">Not enough text to make a quiz. Choose a longer part.</p>';
    return '<div class="ncr-quiz">' + qs.map(function (qq, i) {
      return '<div class="ncr-q" data-q="' + i + '"><p><b>Q' + (i + 1) + '.</b> ' + tex(qq.q) + '</p>'
        + qq.options.map(function (o, j) { return '<button type="button" class="ncr-opt" data-q="' + i + '" data-o="' + j + '"><span>' + 'ABCD'[j] + '</span> ' + tex(o) + '</button>'; }).join('')
        + '<p class="ncr-why" hidden></p></div>';
    }).join('') + '<p class="ncr-score" aria-live="polite"></p></div>';
  }
  function bindQuiz(panel, r) {
    var right = 0, done = 0;
    panel.querySelectorAll('.ncr-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-q'), j = +btn.getAttribute('data-o');
        var box = panel.querySelector('.ncr-q[data-q="' + i + '"]');
        if (box.classList.contains('answered')) return;
        box.classList.add('answered');
        var qq = r.questions[i];
        box.querySelectorAll('.ncr-opt').forEach(function (b, k) { b.disabled = true; if (k === qq.answer) b.classList.add('right'); else if (k === j) b.classList.add('wrong'); });
        done += 1;
        if (j === qq.answer) right += 1;
        var why = box.querySelector('.ncr-why');
        why.hidden = false;
        why.innerHTML = (j === qq.answer ? '<b class="ok">Correct.</b> ' : '<b class="no">Not quite.</b> ') + tex(qq.why || '');
        if (done === r.questions.length) panel.querySelector('.ncr-score').innerHTML = '<b>Score: ' + right + ' / ' + done + '</b> ' + (right === done ? 'Excellent!' : right >= done / 2 ? 'Good. Read the ones you missed once more.' : 'Read this part again, then try the quiz once more.');
      });
    });
  }

  global.NcertReader = { mount: mount };
})(window);
