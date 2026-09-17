/**
 * Generate exhaustive Hebrew calendar fixture for 2020-2060.
 *
 * Uses @hebcal/core's own holiday flag system (CHAG, MAJOR_FAST) to determine
 * restriction codes — this is the REFERENCE against which the PHP implementation
 * (SlotDateFilter::getRestrictionReason) is cross-verified.
 *
 * Priority order matches SlotDateFilter::getRestrictionReason() exactly:
 *  1. Saturday         → { code: 'shabbat' }
 *  2. Friday           → { code: 'erev_shabbat' }
 *  3. Yom Tov Israel   → { code: 'yom_tov', name }
 *  4. Erev Yom Tov     → { code: 'erev_yom_tov' }
 *  5. Fast (MAJOR_FAST | MINOR_FAST) → { code: 'fast', name }
 *  6. Erev fast        → { code: 'erev_fast' }
 *  7. Hebrew day 30/1  → { code: 'rosh_chodesh' }
 *  8. Hebrew day 29    → { code: 'erev_rosh_chodesh' }
 *  9. Otherwise        → null
 *
 * Usage: cd tests && npx ts-node scripts/generate-hebcal-fixture.ts
 * Or via npm: npm run generate:fixture
 */

'use strict';

const { HDate, HebrewCalendar, flags } = require('@hebcal/core');
const fs = require('fs');
const path = require('path');

type RestrictionEntry = { code: string; name?: string | null } | null;

/**
 * Determine if a date has a Yom Tov (Israel calendar) event.
 * Yom Tov = event with CHAG flag that is NOT Chol ha-Moed.
 */
function getYomTovEvent(hd: typeof HDate.prototype): { desc: string } | null {
  const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [];
  for (const ev of events) {
    const f = ev.getFlags();
    if ((f & flags.CHAG) && !(f & flags.CHOL_HAMOED)) {
      return { desc: ev.getDesc() };
    }
  }
  return null;
}

/**
 * Determine if a date has any fast (major or minor) event.
 * The PHP implementation treats all fasts the same (isTsom).
 * hebcal uses MAJOR_FAST for Yom Kippur and MINOR_FAST for the others
 * (Tzom Gedaliah, Asarah BeTevet, Taanit Esther, 17 Tammuz, 9 Av).
 *
 * Yom Kippur Katan events (YOM_KIPPUR_KATAN | MINOR_FAST) are excluded
 * because the PHP implementation does not handle them.
 */
function getMajorFastEvent(hd: typeof HDate.prototype): { desc: string } | null {
  const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [];
  for (const ev of events) {
    const f = ev.getFlags();
    const isFast = (f & flags.MAJOR_FAST) || (f & flags.MINOR_FAST);
    const isYomKippurKatan = !!(f & flags.YOM_KIPPUR_KATAN);
    if (isFast && !isYomKippurKatan) {
      return { desc: ev.getDesc() };
    }
  }
  return null;
}

/**
 * Check if the next day (tomorrow) has a Yom Tov (for erev_yom_tov detection).
 */
function isPreTov(hd: typeof HDate.prototype): boolean {
  const tomorrow = hd.next();
  return getYomTovEvent(tomorrow) !== null;
}

/**
 * Check if the next day has a major fast (for erev_fast detection).
 */
function isPreTsom(hd: typeof HDate.prototype): boolean {
  const tomorrow = hd.next();
  return getMajorFastEvent(tomorrow) !== null;
}

/**
 * Get restriction reason for a given Gregorian date.
 * Mirrors SlotDateFilter::getRestrictionReason() priority order.
 */
function getRestrictionReason(gregDate: Date): RestrictionEntry {
  const hd = new HDate(gregDate);
  const hDay = hd.getDate();
  const weekday = gregDate.getDay(); // 0=Sun, 6=Sat

  // 1. Saturday (Shabbat)
  if (weekday === 6) {
    return { code: 'shabbat' };
  }

  // 2. Friday (Erev Shabbat)
  if (weekday === 5) {
    return { code: 'erev_shabbat' };
  }

  // 3. Yom Tov Israel
  const yomTovEv = getYomTovEvent(hd);
  if (yomTovEv !== null) {
    return { code: 'yom_tov', name: yomTovEv.desc };
  }

  // 4. Erev Yom Tov
  if (isPreTov(hd)) {
    return { code: 'erev_yom_tov' };
  }

  // 5. Major fast
  const fastEv = getMajorFastEvent(hd);
  if (fastEv !== null) {
    return { code: 'fast', name: fastEv.desc };
  }

  // 6. Erev fast
  if (isPreTsom(hd)) {
    return { code: 'erev_fast' };
  }

  // 7. Rosh Chodesh (Hebrew day 1 or 30)
  if (hDay === 1 || hDay === 30) {
    return { code: 'rosh_chodesh' };
  }

  // 8. Erev Rosh Chodesh (Hebrew day 29)
  if (hDay === 29) {
    return { code: 'erev_rosh_chodesh' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generate fixture
// ---------------------------------------------------------------------------

function generateFixture(): void {
  const result: Record<string, RestrictionEntry> = {};
  const start = new Date(2020, 0, 1);  // 2020-01-01
  const end   = new Date(2060, 11, 31); // 2060-12-31

  const current = new Date(start);
  let count = 0;

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    result[dateStr] = getRestrictionReason(current);
    count++;

    current.setDate(current.getDate() + 1);
  }

  const outPath = path.join(__dirname, '..', 'fixtures', 'hebcal-reference-2020-2060.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Generated ${count} entries -> ${outPath}`);

  // Summary stats
  const codes: Record<string, number> = {};
  for (const entry of Object.values(result)) {
    const code = (entry as any)?.code ?? 'null';
    codes[code] = (codes[code] ?? 0) + 1;
  }
  console.log('Distribution:', codes);
}

generateFixture();
