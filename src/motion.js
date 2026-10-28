/*!
 * motion.js: the animation layer for the Aurelle Skin Clinic demo site.
 * Vanilla JS, no libraries. Loaded in <head> (not deferred) so it can mark
 * <html class="mo"> before first paint; it never touches booking, enquiry,
 * language or tracking code, and switches itself off with
 * prefers-reduced-motion or on any error. Styles: motion.css.
 */
(function () {
  /* ── Motion core: the same small engine on every demo site ──────────────
     Progressive enhancement: this file runs in <head>. Only when the browser
     can animate (and the visitor has not asked for reduced motion) does it add
     .mo to <html>, and only then is anything hidden-until-revealed. Without JS,
     with reduced motion, or if anything here throws, the page is the page. */
  'use strict';
  var doc = document, root = doc.documentElement, W = window;
  var mm = function (q) { try { return W.matchMedia(q).matches; } catch (e) { return false; } };
  var REDUCE = mm('(prefers-reduced-motion: reduce)');
  var CAN = 'IntersectionObserver' in W && 'requestAnimationFrame' in W && typeof Element !== 'undefined' &&
    'animate' in Element.prototype && W.CSS && CSS.supports && CSS.supports('translate', '1px') && CSS.supports('clip-path', 'inset(0)');
  var ON = !!(CAN && !REDUCE);
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var EASE = 'cubic-bezier(.16, 1, .3, 1)';      // expo out: fast, then a long settle
  var EASE_IO = 'cubic-bezier(.65, 0, .35, 1)';  // in-out for travelling things
  var SPRING = 'cubic-bezier(.34, 1.56, .64, 1)'; // a little overshoot
  var inited = false;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function outExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function inOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function svg(markup) {
    var t = doc.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  /* Reveal variants: keyframes for the Web Animations API. They use the
     individual translate / scale / rotate properties and clip-path, so they
     never fight a site's own `transform` hovers or `transition` lists. */
  var V = {
    rise: [{ opacity: 0, translate: '0 42px' }, { opacity: 1, translate: '0 0' }],
    riseSm: [{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    left: [{ opacity: 0, translate: '-56px 0' }, { opacity: 1, translate: '0 0' }],
    right: [{ opacity: 0, translate: '56px 0' }, { opacity: 1, translate: '0 0' }],
    zoom: [{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }],
    pop: [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }],
    blur: [{ opacity: 0, filter: 'blur(14px)', translate: '0 14px' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }],
    tilt: [{ opacity: 0, translate: '0 64px', rotate: '-2.5deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }],
    tiltR: [{ opacity: 0, translate: '0 64px', rotate: '2.5deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }],
    wipe: [{ opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)' }],
    wipeL: [{ opacity: 1, clipPath: 'inset(0 0 0 100%)' }, { opacity: 1, clipPath: 'inset(0 0 0 0%)' }],
    wipeUp: [{ opacity: 1, clipPath: 'inset(100% 0 0 0)', translate: '0 24px' }, { opacity: 1, clipPath: 'inset(0% 0 0 0)', translate: '0 0' }],
    wipeDown: [{ opacity: 1, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0% 0)' }],
    curtain: [{ opacity: 1, clipPath: 'inset(10% 10% 10% 10% round 28px)', scale: 1.06 }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)', scale: 1 }],
    iris: [{ opacity: 1, clipPath: 'circle(0% at 50% 50%)' }, { opacity: 1, clipPath: 'circle(75% at 50% 50%)' }],
  };

  /* ── Reveal on scroll ── */
  var io = null;
  function reveal(el, v, delay, dur) {
    if (!el || el.__moDone) return null;
    el.__moDone = true;
    el.classList.add('mo-in');
    var kf = typeof v === 'function' ? v(el) : (V[v] || V.rise);
    var a = null;
    try { a = el.animate(kf, { duration: dur || 1000, delay: delay || 0, easing: EASE, fill: 'backwards' }); } catch (e) { /* shown anyway */ }
    if (el.__moThen) { try { el.__moThen(el, delay || 0); } catch (e) { /* decoration only */ } }
    return a;
  }
  function watch(el, v, opts) {
    opts = opts || {};
    if (!el || el.__moWatched) return;
    el.__moWatched = true;
    el.__moV = v; el.__moDelay = opts.delay || 0; el.__moDur = opts.dur; el.__moStagger = opts.stagger == null ? 90 : opts.stagger;
    if (opts.then) el.__moThen = opts.then;
    if (io) io.observe(el); else reveal(el, v);
  }
  function startIO() {
    io = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      hits.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      var n = 0;
      hits.forEach(function (el) {
        io.unobserve(el);
        reveal(el, el.__moV, el.__moDelay + n * el.__moStagger, el.__moDur);
        n++;
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  }

  /* ── Words: a headline rises word by word, each from behind its own mask.
     The spans stay (no reflow at the end); a language switch that rewrites
     the element simply drops them. ── */
  function splitWords(el) {
    var words = [];
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!/\S/.test(node.nodeValue)) return;
      var frag = doc.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
        var w = doc.createElement('span'); w.className = 'mo-w';
        var i = doc.createElement('span'); i.className = 'mo-wi'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w); words.push(i);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }
  function words(el, delay, step) {
    if (!el) return 0;
    var ws = splitWords(el);
    el.classList.add('mo-in');
    el.__moDone = true;
    ws.forEach(function (w, i) {
      w.animate([{ translate: '0 115%', rotate: '4deg' }, { translate: '0 0', rotate: '0deg' }],
        { duration: 1100, delay: delay + i * (step || 70), easing: EASE, fill: 'backwards' });
    });
    var end = delay + ws.length * (step || 70) + 1100;
    setTimeout(function () { el.classList.add('mo-wdone'); }, end);
    return end;
  }

  /* ── Counters: the first number in an element counts up to itself. Only
     that text node changes, and it always ends on the exact original text.
     If anything else rewrites it meanwhile (a language switch), we stop. ── */
  function count(el, dur, delay) {
    if (!el || el.__moCounted) return;
    el.__moCounted = true;
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), node = null;
    while (walker.nextNode()) { if (/\d/.test(walker.currentNode.nodeValue)) { node = walker.currentNode; break; } }
    if (!node) return;
    var orig = node.nodeValue;
    var m = orig.match(/\d[\d.,]*/);
    if (!m) return;
    var tok = m[0].replace(/[.,]$/, '');
    var thou = /^\d{1,3}([.,]\d{3})+$/.test(tok) ? tok.charAt(tok.search(/[.,]/)) : '';
    var dec = !thou && /[.,]/.test(tok) ? tok.charAt(tok.search(/[.,]/)) : '';
    var digits = dec ? tok.split(dec)[1].length : 0;
    var target = parseFloat(thou ? tok.split(thou).join('') : dec ? tok.replace(dec, '.') : tok);
    if (!isFinite(target) || target === 0) return;
    var pre = orig.slice(0, m.index), post = orig.slice(m.index + tok.length);
    function fmt(v) {
      var s = v.toFixed(digits);
      if (dec) s = s.replace('.', dec);
      if (thou) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
      return pre + s + post;
    }
    var last = fmt(0), t0 = null;
    node.nodeValue = last;
    dur = dur || 1400;
    function step(t) {
      if (!node.isConnected || node.nodeValue !== last) return; // someone else wrote here
      if (t0 === null) t0 = t + (delay || 0);
      var p = clamp((t - t0) / dur, 0, 1);
      last = p >= 1 ? orig : fmt(target * outExpo(p));
      node.nodeValue = last;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Scroll-linked work, batched into one rAF per frame ── */
  var scrollFns = [], ticking = false;
  function onScroll(fn) { scrollFns.push(fn); }
  function tick() {
    ticking = false;
    var vh = W.innerHeight || root.clientHeight, vw = root.clientWidth;
    for (var i = 0; i < scrollFns.length; i++) { try { scrollFns[i](vh, vw); } catch (e) { /* keep the others going */ } }
  }
  function kick() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }
  /** 0 when the element's top is at a·vh, 1 when it is at b·vh. */
  function enter(el, a, b, vh) { var r = el.getBoundingClientRect(); return clamp((vh * a - r.top) / (vh * (a - b)), 0, 1); }
  /** 0 when the element enters at the bottom, 1 when it leaves at the top. */
  function through(el, vh) { var r = el.getBoundingClientRect(); return clamp((vh - r.top) / (vh + r.height), 0, 1); }
  function visible(el, vh) { var r = el.getBoundingClientRect(); return r.bottom > -80 && r.top < vh + 80; }

  /* A band (usually a dark section) that opens out to full width as it comes in. */
  function band(el) {
    if (!el) return;
    onScroll(function (vh, vw) {
      var p = enter(el, 1.02, 0.55, vh);
      if (p >= 1) { if (el.style.clipPath) el.style.clipPath = ''; return; }
      var m = (1 - outExpo(p)) * Math.min(56, vw * 0.03), r = (1 - p) * 36;
      el.style.clipPath = 'inset(0 ' + m.toFixed(1) + 'px round ' + r.toFixed(1) + 'px)';
    });
  }

  /* Parallax: moves an element by `k` px per px its parent scrolls. */
  function parallax(el, k, ref) {
    if (!el) return;
    ref = ref || el.parentElement || el;
    onScroll(function (vh) {
      if (!visible(ref, vh)) return;
      var r = ref.getBoundingClientRect();
      var c = r.top + r.height / 2 - vh / 2;
      el.style.translate = '0 ' + (-c * k).toFixed(1) + 'px';
    });
  }

  /* ── Smooth, eased anchor scrolling that respects the sticky header ── */
  function headerOffset() {
    var sp = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var h = 0;
    $$('header, .nav, .top').forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position === 'sticky' || cs.position === 'fixed') h = Math.max(h, el.offsetHeight);
    });
    return Math.max(sp, h + 12);
  }
  var scrollAnim = null;
  function scrollToY(y, cb) {
    var start = W.scrollY, dist = y - start, t0 = null;
    var dur = clamp(Math.abs(dist) * 0.45, 450, 1150);
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    var stop = function () { scrollAnim = null; root.style.scrollBehavior = prev; W.removeEventListener('wheel', stop); W.removeEventListener('touchstart', stop); };
    W.addEventListener('wheel', stop, { passive: true });
    W.addEventListener('touchstart', stop, { passive: true });
    var id = {};
    scrollAnim = id;
    function step(t) {
      if (scrollAnim !== id) return;
      if (t0 === null) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1);
      W.scrollTo(0, start + dist * inOut(p));
      if (p < 1) requestAnimationFrame(step); else { stop(); if (cb) cb(); }
    }
    requestAnimationFrame(step);
  }
  function smoothAnchors() {
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a || a.target === '_blank') return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
      var id = decodeURIComponent(url.hash.slice(1));
      if (!id) return;
      var target = doc.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var y = target.getBoundingClientRect().top + W.scrollY - headerOffset();
      scrollToY(Math.max(0, y), function () {
        try { history.pushState(null, '', '#' + id); } catch (err) { /* file:// */ }
        if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
        try { target.focus({ preventScroll: true }); } catch (err) { /* old browser */ }
      });
    });
  }

  /* ── Hover and press micro-interactions (desktop pointers only for hover) ── */
  function magnetic(sel, strength) {
    if (!FINE) return;
    $$(sel).forEach(function (el) {
      var x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      function loop() {
        x = lerp(x, tx, 0.18); y = lerp(y, ty, 0.18);
        el.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
        if (Math.abs(x - tx) > 0.05 || Math.abs(y - ty) > 0.05) raf = requestAnimationFrame(loop);
        else { raf = 0; if (!tx && !ty) el.style.translate = ''; }
      }
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - r.left - r.width / 2) * (strength || 0.22);
        ty = (e.clientY - r.top - r.height / 2) * (strength || 0.22) * 1.3;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    });
  }
  function press(sel) {
    doc.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (!el) return;
      try { el.animate([{ scale: 1 }, { scale: 0.95 }, { scale: 1 }], { duration: 380, easing: EASE }); } catch (err) { /* fine */ }
    });
  }
  /* A soft light that follows the pointer across a card (CSS reads --mx/--my). */
  function spotlight(sel) {
    if (!FINE) return;
    doc.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  /* Draw an SVG stroke: from nothing to whole. */
  function draw(path, dur, delay, ease) {
    if (!path) return null;
    path.setAttribute('pathLength', '1');
    path.style.strokeDasharray = '1 3';
    var a = path.animate([{ strokeDashoffset: 1.02 }, { strokeDashoffset: 0 }], { duration: dur || 1400, delay: delay || 0, easing: ease || EASE_IO, fill: 'both' });
    return a;
  }

  /* ── Boot ── */
  var hideCss = [];
  function hide(sel) { hideCss.push('html.mo ' + sel + ':not(.mo-in)'); }
  function boot(cfg) {
    // Before first paint: what will be revealed starts hidden.
    if (ON) {
      root.classList.add('mo');
      (cfg.reveal || []).forEach(function (r) { hide(r[0]); });
      (cfg.hero || []).forEach(function (r) { hide(r[0]); });
      var st = doc.createElement('style');
      st.setAttribute('data-motion', '');
      st.textContent = hideCss.join(',\n') + ' { opacity: 0; }\n@media print { html.mo * { opacity: 1 !important; } }';
      (doc.head || root).appendChild(st);
      // If the page never gets as far as init, give the content back.
      setTimeout(function () { if (!inited) root.classList.remove('mo'); }, 5000);
    } else {
      root.classList.add(REDUCE ? 'mo-reduce' : 'mo-off');
    }
    function init() {
      if (inited) return;
      inited = true;
      try {
        if (ON) {
          startIO();
          (cfg.reveal || []).forEach(function (r) {
            $$(r[0]).forEach(function (el) { watch(el, r[1], r[2]); });
          });
          (cfg.counters || []).forEach(function (c) {
            $$(c[0]).forEach(function (el) {
              var prev = el.__moThen;
              if (el.__moWatched) {
                el.__moThen = function (x, d) { if (prev) prev(x, d); count(x, c[1], d + (c[2] || 150)); };
              } else {
                var cio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { cio.disconnect(); count(el, c[1], c[2] || 0); } }); }, { rootMargin: '0px 0px -10% 0px' });
                cio.observe(el);
              }
            });
          });
          (cfg.bands || []).forEach(function (s) { $$(s).forEach(band); });
          smoothAnchors();
          if (cfg.magnetic) magnetic(cfg.magnetic, cfg.magneticStrength);
          if (cfg.press) press(cfg.press);
          if (cfg.spotlight) spotlight(cfg.spotlight);
          W.addEventListener('scroll', kick, { passive: true });
          W.addEventListener('resize', kick, { passive: true });
        }
        if (cfg.site) cfg.site({ ON: ON, REDUCE: REDUCE });
        if (ON) {
          var go = function () {
            if (go.done) return; go.done = true;
            (cfg.hero || []).forEach(function (h) {
              var el = $(h[0]);
              if (!el) return;
              if (h[1] === 'words') words(el, h[2] || 0, h[3]);
              else reveal(el, h[1], h[2] || 0, h[3]);
            });
            if (cfg.afterHero) cfg.afterHero();
            kick();
          };
          // Wait (briefly) for the web fonts so the headline does not reflow mid-animation.
          if (doc.fonts && doc.fonts.ready) { doc.fonts.ready.then(go, go); setTimeout(go, 450); } else go();
        }
      } catch (err) {
        root.classList.remove('mo');
        if (W.console && console.warn) console.warn('motion: switched off', err);
      }
    }
    // After every other DOMContentLoaded handler (language, booking, listings).
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
    else setTimeout(init, 0);
  }

  /* ── Aurelle: soft light orbs drift in the arch; a serum drop falls,
     lands on the skin and spreads into rings of light ── */
  var ARCH = function (r) { return 'inset(' + r + ' 0 0 0 round 999px 999px 22px 22px)'; };
  var V_ARCH = [{ opacity: 1, clipPath: ARCH('100%') }, { opacity: 1, clipPath: ARCH('0%') }];

  function auraScene(on) {
    var arch = $('.arch');
    if (!arch || arch.__mo) return null;
    arch.__mo = true;
    var s = svg('<svg xmlns="' + SVGNS + '" class="mo-aura mo-deco" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<radialGradient id="mo-orb-a"><stop offset="0" stop-color="#FFF8EE" stop-opacity=".95"/><stop offset=".45" stop-color="#F6DCC8" stop-opacity=".45"/><stop offset="1" stop-color="#F6DCC8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mo-orb-b"><stop offset="0" stop-color="#FFE7C2" stop-opacity=".9"/><stop offset=".5" stop-color="#E8B98F" stop-opacity=".35"/><stop offset="1" stop-color="#E8B98F" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mo-orb-c"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".8"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="mo-serum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7D9A8"/><stop offset="1" stop-color="#D99A5B"/></linearGradient>' +
      '<linearGradient id="mo-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>' +
      '<clipPath id="mo-tube"><path d="M188 92 h24 v58 l-8 30 h-8 l-8 -30 z"/></clipPath>' +
      '</defs>' +
      '<g class="mo-orbs">' +
      '<circle class="mo-orb" r="120" fill="url(#mo-orb-a)"/>' +
      '<circle class="mo-orb" r="90" fill="url(#mo-orb-b)"/>' +
      '<circle class="mo-orb" r="70" fill="url(#mo-orb-c)"/>' +
      '<circle class="mo-orb" r="150" fill="url(#mo-orb-b)"/>' +
      '<circle class="mo-orb" r="54" fill="url(#mo-orb-a)"/>' +
      '</g>' +
      // The skin: a soft horizon of light where the drop lands.
      '<ellipse class="mo-skin" cx="200" cy="340" rx="150" ry="16" fill="url(#mo-orb-c)" opacity=".55"/>' +
      '<g class="mo-ripples" fill="none" stroke="#FFF8EE" stroke-width="1.6">' +
      '<ellipse class="mo-ripple" rx="60" ry="9"/><ellipse class="mo-ripple" rx="60" ry="9"/><ellipse class="mo-ripple" rx="60" ry="9"/></g>' +
      '<circle class="mo-bloom" r="70" fill="url(#mo-orb-a)"/>' +
      // The dropper: a glass pipette with serum inside.
      '<g class="mo-dropper">' +
      '<rect x="182" y="16" width="36" height="62" rx="18" fill="#7C5C4A" opacity=".88"/>' +
      '<rect x="178" y="72" width="44" height="14" rx="5" fill="#E9D9CD"/>' +
      '<g clip-path="url(#mo-tube)"><rect class="mo-level" x="180" y="110" width="40" height="80" fill="url(#mo-serum)"/></g>' +
      '<path d="M188 86 v64 l8 30 h8 l8 -30 v-64" fill="url(#mo-glass)" stroke="#FFFDFB" stroke-opacity=".9" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M193 98 v44" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/>' +
      '</g>' +
      '<path class="mo-drop" d="M0 -4 C 6 6, 12 13, 12 19 A 12 12 0 0 1 -12 19 C -12 13, -6 6, 0 -4 Z" fill="url(#mo-serum)" stroke="#FFF3E2" stroke-width="1.2"/>' +
      '<g class="mo-motes" fill="#FFF8EE"><circle cx="96" cy="210" r="2"/><circle cx="312" cy="170" r="1.6"/><circle cx="286" cy="330" r="2.2"/><circle cx="118" cy="360" r="1.4"/><circle cx="250" cy="96" r="1.5"/></g>' +
      '</svg>');
    arch.appendChild(s);
    var orbs = $$('.mo-orb', s).map(function (el, i) {
      var base = [[120, 150], [300, 250], [150, 330], [330, 430], [90, 440]][i];
      return { el: el, x: base[0], y: base[1], ax: 18 + i * 6, ay: 14 + i * 5, sp: 0.00016 + i * 0.00005, ph: i * 1.7, depth: [0.05, 0.12, 0.08, 0.16, 0.1][i] };
    });
    orbs.forEach(function (o) { o.el.setAttribute('transform', 'translate(' + o.x + ' ' + o.y + ')'); });
    $$('.mo-ripple', s).forEach(function (r) { r.setAttribute('transform', 'translate(200 340)'); r.style.opacity = on ? '0' : ''; });
    var bloom = $('.mo-bloom', s); bloom.setAttribute('transform', 'translate(200 340)'); bloom.style.opacity = on ? '0' : '.5';
    var drop = $('.mo-drop', s); drop.setAttribute('transform', 'translate(200 186)');
    if (!on) $$('.mo-ripple', s).forEach(function (r, i) { r.setAttribute('transform', 'translate(200 340) scale(' + (0.6 + i * 0.4) + ')'); r.style.opacity = String(0.6 - i * 0.18); });
    return { svg: s, arch: arch, orbs: orbs, drop: drop, ripples: $$('.mo-ripple', s), bloom: bloom, level: $('.mo-level', s), dropper: $('.mo-dropper', s), motes: $$('.mo-motes circle', s) };
  }

  function dropLoop(p) {
    var D = 4600;
    var T = function (y, sx, sy) { return 'translate(200px, ' + y + 'px) scale(' + sx + ', ' + sy + ')'; };
    p.drop.animate([
      { transform: T(182, 0, 0), opacity: 1, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: T(186, 1, 1), opacity: 1, offset: 0.3 },
      { transform: T(189, 0.92, 1.18), opacity: 1, offset: 0.4, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: T(334, 0.8, 1.3), opacity: 1, offset: 0.53 },
      { transform: T(340, 1.6, 0.3), opacity: 0, offset: 0.56 },
      { transform: T(340, 0, 0), opacity: 0 },
    ], { duration: D, iterations: Infinity });
    p.ripples.forEach(function (r, i) {
      var o = 0.54 + i * 0.06;
      r.animate([
        { transform: 'translate(200px, 340px) scale(0.05)', opacity: 0 },
        { transform: 'translate(200px, 340px) scale(0.05)', opacity: 0.95, offset: o },
        { transform: 'translate(200px, 340px) scale(2.3)', opacity: 0, offset: Math.min(o + 0.32, 1) },
        { transform: 'translate(200px, 340px) scale(2.3)', opacity: 0 },
      ], { duration: D, iterations: Infinity, easing: 'linear' });
    });
    p.bloom.animate([
      { opacity: 0, transform: 'translate(200px, 340px) scale(.4)' },
      { opacity: 0, transform: 'translate(200px, 340px) scale(.4)', offset: 0.53 },
      { opacity: 0.9, transform: 'translate(200px, 340px) scale(1.25)', offset: 0.62 },
      { opacity: 0, transform: 'translate(200px, 340px) scale(1.9)', offset: 0.95 },
      { opacity: 0, transform: 'translate(200px, 340px) scale(1.9)' },
    ], { duration: D, iterations: Infinity, easing: 'ease-out' });
    // The serum level falls a little with each drop, then refills (a gentle loop).
    p.level.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(0)', offset: 0.4 }, { transform: 'translateY(6px)', offset: 0.5 }, { transform: 'translateY(0)' }],
      { duration: D, iterations: Infinity, easing: 'ease-in-out' });
    p.motes.forEach(function (m, i) {
      m.animate([{ opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }], { duration: 2400 + i * 500, delay: i * 300, iterations: Infinity, easing: 'ease-in-out' });
    });
  }

  boot({
    hero: [
      ['.hero .kicker', 'riseSm', 0, 900],
      ['.hero h1', 'words', 140, 65],
      ['.hero .lede', 'blur', 640, 1100],
      ['.hero-actions', 'riseSm', 820],
      ['.hero .rating', 'riseSm', 960],
      ['.arch', function () { return V_ARCH; }, 80, 1800],
      ['.arch-col .next', 'rise', 1400, 1100],
    ],
    reveal: [
      ['.finder .section-head', 'rise'],
      ['.concerns > button', 'riseSm', { stagger: 55 }],
      ['.matches', 'riseSm', { delay: 200 }],
      ['.approach .section-head', 'blur'],
      ['.steps > li', function () { return V_ARCH; }, { stagger: 160, dur: 1300 }],
      ['.menu-intro', 'left'],
      ['.menu-list > li', 'wipe', { stagger: 80, dur: 1100 }],
      ['.team .section-head', 'rise'],
      ['.people > li', 'riseSm', { stagger: 120, then: function (el, d) {
        var pt = el.querySelector('.portrait');
        if (pt) pt.animate([{ clipPath: ARCH('100%') }, { clipPath: ARCH('0%') }], { duration: 1300, delay: d, easing: EASE, fill: 'backwards' });
      } }],
      ['.book-side', 'left'],
      ['.quote-lead figcaption', 'fade', { delay: 200 }],
      ['.quote-row > figure', 'rise', { stagger: 120 }],
      ['.visit-info', 'rise'],
      ['.visit .hours', 'right', { delay: 120 }],
      ['.ask-grid > div', 'left'],
      ['.ask-form', 'riseSm', { delay: 120 }],
      ['.footer .foot-row', 'fade'],
    ],
    counters: [['.menu-list .price', 1000, 250], ['.rating b', 1200, 1100]],
    bands: ['.menu'],
    magnetic: '.hero .btn-lg, .nav-book',
    press: '.btn, .concerns button, .menu-list a',
    spotlight: '.match',
    site: function (m) {
      var p = auraScene(m.ON);
      if (!m.ON || !p) return;
      // Arch lines draw upwards as the arch opens.
      var lines = $('.arch-lines');
      if (lines) lines.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], { duration: 2200, delay: 500, easing: EASE, fill: 'backwards' });
      p.dropper.animate([{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 1200, delay: 900, easing: EASE, fill: 'backwards' });
      p.svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1600, delay: 400, fill: 'backwards' });
      setTimeout(function () { dropLoop(p); }, 1500);
      // Orbs drift on their own, follow the pointer a little, and part as you scroll.
      var px = 0, py = 0, tpx = 0, tpy = 0, sy = 0, live = true;
      new IntersectionObserver(function (es) { live = es[0].isIntersecting; if (live) frame(); }).observe(p.arch);
      if (FINE) {
        p.arch.parentNode.addEventListener('pointermove', function (e) {
          var r = p.arch.getBoundingClientRect();
          tpx = ((e.clientX - r.left) / r.width - 0.5) * 60; tpy = ((e.clientY - r.top) / r.height - 0.5) * 60;
        });
        p.arch.parentNode.addEventListener('pointerleave', function () { tpx = 0; tpy = 0; });
      }
      onScroll(function () { sy = W.scrollY; });
      var raf = 0;
      function frame() {
        if (raf) return;
        raf = requestAnimationFrame(function step(t) {
          raf = 0;
          if (!live || doc.hidden) return;
          px = lerp(px, tpx, 0.05); py = lerp(py, tpy, 0.05);
          p.orbs.forEach(function (o, i) {
            var x = o.x + Math.sin(t * o.sp + o.ph) * o.ax + px * (i % 2 ? 1 : -0.6);
            var y = o.y + Math.cos(t * o.sp * 1.3 + o.ph) * o.ay + py * (i % 2 ? 0.8 : -0.5) - sy * o.depth * (i % 2 ? 1 : -0.6);
            o.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
          });
          frame();
        });
      }
      frame();
      doc.addEventListener('visibilitychange', function () { if (!doc.hidden) frame(); });

      // Stars light up one by one beside the rating.
      var stars = $('.rating .stars');
      if (stars && stars.textContent.trim().length === 5) {
        stars.textContent = '';
        for (var i = 0; i < 5; i++) {
          var st = doc.createElement('span'); st.className = 'mo-star'; st.textContent = '★'; stars.appendChild(st);
          st.animate([{ opacity: 0.15, scale: 0.4 }, { opacity: 1, scale: 1.25, offset: 0.6 }, { opacity: 1, scale: 1 }], { duration: 600, delay: 1200 + i * 110, easing: 'ease-out', fill: 'backwards' });
        }
      }

      // The lead review lights up word by word as you read down the page.
      var q = $('.quote-lead blockquote');
      if (q) {
        var ws = splitWords(q);
        q.classList.add('mo-read');
        onScroll(function (vh) {
          if (!visible(q, vh)) return;
          var k = Math.round(enter(q, 0.88, 0.38, vh) * ws.length);
          for (var j = 0; j < ws.length; j++) ws[j].classList.toggle('on', j < k);
        });
      }

      // A new set of treatments (the concern buttons) arrives one card at a time.
      var box = $('[data-matches]');
      if (box && 'MutationObserver' in W) {
        new MutationObserver(function () {
          $$('.match, .match-note', box).forEach(function (el, i) {
            el.animate([{ opacity: 0, translate: '0 26px', scale: 0.98 }, { opacity: 1, translate: '0 0', scale: 1 }], { duration: 800, delay: i * 90, easing: EASE, fill: 'backwards' });
          });
        }).observe(box, { childList: true });
      }
    },
  });
})();
