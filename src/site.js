/*!
 * What both demo sites share: the visitor tracker, the booking section, the
 * "next free" line in the hero, and the enquiry form. Everything reads
 * window.SITE_CONFIG, which build.mjs writes from the Vercel environment.
 */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var API = String(C.api || 'https://api.autisync.com/api').replace(/\/+$/, '');
  var APP = String(C.app || 'https://app.autisync.com').replace(/\/+$/, '');

  // Visitors, in the CRM (Visitors > Tracking gives the key). No cookies.
  if (C.trackKey) {
    var s = document.createElement('script');
    s.src = APP + '/t.js';
    s.defer = true;
    s.setAttribute('data-site', C.trackKey);
    s.setAttribute('data-api', API);
    document.head.appendChild(s);
  }
  function track(type, label) { try { window.autisyncTrack && window.autisyncTrack(type, label); } catch (e) { /* never in the way */ } }

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function () {
    // ── Booking ──
    var host = document.querySelector('[data-booking]');
    if (host && window.AutisyncBooking) {
      window.AutisyncBooking.mount(host, { api: API, app: APP, slug: C.bookingSlug, copy: window.BOOKING_COPY || {}, order: window.BOOKING_ORDER });
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]');
      if (!b) return;
      var name = b.getAttribute('data-book');
      if (!host) return;
      e.preventDefault();
      if (name) window.AutisyncBooking.choose(name);
      else host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Next free time ──
    Array.prototype.forEach.call(document.querySelectorAll('[data-next-free]'), function (el) {
      window.AutisyncBooking.nextFree({ api: API, slug: C.bookingSlug, service: el.getAttribute('data-next-free') || '' })
        .then(function (n) {
          if (!n) { el.hidden = true; return; }
          var put = function (sel, v) { var x = el.querySelector(sel); if (x) x.textContent = v || ''; };
          put('[data-nf-day]', n.day);
          put('[data-nf-time]', n.time);
          put('[data-nf-staff]', n.staff ? n.staff.split(' ')[0] : '');
          put('[data-nf-service]', n.service);
          if (!n.staff) Array.prototype.forEach.call(el.querySelectorAll('[data-nf-if-staff]'), function (x) { x.hidden = true; });
          el.setAttribute('data-state', 'ready');
        })
        .catch(function () { el.hidden = true; });
    });

    // ── Enquiry form: goes to the website's form in the CRM ──
    var formSection = null;
    function findForm() {
      if (formSection) return Promise.resolve(formSection);
      return fetch(API + '/sites/public/render?siteSlug=' + encodeURIComponent(C.siteSlug), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('site'); return r.json(); })
        .then(function (d) {
          var all = [];
          (d.pages || [d.page]).forEach(function (p) { (p && p.sections || []).forEach(function (s) { all.push(s); }); });
          var hit = all.filter(function (s) { return s.section_type === 'contact_form'; })[0];
          if (!hit) throw new Error('form');
          formSection = hit.id;
          return formSection;
        });
    }
    Array.prototype.forEach.call(document.querySelectorAll('form[data-enquiry]'), function (form) {
      var status = form.querySelector('[data-status]');
      var button = form.querySelector('button[type="submit"]');
      var say = function (msg, kind) { if (status) { status.textContent = msg; status.setAttribute('data-kind', kind || ''); } };
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (form.website && form.website.value) return; // a bot filled the hidden field
        var data = {};
        Array.prototype.forEach.call(form.elements, function (f) {
          if (!f.name || f.name === 'website' || f.type === 'submit') return;
          if ((f.type === 'radio' || f.type === 'checkbox') && !f.checked) return;
          data[f.name] = f.value.trim();
        });
        if (!data.fullName || data.fullName.length < 2) return say('Please add your name.', 'error');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email || '')) return say('That email address doesn\'t look right.', 'error');
        var q = new URLSearchParams(location.search);
        button.disabled = true;
        say('Sending…');
        findForm().then(function (id) {
          return fetch(API + '/sites/public/forms/' + id + '/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data, utm: { source: q.get('utm_source') || '', medium: q.get('utm_medium') || '', campaign: q.get('utm_campaign') || '' }, tracking: { page: location.href } }),
          });
        }).then(function (r) {
          if (!r.ok) throw new Error('send');
          form.reset();
          form.setAttribute('data-sent', '');
          say(form.getAttribute('data-thanks') || 'Thank you. We\'ll be in touch today.', 'ok');
          track('convert', form.getAttribute('data-enquiry') || 'Enquiry sent');
        }).catch(function () {
          say('That didn\'t send. Please try again, or call us.', 'error');
        }).then(function () { button.disabled = false; });
      });
    });

    // ── Open now / opens at (UK time) ──
    var hours = window.OPENING_HOURS;
    var openEl = document.querySelector('[data-open-now]');
    if (hours && openEl) {
      var parts = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
      var now = (parts.hour === '24' ? '00' : parts.hour) + ':' + parts.minute;
      var nice = function (hm) { var h = +hm.slice(0, 2), m = hm.slice(3); return (h % 12 || 12) + (m === '00' ? '' : ':' + m) + (h < 12 ? 'am' : 'pm'); };
      var dayName = function (d) { return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]; };
      var today = hours[dow];
      var text;
      if (today && now >= today[0] && now < today[1]) {
        text = 'Open now, until ' + nice(today[1]);
        openEl.setAttribute('data-open', '');
      } else {
        for (var i = 0; i < 8; i++) {
          var d = (dow + i) % 7, h = hours[d];
          if (!h || (i === 0 && now >= h[0])) continue;
          text = 'Closed now. Opens ' + (i === 0 ? 'today' : i === 1 ? 'tomorrow' : dayName(d)) + ' at ' + nice(h[0]);
          break;
        }
      }
      var t = openEl.querySelector('[data-open-text]');
      if (t && text) t.textContent = text;
    }

    // Year in the footer.
    Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) { el.textContent = new Date().getFullYear(); });
  });
})();
