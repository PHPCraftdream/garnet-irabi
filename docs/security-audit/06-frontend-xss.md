# Security Audit 06 — Frontend XSS & Client-Side Injection

**Application:** IRabi (Garnet Framework open-source example app)
**Scope:** Stored/reflected XSS and related client-side risks caused by rendering
server-persisted user input back into HTML/JS.
**Audit type:** Defensive, authorized (repository owner).
**Date:** 2026-07-10

---

## Summary

The frontend was audited across four vectors:

1. **Twig `|raw` / `{% autoescape false %}`** — Twig templates that disable HTML
   auto-escaping.
2. **JS/React DOM-injection sinks** — `dangerouslySetInnerHTML`, `innerHTML =`,
   `outerHTML =`, `document.write`, `eval(`, `new Function(`,
   `insertAdjacentHTML`, jQuery `.html()`.
3. **`postMessage` handlers** — `window.addEventListener('message', ...)` without
   `event.origin` validation.
4. **Token storage in JS-accessible storage** — `localStorage` / `sessionStorage`
   holding auth/session tokens (impact multiplier for any XSS).

**Result: No XSS vulnerabilities found.**

Key facts established:

- **Twig templates (2 files):** `Foreground/TwigTemplates/Foreground/External.twig`
  and `NoAccessHeading.twig`. **Zero** occurrences of `|raw` or
  `{% autoescape false %}`. Every variable is emitted through Twig's default
  auto-escaping `{{ ... }}`. No stored user content is rendered raw.
- **React Islands (96 files):** Exactly **one** `dangerouslySetInnerHTML` sink
  exists (`RegistrationForm.tsx:152`). Its data source is a **compile-time i18n
  translation string** (developer-authored, baked into the JS bundle), **not**
  user input. Verified below — not a vulnerability. No `innerHTML`/`outerHTML`/
  `document.write`/`eval`/`new Function`/`insertAdjacentHTML` sinks exist.
- **`postMessage`:** No `addEventListener('message', ...)` handlers exist in the
  `Front/` tree. No unvalidated cross-origin message handling.
- **Token storage:** No `localStorage` / `sessionStorage` usage anywhere in
  `Front/`. Auth/session state is not exposed to JavaScript-accessible storage,
  which keeps the impact ceiling of any future XSS lower. (Context note only,
  per scope — no standalone finding.)

---

## Findings

### No vulnerabilities found.

No stored or reflected XSS, and no related client-side injection risk, was
identified within the audited scope. The items below document the sinks that were
individually reviewed and cleared, with justification.

---

## Reviewed & cleared (not vulnerabilities)

### R-1. `dangerouslySetInnerHTML` with translated consent string

- **File / Line:** `Front/Islands/Users/RegistrationForm.tsx:152`
- **Severity:** None (verified safe)
- **Code:**
  ```tsx
  const renderConsentPd = (): string => renderMarkdownLinks(I18n.Consent_PD());
  // ...
  <span dangerouslySetInnerHTML={{__html: renderConsentPd()}} />
  ```
- **Data-flow analysis:**
  - The `__html` value is `renderMarkdownLinks(I18n.Consent_PD())`.
  - `I18n.Consent_PD()` comes from `@framework/I18nGen/I18nFramework`, a
    **compile-time-generated** translation accessor. Its value is a static,
    developer-authored translation string embedded in the built JS bundle
    (`Public/assets/framework/gen/js/framework.*.gen.js`). It is **not** read
    from the database, request, or any user-editable source.
  - `renderMarkdownLinks` (framework helper,
    `garnet-framework/Bundle/Front/Common/Utils/staticPageUrl.ts:15`) only
    converts markdown link syntax `[label](href)` into
    `<a href="..." target="_blank" rel="noopener noreferrer">label</a>`,
    resolving `page:slug` hrefs through a fixed route builder.
- **Why it is not XSS:** The sink renders only trusted, build-time translation
  content, not user-supplied input. An attacker has no path to influence
  `I18n.Consent_PD()` at runtime. Classic stored/reflected XSS requires an
  attacker-controlled source flowing into the sink; that source does not exist
  here.
- **Residual hardening note (informational, not a vulnerability):**
  `renderMarkdownLinks` interpolates the `href` directly into an attribute
  without URL-scheme validation, and `label` without escaping. This is only
  reachable via translation strings today, so there is no live risk. If the
  project ever routes **user-controlled** text through `renderMarkdownLinks`,
  this helper would become an XSS sink (e.g. `javascript:` hrefs, or `label`
  containing `</a><img onerror=...>`). Recommendation for defense-in-depth:
  reject non-`http(s)`/`page:` schemes and HTML-escape `label`. No action
  required for the current codebase.

### R-2. Twig `External.twig` — outbound-link interstitial

- **File:** `Foreground/TwigTemplates/Foreground/External.twig`
- **Severity:** None (verified safe)
- **Analysis:** All variables (`title`, `description`, `host_text`, `target_url`,
  labels) are emitted with default Twig auto-escaping. `target_url` is placed in
  an `href` attribute but is (a) auto-escaped by Twig and (b) validated
  server-side before rendering (per the template's own header comment and the
  `target_url is null` guard). No `|raw`, no `autoescape false`. Not a
  vulnerability.

### R-3. Twig `NoAccessHeading.twig`

- **File:** `Foreground/TwigTemplates/Foreground/NoAccessHeading.twig`
- **Severity:** None (verified safe)
- **Analysis:** Single line `<h1>{{ heading }}</h1>`, auto-escaped. `heading` is
  a server-controlled label, not user input. Not a vulnerability.

---

## Context notes (per scope item 4)

- **No JS-accessible token storage.** A repo-wide search of `Front/` for
  `localStorage` and `sessionStorage` returned **zero** results. Session/auth
  tokens are therefore not exposed to JavaScript, and the CSRF token observed in
  `Front/Islands/SlotsCalendar/BookingModal.tsx` is passed in via server-rendered
  island props rather than read from web storage. This lowers the blast radius of
  any hypothetical future XSS. This is a positive posture note, not a finding.
- The `AdminTokensSection.tsx` "tokens" are server-managed
  invitation/registration tokens surfaced in an admin table; they are not
  browser session tokens and do not represent JS-accessible auth-token storage.

---

## Methodology / commands

- Twig `|raw`: `grep -n '\|raw'` over `Foreground/TwigTemplates/**/*.twig` — 0 hits.
- Twig `autoescape false`: 0 hits.
- React sinks: `grep -n 'dangerouslySetInnerHTML|innerHTML =|outerHTML =|document.write|eval(|new Function(|insertAdjacentHTML|.html('`
  over `Front/` — 1 hit (R-1), reviewed and cleared.
- `postMessage`: `grep "addEventListener('message'"` over `Front/` — 0 hits.
- Token storage: `grep 'localStorage|sessionStorage'` over `Front/` — 0 hits.
- Data-flow of the single sink traced to a compile-time i18n string via
  `renderMarkdownLinks` (framework `Common/Utils/staticPageUrl.ts`).

## Conclusion

Within the audited scope, IRabi has **no stored or reflected XSS** and no
unvalidated `postMessage` handling. The single HTML-injection sink renders only
trusted build-time translation content. The absence of JS-accessible token
storage further constrains client-side risk. One informational defense-in-depth
note is recorded on `renderMarkdownLinks` (R-1) in case user-controlled text is
ever routed through it in the future.
