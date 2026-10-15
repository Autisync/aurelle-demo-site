# Aurelle Skin Clinic demo website

A website for Aurelle Skin Clinic, a skin clinic in Chester: a made-up business used to show
prospects what their own website does with Autisync CRM behind it. Everything
on it books and enquires into the CRM account **Aurelle Skin Clinic (Demo)**.

- **The hero reads the diary live**: "Next free" comes from the CRM. Book that
  slot in the CRM and the site moves on to the next one.
- **Booking happens on the page**: service, person (or first available, which
  checks everyone's diary), day, time. It lands in the CRM as a confirmed
  appointment, with the client created and the confirmation email sent.
- **The enquiry form** arrives in the CRM as a new lead.
- **Visitors**: every visit, how far people scroll, what they click and each
  booking shows in the CRM under Visitors.

No framework and no install. `build.mjs` copies `src/` to `dist/` and writes
`dist/config.js`.

## Vercel

Import this repository, framework preset **Other**. Nothing else is needed:
the build settings are in `vercel.json` and the defaults point at the live CRM.
Optional environment variables: `TRACK_KEY`, `CRM_API_URL`, `CRM_APP_URL`,
`BOOKING_SLUG`, `SITE_SLUG` (see `build.mjs`).

The CRM needs the version that lets websites call the public booking and form
endpoints (commit 99fe20f in crm-autisync-original).

## Before a demo

On the server: `docker compose exec crm-backend npm run demo:business -- clinic --refresh`
so the diary holds this week's appointments. Cancel test bookings in the CRM
afterwards. Every name, review and number here is invented; phone numbers are in
Ofcom's drama range and emails use `.example`.

## Locally

```
CRM_API_URL=http://localhost:3001/api node build.mjs && npx serve dist
```
