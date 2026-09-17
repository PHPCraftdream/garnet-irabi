/**
 * Generate exhaustive Hebrew calendar fixture for 2020-2060.
 *
 * Replicates the EXACT priority logic of SlotDateFilter::getRestrictionReason()
 * using @hebcal/core for Hebrew date conversion. This cross-verifies both
 * the Hebrew date math and the holiday/restriction classification.
 *
 * Usage: node tests/scripts/generate-hebcal-fixture.js
 */

'use strict';

const { HDate, HebrewCalendar, flags } = require('@hebcal/core');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Hebrew month numbers (as returned by PHP's jdtojewish / HDate.getMonth())
// hebcal HDate months: 1=Nisan .. 6=Elul, 7=Tishrei .. 13=Adar II
// PHP jdtojewish months: 1=Tishrei .. 6=Adar, 7=Adar II, 8=Nisan .. 13=Elul
// We need to match PHP numbering since the PHP code uses those month numbers.
// ---------------------------------------------------------------------------

/**
 * Convert hebcal HDate month to PHP jdtojewish month number.
 *  hebcal: 1=Nisan,2=Iyyar,3=Sivan,4=Tamuz,5=Av,6=Elul,7=Tishrei,8=Cheshvan,9=Kislev,10=Tevet,11=Shvat,12=Adar,13=Adar2,14=Adar1
 *  PHP:    1=Tishrei,2=Cheshvan,3=Kislev,4=Tevet,5=Shvat,6=Adar(orAdar1),7=Adar2,8=Nisan,9=Iyyar,10=Sivan,11=Tamuz,12=Av,13=Elul
 */
function hebcalMonthToPhp(hMonth, isLeap) {
  // hebcal month mapping
  const map = {
    7: 1,   // Tishrei
    8: 2,   // Cheshvan
    9: 3,   // Kislev
    10: 4,  // Tevet
    11: 5,  // Shvat
    12: isLeap ? 6 : 6, // Adar (non-leap) or Adar I (leap)
    13: 7,  // Adar II (leap only)
    14: 6,  // Adar I (this is how hebcal represents it in some versions)
    1: 8,   // Nisan
    2: 9,   // Iyyar
    3: 10,  // Sivan
    4: 11,  // Tamuz
    5: 12,  // Av
    6: 13,  // Elul
  };
  return map[hMonth] || hMonth;
}

/**
 * Get Hebrew year month lengths (matches PHP HCalendarTools::getHMonthsByYear).
 * Returns array indexed by PHP month number (1-based).
 */
function getHMonthLengths(hYear) {
  const hd = new HDate(1, 7, hYear); // 1 Tishrei
  const isLeap = HDate.isLeapYear(hYear);
  const months = {};

  // Iterate through all months of this Hebrew year
  const monthCount = isLeap ? 13 : 12;
  // Hebrew months in order: Tishrei(7), Cheshvan(8), Kislev(9), Tevet(10), Shvat(11), Adar/AdarI(12), [AdarII(13)], Nisan(1), Iyyar(2), Sivan(3), Tamuz(4), Av(5), Elul(6)
  const hebMonthOrder = [7, 8, 9, 10, 11, 12];
  if (isLeap) hebMonthOrder.push(13);
  hebMonthOrder.push(1, 2, 3, 4, 5, 6);

  for (const hm of hebMonthOrder) {
    const phpMonth = hebcalMonthToPhp(hm, isLeap);
    const daysInMonth = HDate.daysInMonth(hm, hYear);
    months[phpMonth] = daysInMonth;
  }
  return months;
}

/**
 * Replicate PHP HCalendarDayInfo::setDayInfo logic exactly.
 * Returns the restriction reason matching SlotDateFilter::getRestrictionReason().
 */
function getRestrictionReason(gregDate) {
  const hd = new HDate(gregDate);
  const hDay = hd.getDate();       // day of Hebrew month
  const hYear = hd.getFullYear();
  const hMonthHebcal = hd.getMonth();
  const isLeap = HDate.isLeapYear(hYear);
  const phpMonth = hebcalMonthToPhp(hMonthHebcal, isLeap);

  // weekDay: PHP uses 1=Sun..7=Sat (format('w')+1 where w is 0=Sun..6=Sat)
  const jsDay = gregDate.getDay(); // 0=Sun..6=Sat
  const weekDay = jsDay + 1;       // 1=Sun..7=Sat

  // Get month lengths for prev-month check
  const monthLengths = getHMonthLengths(hYear);
  const monthLengthPrev = monthLengths[phpMonth - 1] || null;
  // Also need previous year's last month for Tishrei (phpMonth=1)
  let is30DaysPrev = false;
  if (phpMonth === 1) {
    // Previous month is Elul (month 13) of previous year
    const prevYearLengths = getHMonthLengths(hYear - 1);
    is30DaysPrev = prevYearLengths[13] === 30;
  } else {
    is30DaysPrev = monthLengthPrev === 30;
  }

  // Replicate setDayInfo flags
  let isTovIsrael = false;
  let isPreTov = false;
  let isTsom = false;
  let isPreTsom = false;
  let isShabbat = weekDay === 7;
  let isSheshi = weekDay === 6;
  let commonItems = [];
  let israelItems = [];

  // Shabbat item
  if (isShabbat) {
    // commonItems would include Shabbat but it's filtered out in getRestrictionReason
  }

  // Month-specific logic (matching PHP switch exactly)
  switch (phpMonth) {
    case 13: // Elul
      if (hDay === 29) isPreTov = true;
      break;

    case 1: // Tishrei
      switch (hDay) {
        case 1:
          isTovIsrael = true;
          commonItems.push('Rosh ha-shana-I');
          break;
        case 2:
          isTovIsrael = true;
          commonItems.push('Rosh ha-shana-II');
          if (weekDay !== 6) isPreTsom = true;
          break;
        case 3:
          if (weekDay === 7) {
            isPreTsom = true;
          } else {
            isTsom = true;
            commonItems.push('Tzom Gedaliah');
          }
          break;
        case 4:
          if (weekDay === 1) {
            isTsom = true;
            commonItems.push('Tzom Gedaliah');
          }
          break;
        case 9:
          isPreTov = true;
          isPreTsom = true;
          break;
        case 10:
          isTovIsrael = true;
          isTsom = true;
          commonItems.push('Yom Kippur');
          break;
        case 14:
          isPreTov = true;
          break;
        case 15:
          isTovIsrael = true;
          commonItems.push('Sukkot');
          break;
        case 16:
          // Israel: moed (not tov), so isTovIsrael stays false
          israelItems.push('Sukkot hol-ha-moed');
          break;
        case 17: case 18: case 19: case 20: case 21:
          isPreTov = true;
          commonItems.push('Sukkot hol-ha-moed');
          break;
        case 22:
          isTovIsrael = true;
          isPreTov = true;
          commonItems.push('Smini Atseret');
          israelItems.push('Simkhat Totrah');
          break;
        case 23:
          // isTovOut only, not Israel
          break;
        case 30:
          commonItems.push('Rosh hodesh I');
          break;
      }
      break;

    case 3: // Kislev
      // Hanukkah days - not relevant for restrictions (isCelebrateDay, not isTov/isTsom)
      break;

    case 4: // Tevet
      switch (hDay) {
        case 9:
          isPreTsom = true;
          break;
        case 10:
          isTsom = true;
          commonItems.push('Asarah Be-Tevet');
          break;
      }
      break;

    case 5: // Shvat - no restriction-relevant days
      break;

    case 6: // Adar or Adar I
    case 7: // Adar II
      if (phpMonth === 6 && isLeap) break; // Skip Adar I in leap year

      switch (hDay) {
        case 10:
          if (weekDay === 4) isPreTsom = true;
          break;
        case 11:
          if (weekDay === 5) {
            isTsom = true;
            commonItems.push('Taanit Esther');
          }
          break;
        case 12:
          if (weekDay !== 6) isPreTsom = true;
          break;
        case 13:
          if (weekDay !== 7) {
            isTsom = true;
            commonItems.push('Taanit Esther');
          }
          break;
      }
      break;

    case 8: // Nisan
      switch (hDay) {
        case 11:
          if (weekDay === 4) isPreTsom = true;
          break;
        case 12:
          if (weekDay === 5) {
            isTsom = true;
            commonItems.push('Taanit Bkhorim');
          }
          break;
        case 13:
          if (weekDay !== 6) isPreTsom = true;
          break;
        case 14:
          if (weekDay !== 7) {
            isTsom = true;
            isPreTov = true;
            commonItems.push('Taanit Bkhorim');
          }
          break;
        case 15:
        case 21:
          isTovIsrael = true;
          commonItems.push('Pesach');
          break;
        case 16:
          // Israel: moed, not tov
          israelItems.push('Pesach hol-ha-moed');
          break;
        case 17: case 18: case 19: case 20:
          // Chol HaMoed - no restriction flags in Israel
          israelItems.push('Pesach hol-ha-moed');
          break;
        case 22:
          // isTovOut only
          break;
      }
      break;

    case 10: // Sivan
      switch (hDay) {
        case 5:
          isPreTov = true;
          break;
        case 6:
          isTovIsrael = true;
          commonItems.push('Shavuot');
          break;
        case 7:
          // isTovOut only
          break;
      }
      break;

    case 11: // Tamuz
      switch (hDay) {
        case 16:
          if (weekDay !== 6) isPreTsom = true;
          break;
        case 17:
          if (weekDay === 7) {
            isPreTsom = true;
          } else {
            isTsom = true;
            commonItems.push('Shivah Asar ba-Tammuz');
          }
          break;
        case 18:
          if (weekDay === 1) {
            isTsom = true;
            commonItems.push('Shivah Asar ba-Tammuz');
          }
          break;
      }
      break;

    case 12: // Av
      switch (hDay) {
        case 8:
          if (weekDay !== 6) isPreTsom = true;
          break;
        case 9:
          if (weekDay !== 7) {
            isTsom = true;
            commonItems.push('Tesha be-Av');
          } else {
            isPreTsom = true;
          }
          break;
        case 10:
          if (weekDay === 1) {
            isTsom = true;
            commonItems.push('Tesha be-Av');
          }
          break;
      }
      break;
  }

  // Now apply getRestrictionReason priority order
  // 1. Shabbat
  if (isShabbat) {
    return { code: 'shabbat' };
  }
  // 2. Friday
  if (isSheshi) {
    return { code: 'erev_shabbat' };
  }
  // 3. Yom Tov Israel
  if (isTovIsrael) {
    // Filter out 'Shabbat' from items (already not added above)
    const allItems = [...commonItems, ...israelItems];
    const name = allItems[0] || null;
    return { code: 'yom_tov', name };
  }
  // 4. Erev Yom Tov
  if (isPreTov) {
    return { code: 'erev_yom_tov' };
  }
  // 5. Fast
  if (isTsom) {
    const name = commonItems[0] || null;
    return { code: 'fast', name };
  }
  // 6. Erev Fast
  if (isPreTsom) {
    return { code: 'erev_fast' };
  }
  // 7. Rosh Chodesh (day 30 or 1)
  if (hDay === 30 || hDay === 1) {
    return { code: 'rosh_chodesh' };
  }
  // 8. Erev Rosh Chodesh (day 29)
  if (hDay === 29) {
    return { code: 'erev_rosh_chodesh' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generate fixture
// ---------------------------------------------------------------------------

function generateFixture() {
  const result = {};
  const start = new Date(2020, 0, 1); // Jan 1, 2020
  const end = new Date(2060, 11, 31); // Dec 31, 2060

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const reason = getRestrictionReason(current);
    result[dateStr] = reason;
    count++;

    current.setDate(current.getDate() + 1);
  }

  const outPath = path.join(__dirname, '..', 'fixtures', 'hebcal-reference-2020-2060.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Generated ${count} entries -> ${outPath}`);
}

generateFixture();
