// Copies src/ to dist/ and writes dist/config.js from the environment, so the
// site needs no framework and no install step on Vercel.
//
//   TRACK_KEY     the website's key from the CRM (Visitors > Tracking), starts
//                 as_. It is public (it sits in the page), so the default
//                 below is the real one; the environment can override it.
//   CRM_API_URL   defaults to https://api.autisync.com/api
//   CRM_APP_URL   defaults to https://app.autisync.com (t.js, full booking page)
//   BOOKING_SLUG  the CRM calendar, default aurelle-demo
//   SITE_SLUG     the CRM website whose enquiry form is used, default aurelle-demo
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const DEFAULT_TRACK_KEY = 'as_4acdc8a6fea816ec023d095b';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('src', 'dist', { recursive: true });

const config = {
  site: 'aurelle',
  api: (process.env.CRM_API_URL || 'https://api.autisync.com/api').replace(/\/+$/, ''),
  app: (process.env.CRM_APP_URL || 'https://app.autisync.com').replace(/\/+$/, ''),
  bookingSlug: process.env.BOOKING_SLUG || 'aurelle-demo',
  siteSlug: process.env.SITE_SLUG || process.env.BOOKING_SLUG || 'aurelle-demo',
  trackKey: process.env.TRACK_KEY ?? DEFAULT_TRACK_KEY,
};
writeFileSync('dist/config.js', `window.SITE_CONFIG = ${JSON.stringify(config)};\n`);
console.log(`Built aurelle against ${config.api} (calendar ${config.bookingSlug})${config.trackKey ? ', visitors tracked' : ', no TRACK_KEY: visits are not counted'}`);
