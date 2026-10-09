(function () {
  'use strict';

  var C = window.CONFIG;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var params = new URLSearchParams(location.search);
  var isTest = params.has('test');
  var isDemo = params.has('demo'); // ?demo — повністю робочий сайт, але нічого не надсилає

  var state = {
    noClicks: 0,
    answers: 0,
    choice: { place: null, when: null, treat: null },
  };

  // Ім'я з посилання (?to=Анжела) має пріоритет над config.js
  var recipient = window.recipientFromUrl();
  if (recipient) {
    C.to = recipient.to;
    C.toVocative = recipient.toVocative;
  }

  /* ---------- Тексти з config.js ---------- */
  $$('[data-t]').forEach(function (el) {
    var v = C[el.getAttribute('data-t')];
    if (v != null) el.textContent = v;
  });
  $('#letter-text').innerHTML = C.letter.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  $('#no').textContent = C.noLabels[0];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Штрихкод ---------- */
  function barcodeSvg(seed) {
    var x = 0, rects = '', n = seed;
    function rnd() { n = (n * 9301 + 49297) % 233280; return n / 233280; }
    while (x < 300) {
      var w = 1 + Math.floor(rnd() * 4);
      rects += '<rect x="' + x + '" width="' + w + '" height="46"/>';
      x += w + 1 + Math.floor(rnd() * 3);
    }
    return '<svg viewBox="0 0 300 46" preserveAspectRatio="none" fill="currentColor">' + rects + '</svg>';
  }
  $$('.barcode').forEach(function (el, i) { el.innerHTML = barcodeSvg(17 + i * 31); });

  /* ---------- Перфорація: вирізи по боках квитка ---------- */
  function updateCuts() {
    $$('.screen.is-active .t-body').forEach(function (body) {
      var perf = $('.perf', body);
      if (perf) body.style.setProperty('--cut', perf.offsetTop + 'px');
    });
  }
  window.addEventListener('resize', updateCuts);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateCuts);

  /* ---------- Екрани ---------- */
  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === id); });
    var no = $('#no');
    if (no.classList.contains('flying')) no.hidden = id !== 's-letter';
    updateCuts();
    window.scrollTo(0, 0);
    if (id === 's-letter') burst(40);
    if (id === 's-choose') { burst(70); validate(); }
    if (id === 's-done') { finish(); setTimeout(function () { burst(110); }, 2100); }
  }
  $$('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-go')); });
  });

  /* ---------- Так / Ні ---------- */
  var yes = $('#yes'), yesWrap = $('#yes-wrap'), no = $('#no'), teaser = $('#teaser');
  var yesScale = 1;
  var lastDodge = 0;
  var pointer = { x: -999, y: -999 };
  function trackPointer(e) { pointer.x = e.pageX; pointer.y = e.pageY; }
  document.addEventListener('pointermove', trackPointer, { passive: true });
  document.addEventListener('pointerdown', trackPointer, { passive: true });

  yes.addEventListener('click', function () { show('s-choose'); });
  no.addEventListener('click', dodge);
  // на комп'ютері тікає вже від наведення мишки
  no.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') dodge(); });

  function dodge() {
    // Мишка: кнопка тікає вже від наведення, а клік, що прилетів слідом, поки вона
    // ще в польоті, не має рахуватися як друга спроба
    var now = Date.now();
    if (now - lastDodge < 450) return;
    lastDodge = now;

    state.noClicks++;
    var n = state.noClicks;
    teaser.textContent = C.teasers[Math.min(n, C.teasers.length) - 1] || '';
    yesScale = Math.min(1.5, 1 + n * 0.075);

    if (n >= C.noLabels.length) {
      no.classList.add('gone');
      setTimeout(function () { no.hidden = true; }, 300);
      yes.style.transform = 'scale(' + yesScale + ')';
      return;
    }
    no.textContent = C.noLabels[n];

    // перший раз: виносимо кнопку з рядка і плавно центруємо «Так»
    if (!no.classList.contains('flying')) {
      var start = no.getBoundingClientRect();
      var before = yesWrap.getBoundingClientRect().left;
      document.body.appendChild(no);
      no.classList.add('flying');
      no.style.left = (start.left + scrollX) + 'px';
      no.style.top = (start.top + scrollY) + 'px';
      var dx = before - yesWrap.getBoundingClientRect().left;
      flip(yesWrap, dx);
      no.offsetWidth; // зафіксувати стартову позицію, щоб переліт був анімований
    }

    yes.style.transform = 'scale(' + yesScale + ')';
    placeNo(Math.max(0.55, 1 - n * 0.07));
  }

  function flip(el, dx) {
    if (!dx || reduceMotion) return;
    el.style.transition = 'none';
    el.style.transform = 'translateX(' + dx + 'px)';
    el.offsetWidth;
    el.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
    el.style.transform = '';
  }

  // Межі видимої частини екрана в координатах документа
  function viewport() {
    var vv = window.visualViewport;
    if (vv) return { x: vv.pageLeft, y: vv.pageTop, w: vv.width, h: vv.height };
    return { x: scrollX, y: scrollY, w: document.documentElement.clientWidth, h: innerHeight };
  }

  // Де буде «Так» після збільшення (у координатах документа). Беремо позицію
  // з розкладки (offsetLeft/Top), а не з екрана, бо анімації в процесі
  // (центрування, поява екрана) інакше збили б розрахунок.
  function yesRect(scale) {
    var x = 0, y = 0, el = yesWrap;
    while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    var cx = x + yesWrap.offsetWidth / 2, cy = y + yesWrap.offsetHeight / 2;
    var w = yesWrap.offsetWidth * scale, h = yesWrap.offsetHeight * scale;
    return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
  }

  function overlaps(a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }
  function inflate(a, p) { return { l: a.l - p, t: a.t - p, r: a.r + p, b: a.b + p }; }

  function placeNo(scale) {
    if (scale != null) no.dataset.scale = scale;
    scale = +no.dataset.scale || 1;
    no.style.transform = 'scale(' + scale + ')';

    var w = no.offsetWidth * scale, h = no.offsetHeight * scale;
    var vp = viewport(), m = 14;
    var minX = vp.x + m, maxX = vp.x + vp.w - m - w;
    var minY = vp.y + m, maxY = vp.y + vp.h - m - h;
    var cur = { l: parseFloat(no.style.left) || 0, t: parseFloat(no.style.top) || 0 };
    var forbidden = inflate(yesRect(yesScale), 24);
    var cursor = { l: pointer.x - 30, t: pointer.y - 30, r: pointer.x + 30, b: pointer.y + 30 };

    var best = null, bestScore = -1;
    for (var i = 0; i < 120; i++) {
      var x = minX + Math.random() * Math.max(0, maxX - minX);
      var y = minY + Math.random() * Math.max(0, maxY - minY);
      var rect = { l: x, t: y, r: x + w, b: y + h };
      if (overlaps(rect, forbidden) || overlaps(rect, cursor)) continue;
      var moved = Math.hypot(x - cur.l, y - cur.t);
      if (moved > 90) { best = { x: x, y: y }; break; }
      if (moved > bestScore) { bestScore = moved; best = { x: x, y: y }; }
    }
    if (!best) best = fallbackSpot(w, h, vp, m, forbidden);
    no.style.left = best.x + 'px';
    no.style.top = best.y + 'px';
  }

  // Якщо випадково нічого не знайшли — кут екрана, найдальший від «Так»
  function fallbackSpot(w, h, vp, m, forbidden) {
    var spots = [
      { x: vp.x + m, y: vp.y + m },
      { x: vp.x + vp.w - m - w, y: vp.y + m },
      { x: vp.x + m, y: vp.y + vp.h - m - h },
      { x: vp.x + vp.w - m - w, y: vp.y + vp.h - m - h },
    ];
    var cx = (forbidden.l + forbidden.r) / 2, cy = (forbidden.t + forbidden.b) / 2;
    spots.sort(function (a, b) {
      return Math.hypot(b.x + w / 2 - cx, b.y + h / 2 - cy) - Math.hypot(a.x + w / 2 - cx, a.y + h / 2 - cy);
    });
    return spots[0];
  }

  // Після повороту телефона чи зміни розміру — перевірити, що «Ні» не налізла на «Так»
  window.addEventListener('resize', function () {
    if (!no.classList.contains('flying') || no.hidden) return;
    var s = +no.dataset.scale || 1;
    var l = parseFloat(no.style.left), t = parseFloat(no.style.top);
    var rect = { l: l, t: t, r: l + no.offsetWidth * s, b: t + no.offsetHeight * s };
    var outside = rect.r > document.documentElement.clientWidth;
    if (outside || overlaps(rect, inflate(yesRect(yesScale), 24))) placeNo();
  });

  /* ---------- Оформлення ---------- */
  var dateFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });

  function whenDate(o) {
    if (o.hint) return o.hint;
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (o.offset != null) d.setDate(d.getDate() + o.offset);
    else if (o.weekday != null) d.setDate(d.getDate() + (o.weekday - d.getDay() + 7) % 7);
    return dateFmt.format(d);
  }

  var groups = {
    place: {
      el: $('#g-place'),
      kind: 'opt',
      items: C.places.map(function (p) { return { label: p.title, sub: p.desc }; }),
      customSub: 'Напишу, куди хочу',
      placeholder: 'Куди хочеш піти?',
    },
    when: {
      el: $('#g-when'),
      kind: 'chip',
      items: C.when.map(function (w) { return { label: w.label, sub: whenDate(w) }; }),
      customSub: 'свій день/час',
      placeholder: 'Коли тобі зручно?',
    },
    treat: {
      el: $('#g-treat'),
      kind: 'chip',
      items: C.treats.map(function (t) { return { label: t }; }),
      customSub: null,
      placeholder: 'Що взяти по дорозі?',
    },
  };

  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    var html = g.items.map(function (it, i) { return optionHtml(g, i, it.label, it.sub); }).join('');
    html += optionHtml(g, 'custom', 'Свій варіант', g.customSub);
    g.el.innerHTML = html;
    g.input = document.createElement('input');
    g.input.className = 'input custom-input';
    g.input.maxLength = 120;
    g.input.placeholder = g.placeholder;
    g.input.setAttribute('aria-label', g.placeholder);
    g.el.insertAdjacentElement('afterend', g.input);
    g.input.addEventListener('input', validate);

    $$('[role=radio]', g.el).forEach(function (btn) {
      btn.addEventListener('click', function () { pick(key, btn.getAttribute('data-i')); });
    });
  });

  function optionHtml(g, i, label, sub) {
    var cls = g.kind + (i === 'custom' ? ' custom' : '');
    var inner = g.kind === 'opt'
      ? '<b>' + esc(label) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '')
      : esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    return '<button type="button" role="radio" aria-checked="false" class="' + cls + '" data-i="' + i + '">' + inner + '</button>';
  }

  function pick(key, i) {
    var g = groups[key];
    $$('[role=radio]', g.el).forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-i') === i));
    });
    state.choice[key] = i;
    var custom = i === 'custom';
    g.input.classList.toggle('show', custom);
    if (custom) g.input.focus();
    validate();
  }

  // Що саме обрано в групі: { label, sub } або null
  function value(key) {
    var g = groups[key], i = state.choice[key];
    if (i == null) return null;
    if (i === 'custom') {
      var t = g.input.value.trim();
      return t ? { label: t, custom: true } : null;
    }
    return g.items[+i];
  }

  var names = { place: 'маршрут', when: 'час', treat: 'що беремо' };
  function validate() {
    var missing = Object.keys(groups).filter(function (k) { return !value(k); });
    $('#confirm').disabled = missing.length > 0;
    $('#hint').textContent = missing.length ? 'Ще обери: ' + missing.map(function (k) { return names[k]; }).join(', ') : '';
  }

  $('#confirm').addEventListener('click', function () { show('s-done'); });

  /* ---------- Фінал ---------- */
  function finish() {
    var place = value('place'), when = value('when'), treat = value('treat');
    var comment = $('#comment').value.trim();

    fitText($('#dest-name'), place.label);
    $('#r-when').innerHTML = esc(when.label) + (when.sub ? ' <small>· ' + esc(when.sub) + '</small>' : '');
    $('#r-treat').textContent = treat.label;
    $('#r-comment').textContent = comment;
    $('#r-comment-wrap').hidden = !comment;

    // перезапустити анімацію друку при повторному підтвердженні
    $$('.printed, .stamp').forEach(function (el) {
      el.style.animation = 'none';
      el.offsetWidth;
      el.style.animation = '';
    });
    setTimeout(updateCuts, 50);

    state.answers++;
    setSend('sending', 'Надсилаю ' + C.fromDative + '…');
    send({
      type: 'answer',
      revision: state.answers,
      test: isTest,
      to: C.to,
      place: place.label,
      when: when.label,
      whenDate: when.sub || '',
      treat: treat.label,
      comment: comment,
      noClicks: state.noClicks,
    }).then(function (res) {
      var toDat = C.fromDative;
      if (res === 'ok') setSend('ok', toDat + ' вже прийшла твоя відповідь. До зустрічі!');
      else if (res === 'demo') setSend('ok', 'Це демо: у справжній версії тут відповідь уже летить у Telegram.');
      else if (res === 'local') setSend('local', 'Відповідь нікуди не надсилається.<b>Зроби скріншот і надішли ' + esc(toDat) + ' :)</b>', true);
      else setSend('fail', 'Не вдалося надіслати — схоже, проблеми з інтернетом.<b>Зроби скріншот і надішли ' + esc(toDat) + ' :)</b>', true);
    });
  }

  // Зменшує шрифт, поки найдовше слово не влізе (щоб не різати слова навпіл)
  function fitText(el, text) {
    el.textContent = text;
    el.style.fontSize = '';
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 12) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }

  function setSend(st, text, html) {
    $('#send').setAttribute('data-state', st);
    if (html) $('#send-text').innerHTML = text;
    else $('#send-text').textContent = text;
  }

  /* ---------- Бекенд ---------- */
  function send(payload) {
    if (isDemo) return Promise.resolve('demo');
    if (!C.API_URL) return Promise.resolve('local');
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 15000);
    // text/plain — щоб браузер не робив зайвий CORS-запит, який Google не підтримує
    return fetch(C.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl && ctrl.signal,
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok ? 'ok' : 'fail'; })
      .catch(function () { return 'fail'; })
      .finally(function () { clearTimeout(timer); });
  }

  if (C.NOTIFY_ON_OPEN && C.API_URL) {
    var seen = false;
    try { seen = sessionStorage.getItem('opened') === '1'; sessionStorage.setItem('opened', '1'); } catch (e) {}
    if (!seen) send({ type: 'open', test: isTest, to: C.to });
  }

  /* ---------- Конфеті ---------- */
  var cv = $('#confetti'), ctx = cv.getContext && cv.getContext('2d');
  var parts = [], running = false, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var colors = ['#ffc53d', '#1e2b5e', '#e8473b', '#1f9d6b', '#8fa2ff', '#ffffff'];

  function resizeCanvas() {
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function burst(k) {
    if (!ctx || reduceMotion) return;
    for (var i = 0; i < k; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: innerHeight * 0.45,
        vx: (Math.random() - 0.5) * 14,
        vy: -6 - Math.random() * 9,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        r: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0],
        round: Math.random() < 0.3,
      });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.y < innerHeight + 30; });
    parts.forEach(function (p) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.28); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    });
    if (parts.length) requestAnimationFrame(tick);
    else running = false;
  }

  updateCuts();
})();
