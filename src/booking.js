/*!
 * Booking with Autisync CRM, straight from a business's own website.
 *
 *   AutisyncBooking.mount(element, { api, slug, app, copy })
 *   AutisyncBooking.choose('HydraFacial')       open the widget on a service
 *   AutisyncBooking.nextFree({ api, slug })     the first free time (for a hero)
 *
 * Talks to the CRM's public booking API (GET .../availability, POST .../book),
 * so a booking made here is the same record as one made on the CRM's own
 * booking page: the client, the appointment, the confirmation email and the
 * reminder. The slot arithmetic mirrors the CRM's (app/src/sections/booking/
 * slots.ts); the server checks every booking against opening hours and
 * overlaps, so a drift here shows a slot the server refuses, never a double
 * booking.
 */
(function () {
  'use strict';

  // ── Time ───────────────────────────────────────────────────────────────────
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function normalize(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var slotMinutes = Number(r.slotMinutes) > 0 ? Number(r.slotMinutes) : 30;
    var week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (r.week && typeof r.week === 'object') {
      Object.keys(week).forEach(function (d) {
        var list = r.week[d];
        if (Array.isArray(list)) {
          week[d] = list.filter(function (p) {
            return p && TIME_RE.test(p.start) && TIME_RE.test(p.end) && p.start < p.end;
          }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
        }
      });
    } else if (Array.isArray(r.days) && TIME_RE.test(String(r.start)) && TIME_RE.test(String(r.end))) {
      r.days.forEach(function (d) { week[d] = [{ start: r.start, end: r.end }]; });
    }
    return { slotMinutes: slotMinutes, week: week };
  }

  function zoneOffset(at, tz) {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(at).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime();
    } catch (e) { return 0; }
  }
  function wallTime(y, m, d, hh, mm, tz) {
    var guess = Date.UTC(y, m - 1, d, hh, mm);
    var once = guess - zoneOffset(new Date(guess), tz);
    return guess - zoneOffset(new Date(once), tz);
  }
  function todayIn(tz) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  }
  function addDays(x, n) {
    var t = new Date(Date.UTC(x.y, x.m - 1, x.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function keyOf(x) { return x.y + '-' + String(x.m).padStart(2, '0') + '-' + String(x.d).padStart(2, '0'); }
  function weekday(x) { return new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay(); }
  function isOpen(rules, x) { return (normalize(rules).week[weekday(x)] || []).length > 0; }

  /** Free starts on one day, in the business's time zone. A visit must end inside the period it starts in. */
  function slotsOn(x, rules, booked, minutes, tz) {
    var n = normalize(rules);
    var periods = n.week[weekday(x)] || [];
    var dur = (Number(minutes) || n.slotMinutes) * 60000;
    var now = Date.now();
    var out = [];
    periods.forEach(function (p) {
      var s = p.start.split(':').map(Number), e = p.end.split(':').map(Number);
      var end = wallTime(x.y, x.m, x.d, e[0], e[1], tz);
      for (var t = wallTime(x.y, x.m, x.d, s[0], s[1], tz); t < end; t += n.slotMinutes * 60000) {
        if (t + dur > end) break;
        if (t <= now) continue;
        var clash = (booked || []).some(function (b) { return t < new Date(b.ends_at).getTime() && t + dur > new Date(b.starts_at).getTime(); });
        if (!clash) out.push({ starts: t, ends: t + dur });
      }
    });
    return out;
  }

  // ── Text ───────────────────────────────────────────────────────────────────
  var COPY = {
    steps: ['Service', 'Day and time', 'Your details', 'Confirm'],
    loading: 'Loading the diary…',
    down: 'The diary isn\'t loading right now. Please call us instead.',
    free: 'Free',
    whoWith: 'Who with?',
    anyone: 'First available',
    chooseTime: 'Choose a time',
    earlier: 'Earlier days', later: 'Later days',
    closed: 'Closed', full: 'Full', today: 'Today', tomorrow: 'Tomorrow',
    freeN: function (n) { return n + ' free'; },
    pickDay: 'Pick a day to see free times.',
    noTimes: 'Nothing free on this day. Try the next one.',
    zone: 'UK time',
    cont: 'Continue', back: 'Back',
    name: 'Your name', email: 'Email', phone: 'Mobile', optional: 'optional',
    notes: 'Anything we should know?', notesPh: '',
    review: 'Check and confirm', needName: 'Please add your name.', needEmail: 'That email address doesn\'t look right.', needPhone: 'Please add a mobile number so we can reach you on the day.',
    summary: 'Your booking',
    what: 'What', when: 'When', with: 'With', who: 'Name', mail: 'Email',
    payOnDay: 'Paid on the day',
    payOnline: 'This one takes a deposit online. You\'ll finish on our secure booking page.',
    payBtn: 'Continue to payment',
    confirm: 'Confirm booking', sending: 'Booking…',
    doneTitle: 'You\'re booked in.',
    doneText: function (e) { return 'A confirmation is on its way to ' + e + ', with a link to change or cancel. We\'ll send a reminder the day before.'; },
    another: 'Book something else',
    taken: 'Someone has just taken that time. Please choose another.',
    powered: 'Bookings go straight into our diary',
    mins: function (m) { return m % 60 === 0 ? (m / 60) + (m === 60 ? ' hour' : ' hours') : m > 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function money(price, currency) {
    var n = Number(price);
    if (!price || !isFinite(n) || n <= 0) return null;
    try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return n + ' ' + currency; }
  }
  function firstName(full) { return String(full || '').split(' ')[0]; }

  // ── API ────────────────────────────────────────────────────────────────────
  function client(opts) {
    var root = String(opts.api || '').replace(/\/+$/, '') + '/bookings/public/' + encodeURIComponent(opts.slug);
    var cache = {};
    return {
      day: function (date, staffId) {
        var k = (staffId || 'any') + '|' + date;
        if (!cache[k]) {
          cache[k] = fetch(root + '/availability?date=' + date + (staffId ? '&staffId=' + encodeURIComponent(staffId) : ''), { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
            .catch(function (e) { delete cache[k]; throw e; });
        }
        return cache[k];
      },
      forget: function (date) { Object.keys(cache).forEach(function (k) { if (k.split('|')[1] === date) delete cache[k]; }); },
      book: function (body) {
        return fetch(root + '/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
      },
    };
  }

  function staffFor(base, service) {
    if (!service) return [];
    return (base.staff || []).filter(function (m) { return !m.serviceIds || !m.serviceIds.length || m.serviceIds.indexOf(service.id) >= 0; });
  }
  function rulesFor(base, member) {
    return (member && member.availability) || base.calendar.businessAvailabilityRules || base.calendar.availabilityRules;
  }

  /**
   * Free times on a day for a service, with the person who is free at each.
   * "First available" asks each person who does the service and merges their
   * diaries, so a slot shows when anyone can take it (and is booked with them).
   */
  function dayOptions(api, base, service, who, x) {
    var tz = base.calendar.timezone || 'Europe/London';
    var team = staffFor(base, service);
    var people = who ? team.filter(function (m) { return m.id === who; }) : team;
    if (!people.length) people = [null];
    var date = keyOf(x);
    return Promise.all(people.map(function (m) {
      if (!isOpen(rulesFor(base, m), x)) return [];
      return api.day(date, m && m.id).then(function (a) {
        return slotsOn(x, a.calendar.availabilityRules, a.bookedSlots, service.duration_minutes, tz)
          .map(function (s) { return { starts: s.starts, ends: s.ends, staff: m }; });
      });
    })).then(function (lists) {
      var byStart = {};
      lists.forEach(function (list) { list.forEach(function (s) { if (!byStart[s.starts]) byStart[s.starts] = s; }); });
      return Object.keys(byStart).map(function (k) { return byStart[k]; }).sort(function (a, b) { return a.starts - b.starts; });
    });
  }

  // ── Widget ─────────────────────────────────────────────────────────────────
  var instance = null;

  function mount(el, opts) {
    var t = Object.assign({}, COPY, opts.copy || {});
    var api = client(opts);
    var state = {
      base: null, failed: false, step: 1, service: null, who: '', offset: 0, day: null, slot: null,
      days: {}, form: { name: '', email: '', phone: '', notes: '', website: '' }, err: null, sending: false, done: null,
    };
    var tz = 'Europe/London', today = todayIn(tz);
    var fmtTime = function (ms) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(ms).replace(' ', '').replace(':00', ''); };
    var fmtDay = function (x, o) { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, o)).format(new Date(Date.UTC(x.y, x.m - 1, x.d, 12))); };
    var fmtWhen = function (s) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(s.starts) + ' at ' + fmtTime(s.starts); };

    function set(patch) { Object.assign(state, patch); render(); }
    function go(step) {
      set({ step: step, err: null });
      var top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function week() { var a = []; for (var i = 0; i < 7; i++) a.push(addDays(today, state.offset * 7 + i)); return a; }
    function team() { return staffFor(state.base, state.service); }
    function dayKey(x) { return (state.service ? state.service.id : '') + '|' + (state.who || 'any') + '|' + keyOf(x); }

    function openDay(x) {
      var people = state.who ? team().filter(function (m) { return m.id === state.who; }) : team();
      if (!people.length) people = [null];
      return people.some(function (m) { return isOpen(rulesFor(state.base, m), x); });
    }
    function loadWeek() {
      week().forEach(function (x) {
        var k = dayKey(x);
        if (state.days[k] || !openDay(x)) return;
        state.days[k] = 'loading';
        dayOptions(api, state.base, state.service, state.who, x)
          .then(function (list) { state.days[k] = list; pickFirst(); render(); })
          .catch(function () { state.days[k] = 'error'; render(); });
      });
    }
    function pickFirst() {
      if (state.step !== 2 || state.day) return;
      var w = week();
      for (var i = 0; i < w.length; i++) {
        var v = state.days[dayKey(w[i])];
        if (!openDay(w[i])) continue;
        if (v === undefined || v === 'loading') return; // wait, in order
        if (Array.isArray(v) && v.length) { state.day = w[i]; return; }
      }
      // A full week: move on to the next one by itself, once.
      if (state.offset === 0 && w.every(function (x) { var v = state.days[dayKey(x)]; return !openDay(x) || (Array.isArray(v) && !v.length); })) {
        state.offset = 1; loadWeek();
      }
    }

    function chooseService(id) {
      var s = (state.base.services || []).filter(function (x) { return x.id === id; })[0] || null;
      var who = state.who && staffFor(state.base, s).some(function (m) { return m.id === state.who; }) ? state.who : '';
      set({ service: s, who: who, slot: null, day: null, offset: 0 });
    }

    function submit() {
      var s = state.slot, svc = state.service;
      if (!s || !svc) return;
      set({ sending: true, err: null });
      var q = new URLSearchParams(location.search);
      api.book({
        fullName: state.form.name.trim(), email: state.form.email.trim(), phone: state.form.phone.trim(),
        notes: [state.form.notes.trim(), 'Booked on ' + location.hostname].filter(Boolean).join('\n\n'),
        startsAt: new Date(s.starts).toISOString(), endsAt: new Date(s.ends).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        serviceId: svc.id, staffId: s.staff ? s.staff.id : undefined, locationId: state.base.selectedLocationId || undefined,
        language: 'en', website: state.form.website,
        utm_source: q.get('utm_source') || undefined, utm_medium: q.get('utm_medium') || undefined, utm_campaign: q.get('utm_campaign') || undefined,
      }).then(function (r) {
        if (r.ok) {
          set({ sending: false, done: { email: state.form.email.trim(), slot: s, service: svc } });
          try { window.autisyncTrack && window.autisyncTrack('convert', 'Booked: ' + svc.name); } catch (e) { /* never block a booking */ }
          if (opts.onBooked) try { opts.onBooked(svc, s); } catch (e) { /* ignore */ }
          return;
        }
        var msg = r.data.error || (r.data.errors && r.data.errors[0] && r.data.errors[0].msg) || t.down;
        if (r.status === 409 && /not available/i.test(msg)) {
          var date = keyOf(state.day); api.forget(date); delete state.days[dayKey(state.day)];
          set({ sending: false, slot: null, step: 2, err: t.taken }); loadWeek();
          return;
        }
        set({ sending: false, err: msg });
      }).catch(function () { set({ sending: false, err: t.down }); });
    }

    // ── Render ──
    function progress() {
      var pct = state.step * 25;
      return '<div class="bk-progress"><div class="bk-bar"><i style="width:' + pct + '%"></i></div><ol class="bk-steps">' +
        t.steps.map(function (label, i) {
          var n = i + 1, st = n === state.step ? 'now' : n < state.step ? 'done' : 'next';
          return '<li data-state="' + st + '"><button type="button" data-go="' + n + '"' + (n < state.step ? '' : ' disabled') + (n === state.step ? ' aria-current="step"' : '') + '>' +
            '<span class="bk-num">' + (n < state.step ? '✓' : n) + '</span><span class="bk-label">' + esc(label) + '</span></button></li>';
        }).join('') + '</ol></div>';
    }

    function stepService() {
      var svcs = state.base.services || [];
      var html = '<div class="bk-list" role="radiogroup" aria-label="' + esc(t.steps[0]) + '">' + svcs.map(function (s) {
        var on = state.service && state.service.id === s.id, p = money(s.price, s.currency);
        return '<button type="button" role="radio" class="bk-option" aria-checked="' + !!on + '" data-service="' + esc(s.id) + '">' +
          '<span class="bk-opt-main"><b>' + esc(s.name) + '</b><small>' + esc(t.mins(s.duration_minutes)) + '</small>' +
          (on && s.description ? '<span class="bk-desc">' + esc(s.description) + '</span>' : '') + '</span>' +
          '<span class="bk-price">' + esc(p || t.free) + '</span></button>';
      }).join('') + '</div>';
      var people = team();
      if (state.service && people.length > 1) {
        html += '<fieldset class="bk-who"><legend>' + esc(t.whoWith) + '</legend><div class="bk-chips">' +
          '<button type="button" class="bk-chip" data-who="" aria-pressed="' + !state.who + '">' + esc(t.anyone) + '</button>' +
          people.map(function (m) {
            return '<button type="button" class="bk-chip" data-who="' + esc(m.id) + '" aria-pressed="' + (state.who === m.id) + '" title="' + esc(m.title || '') + '">' + esc(m.name) + '</button>';
          }).join('') + '</div></fieldset>';
      }
      return html + '<div class="bk-actions"><span></span><button type="button" class="bk-primary" data-go="2"' + (state.service ? '' : ' disabled') + '>' + esc(t.chooseTime) + '</button></div>';
    }

    function stepTime() {
      var w = week();
      var html = '<div class="bk-week-head"><b>' + esc(fmtDay(w[0], { month: 'long', year: 'numeric' })) + '</b><span>' +
        '<button type="button" class="bk-arrow" data-week="-1" aria-label="' + esc(t.earlier) + '"' + (state.offset === 0 ? ' disabled' : '') + '>‹</button>' +
        '<button type="button" class="bk-arrow" data-week="1" aria-label="' + esc(t.later) + '"' + (state.offset >= 7 ? ' disabled' : '') + '>›</button></span></div>';
      html += '<div class="bk-days" role="radiogroup" aria-label="' + esc(t.steps[1]) + '">' + w.map(function (x, i) {
        var open = openDay(x), v = state.days[dayKey(x)];
        var full = open && Array.isArray(v) && !v.length;
        var on = state.day && keyOf(state.day) === keyOf(x);
        var name = state.offset === 0 && i === 0 ? t.today : fmtDay(x, { weekday: 'short' });
        var note = !open ? t.closed : full ? t.full : Array.isArray(v) ? t.freeN(v.length) : '…';
        return '<button type="button" role="radio" class="bk-day" aria-checked="' + !!on + '" data-day="' + keyOf(x) + '"' + (!open || full ? ' disabled' : '') + '>' +
          '<small>' + esc(name) + '</small><b>' + x.d + '</b><em>' + esc(note) + '</em></button>';
      }).join('') + '</div>';
      if (!state.day) html += '<p class="bk-muted">' + esc(t.pickDay) + '</p>';
      else {
        var v = state.days[dayKey(state.day)];
        if (v === 'error') html += '<p class="bk-error">' + esc(t.down) + '</p>';
        else if (!Array.isArray(v)) html += '<div class="bk-slots">' + '<span class="bk-ghost"></span>'.repeat(8) + '</div>';
        else if (!v.length) html += '<p class="bk-muted">' + esc(t.noTimes) + '</p>';
        else {
          html += '<div class="bk-slots" role="radiogroup" aria-label="' + esc(fmtDay(state.day, { weekday: 'long', day: 'numeric', month: 'long' })) + '">' + v.map(function (s) {
            var on = state.slot && state.slot.starts === s.starts;
            return '<button type="button" role="radio" class="bk-slot" aria-checked="' + !!on + '" data-slot="' + s.starts + '"' +
              (s.staff && !state.who && team().length > 1 ? ' title="' + esc(s.staff.name) + '"' : '') + '>' + esc(fmtTime(s.starts)) + '</button>';
          }).join('') + '</div><p class="bk-note">' + esc(t.zone + ', ' + t.mins(state.service.duration_minutes)) +
            (state.slot && state.slot.staff && team().length > 1 ? ', with ' + esc(state.slot.staff.name) : '') + '</p>';
        }
      }
      if (state.err) html += '<p class="bk-error" role="alert">' + esc(state.err) + '</p>';
      return html + '<div class="bk-actions"><button type="button" class="bk-ghost-btn" data-go="1">' + esc(t.back) + '</button>' +
        '<button type="button" class="bk-primary" data-go="3"' + (state.slot ? '' : ' disabled') + '>' + esc(t.cont) + '</button></div>';
    }

    function stepDetails() {
      var f = state.form;
      return '<form class="bk-form" novalidate data-track-ignore>' +
        '<div class="bk-two">' +
        '<label>' + esc(t.name) + '<input name="name" autocomplete="name" required value="' + esc(f.name) + '"></label>' +
        '<label>' + esc(t.phone) + '<input name="phone" type="tel" autocomplete="tel" required value="' + esc(f.phone) + '"></label></div>' +
        '<label>' + esc(t.email) + '<input name="email" type="email" autocomplete="email" required value="' + esc(f.email) + '"></label>' +
        '<label><span>' + esc(t.notes) + ' <i>(' + esc(t.optional) + ')</i></span><textarea name="notes" rows="3" placeholder="' + esc(t.notesPh) + '">' + esc(f.notes) + '</textarea></label>' +
        '<input class="bk-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" value="' + esc(f.website) + '">' +
        (state.err ? '<p class="bk-error" role="alert">' + esc(state.err) + '</p>' : '') +
        '<div class="bk-actions"><button type="button" class="bk-ghost-btn" data-go="2">' + esc(t.back) + '</button>' +
        '<button type="submit" class="bk-primary">' + esc(t.review) + '</button></div></form>';
    }

    function stepConfirm() {
      var s = state.slot, svc = state.service, p = money(svc.price, svc.currency);
      var online = !!(svc.is_paid && p && (state.base.paymentMethods || []).length);
      var rows = [
        [t.what, svc.name + ', ' + t.mins(svc.duration_minutes)],
        [t.when, fmtWhen(s)],
      ];
      if (s.staff && team().length > 1) rows.push([t.with, s.staff.name]);
      rows.push([t.who, state.form.name], [t.mail, state.form.email]);
      if (p) rows.push(['Price', p + (online ? '' : ', ' + t.payOnDay.toLowerCase())]);
      var html = '<h3 class="bk-h3">' + esc(t.summary) + '</h3><dl class="bk-summary">' + rows.map(function (r) {
        return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
      }).join('') + '</dl>';
      if (state.err) html += '<p class="bk-error" role="alert">' + esc(state.err) + '</p>';
      if (online) {
        var url = String(opts.app || '').replace(/\/+$/, '') + '/apps/appointments/p/' + encodeURIComponent(opts.slug) + '?service=' + encodeURIComponent(svc.name);
        return html + '<p class="bk-muted">' + esc(t.payOnline) + '</p><div class="bk-actions"><button type="button" class="bk-ghost-btn" data-go="3">' + esc(t.back) + '</button>' +
          '<a class="bk-primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(t.payBtn) + '</a></div>';
      }
      return html + '<div class="bk-actions"><button type="button" class="bk-ghost-btn" data-go="3"' + (state.sending ? ' disabled' : '') + '>' + esc(t.back) + '</button>' +
        '<button type="button" class="bk-primary" data-confirm' + (state.sending ? ' disabled' : '') + '>' + esc(state.sending ? t.sending : t.confirm) + '</button></div>';
    }

    function render() {
      var active = document.activeElement && el.contains(document.activeElement) ? document.activeElement : null;
      var focusKey = active && (active.getAttribute('name') || active.getAttribute('data-go') || active.getAttribute('data-service') || active.getAttribute('data-day') || active.getAttribute('data-slot') || active.getAttribute('data-who'));
      var selStart = active && 'selectionStart' in active ? active.selectionStart : null;
      var html;
      if (state.failed) html = '<div class="bk-body"><p class="bk-error">' + esc(t.down) + '</p></div>';
      else if (!state.base) html = '<div class="bk-body" aria-busy="true"><div class="bk-skel"></div><div class="bk-skel"></div><div class="bk-skel short"></div><p class="bk-muted">' + esc(t.loading) + '</p></div>';
      else if (state.done) {
        var d = state.done;
        html = '<div class="bk-body bk-done" role="status"><span class="bk-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '<h3>' + esc(t.doneTitle) + '</h3><p class="bk-when">' + esc(d.service.name) + '<br>' + esc(fmtWhen(d.slot)) + (d.slot.staff && staffFor(state.base, d.service).length > 1 ? ' with ' + esc(firstName(d.slot.staff.name)) : '') + '</p>' +
          '<p class="bk-muted">' + esc(t.doneText(d.email)) + '</p><button type="button" class="bk-ghost-btn" data-again>' + esc(t.another) + '</button></div>';
      } else {
        html = progress() + '<div class="bk-body">' +
          (state.step === 1 ? stepService() : state.step === 2 ? stepTime() : state.step === 3 ? stepDetails() : stepConfirm()) + '</div>';
      }
      el.innerHTML = '<div class="bk">' + html + '</div><p class="bk-powered"><span aria-hidden="true"></span>' + esc(t.powered) + '</p>';
      if (focusKey) {
        var again = el.querySelector('[name="' + focusKey + '"],[data-go="' + focusKey + '"],[data-service="' + focusKey + '"],[data-day="' + focusKey + '"],[data-slot="' + focusKey + '"],[data-who="' + focusKey + '"]');
        if (again && !again.disabled) { again.focus({ preventScroll: true }); if (selStart != null && again.setSelectionRange) try { again.setSelectionRange(selStart, selStart); } catch (e) { /* not text */ } }
      }
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest('button, a');
      if (!b || !el.contains(b) || b.disabled) return;
      if (b.hasAttribute('data-service')) return chooseService(b.getAttribute('data-service'));
      if (b.hasAttribute('data-who')) { set({ who: b.getAttribute('data-who'), slot: null, day: null, offset: 0 }); return; }
      if (b.hasAttribute('data-week')) { state.offset += Number(b.getAttribute('data-week')); set({ day: null, slot: null }); loadWeek(); return; }
      if (b.hasAttribute('data-day')) { var p = b.getAttribute('data-day').split('-').map(Number); set({ day: { y: p[0], m: p[1], d: p[2] }, slot: null }); return; }
      if (b.hasAttribute('data-slot')) {
        var v = state.days[dayKey(state.day)], at = Number(b.getAttribute('data-slot'));
        set({ slot: (v || []).filter(function (s) { return s.starts === at; })[0] || null, err: null }); return;
      }
      if (b.hasAttribute('data-confirm')) return submit();
      if (b.hasAttribute('data-again')) { set({ done: null, slot: null, day: null, step: 1, service: null, who: '' }); return; }
      if (b.hasAttribute('data-go')) {
        var n = Number(b.getAttribute('data-go'));
        if (n === 2) { go(2); loadWeek(); pickFirst(); render(); return; }
        return go(n);
      }
    });
    el.addEventListener('input', function (e) {
      var n = e.target.getAttribute('name');
      if (n && n in state.form) state.form[n] = e.target.value;
    });
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = state.form;
      if (f.name.trim().length < 2) return set({ err: t.needName });
      if (f.phone.replace(/\D/g, '').length < 9) return set({ err: t.needPhone });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return set({ err: t.needEmail });
      go(4);
    });

    render();
    api.day(keyOf(todayIn(tz))).then(function (a) {
      tz = a.calendar.timezone || tz; today = todayIn(tz);
      var svcs = (a.services || []).slice();
      // Free things (consultations, quotes) last unless they're all free; the
      // business's own order otherwise.
      if (opts.order) svcs.sort(function (x, y) { return opts.order(x) - opts.order(y); });
      a.services = svcs;
      state.base = a;
      if (state.pending) { var want = state.pending; state.pending = null; selectByName(want); }
      else if (svcs.length === 1) state.service = svcs[0];
      render();
    }).catch(function () { set({ failed: true }); });

    function selectByName(name) {
      var lower = String(name || '').toLowerCase();
      var s = (state.base.services || []).filter(function (x) { return x.name.toLowerCase() === lower; })[0] ||
        (state.base.services || []).filter(function (x) { return x.name.toLowerCase().indexOf(lower) >= 0; })[0];
      if (s) { state.service = s; state.who = ''; state.day = null; state.slot = null; state.offset = 0; state.step = 2; state.done = null; loadWeek(); pickFirst(); }
    }

    instance = {
      choose: function (name) {
        if (!state.base) state.pending = name; else { selectByName(name); render(); }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    };
    return instance;
  }

  /** The first free time for any service from today, for "Next free" in a hero. */
  function nextFree(opts) {
    var api = client(opts);
    return api.day(keyOf(todayIn('Europe/London'))).then(function (base) {
      var tz = base.calendar.timezone || 'Europe/London';
      var svc = (base.services || []).filter(function (s) { return opts.service ? s.name.toLowerCase().indexOf(opts.service.toLowerCase()) >= 0 : true; })[0];
      if (!svc) return null;
      var start = todayIn(tz);
      function scan(i) {
        if (i > 13) return Promise.resolve(null);
        var batch = []; for (var j = i; j < i + 7; j++) batch.push(addDays(start, j));
        return Promise.all(batch.map(function (x) { return dayOptions(api, base, svc, '', x).catch(function () { return []; }); })).then(function (lists) {
          for (var k = 0; k < lists.length; k++) if (lists[k].length) return { slot: lists[k][0], day: batch[k], offset: i + k, service: svc, tz: tz };
          return scan(i + 7);
        });
      }
      return scan(0);
    });
  }

  function describe(found) {
    if (!found) return null;
    var tz = found.tz, ms = found.slot.starts;
    var time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(ms).replace(' ', '').replace(':00', '');
    var day = found.offset === 0 ? 'Today' : found.offset === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(ms);
    return { day: day, time: time, staff: found.slot.staff ? found.slot.staff.name : null, service: found.service.name };
  }

  window.AutisyncBooking = {
    mount: mount,
    choose: function (name) { if (instance) instance.choose(name); },
    nextFree: function (opts) { return nextFree(opts).then(describe); },
  };
})();
