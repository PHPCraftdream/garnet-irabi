/**
 * Re-export shim for `@hebcal/core`.
 *
 * The dependency lives in `tests/node_modules/`. Specs under
 * `Apps/<App>/Tests/` can't reach it via Node module resolution (the
 * walk-up never enters `tests/`), so import from this shim instead:
 *
 *   import { HDate, HebrewCalendar, flags } from '@test/hebcal';   // alias
 *   import { HDate, HebrewCalendar, flags }
 *       from '../../../../tests/helpers/hebcal';                  // relative
 */
export { HDate, HebrewCalendar, flags } from '@hebcal/core';
