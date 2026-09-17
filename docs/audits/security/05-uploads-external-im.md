# Security Audit 05 — File Uploads, External URLs & Instant Messaging

**Scope:** All HTTP-reachable file-upload handling, user-controlled URL/path handling,
server-side URL fetching (SSRF), and the Instant-Messaging (IM) subsystem of the IRabi
example app (Garnet Framework).

**Type:** Authorized defensive security review (owner-sanctioned). Goal: identify real,
HTTP-reachable vulnerabilities. No exploitation performed against live systems.

**Date:** 2026-07-10

---

## Summary

The upload, IM, and external-link surfaces of IRabi are, on the whole, **well-designed and
defended**. The thin IRabi controllers (`SupportController`, `ImController`,
`CommentsController`, `UserProfileController`, `MainController`) delegate the security-sensitive
work to reusable Garnet-Framework primitives that were audited as the true HTTP-reachable code
paths:

- `Kernel/Io/FileUpload/FileUploadManager.php` — attachment storage (support / IM)
- `Kernel/Io/FileUpload/UploadRules.php` — extension + MIME whitelists
- `Kernel/Io/FileUpload/SecureFileServing.php` — protected file delivery
- `Kernel/Io/Forms/ImageUpload.php` + `Updater.php` — avatar processing (GD re-encode)
- `Bundle/Utils/Upload/PublicImageUploadTrait.php` — admin OG/CMS image upload
- `Bundle/Modules/Messaging/Controllers/FwImController.php` — IM logic
- `Bundle/Modules/Support/Controllers/FwSupportController.php` — support logic

Key protective controls verified as effective:

- **RCE via `.php`/`.phtml`/`.htaccess` upload — NOT possible.** Extension + real-MIME
  (finfo) double whitelist on attachments; stored filenames are server-generated random hex
  (`bin2hex(random_bytes(16))`), so the client-supplied extension of a rejected type never
  reaches disk. Avatars are fully **re-encoded through GD** and written with a server-chosen
  safe image extension — polyglot/EXIF payloads are destroyed.
- **Path traversal — NOT possible.** Every filesystem write/read passes the client name
  through `basename()`, and `SecureFileServing` additionally does `realpath()` containment.
- **IM / Support IDOR — NOT present.** Downloads and message reads enforce
  `isParticipant()` / `ticket.account_id === session.id` against the **session** account.
- **SSRF — NOT applicable.** No server-side fetch of any user-supplied URL exists anywhere in
  the app (grep for `file_get_contents(http`, `curl_*`, Guzzle client calls with user input:
  zero matches). `ExternalController` is a pure interstitial page — it never fetches the URL.
- **Stored XSS in messages/comments — NOT present.** Bodies are rendered through React JSX
  (`{message.body}`), which HTML-escapes by default. The single `dangerouslySetInnerHTML` in
  the codebase renders a **static i18n string**, not user input.

**Findings:** No Critical or High vulnerabilities. Three low-severity / hardening
observations are recorded below (defense-in-depth), plus an explicit "verified — not a
vulnerability" list documenting each attack the design already blocks.

---

## Findings

### F-05-01 — Inline serving of `text/plain` / `text/log` attachments without `X-Content-Type-Options: nosniff` (defense-in-depth)

- **File / Line:** `garnet-framework/Kernel/Io/FileUpload/SecureFileServing.php:80-104`
  (`isInlineSafe()` allows any `text/*`; response omits `X-Content-Type-Options`).
  Reached from `FwSupportController::get__download` (`.../Support/Controllers/FwSupportController.php:427`)
  and `FwImController::get__download` (`.../Messaging/Controllers/FwImController.php:383`).
- **Severity:** Low
- **Description:** Support and IM attachment rules (`UploadRules::documentsAndImages()`,
  `UploadRules.php:18-19`) permit extensions `txt` and `log` with MIME `text/plain`.
  `SecureFileServing::serve()` defaults to `inline: true`, and `isInlineSafe('text/plain')`
  returns true (`str_starts_with($mime, 'text/')`), so such files are delivered with
  `Content-Disposition: inline`. The response sets `Content-Type` from the file extension but
  does **not** send `X-Content-Type-Options: nosniff`.
- **Exploitation scenario:** An authenticated attacker uploads `payload.txt` whose bytes are
  `<script>...</script>` (still real-MIME `text/plain`, so it passes the finfo check) as a
  support/IM attachment, then lures a victim to the `~download?id=N` link (same-origin, under
  the application host). In modern Chrome/Firefox, a resource explicitly declared
  `Content-Type: text/plain` is **not** rendered as HTML and is **not** content-sniffed up to
  `text/html`, so script execution does **not** occur in current mainstream browsers — this is
  why the rating is Low, not High. The residual risk is (a) legacy/edge browsers or future
  sniffing-behaviour changes, and (b) the file being served from the application's own origin
  rather than an isolated sandbox host.
- **Recommendation:** Add `X-Content-Type-Options: nosniff` to every `SecureFileServing`
  response, and consider forcing `Content-Disposition: attachment` for `text/*` (only truly
  render `image/*` and `application/pdf` inline). Optionally serve user attachments from a
  cookieless sandbox domain. Note: `svg` is already excluded from the support/IM whitelists
  (good — the classic SVG-XSS vector is closed).

### F-05-02 — `PublicImageUploadTrait` uses weaker validation than the avatar path (hardening; admin-gated)

- **File / Line:** `garnet-framework/Bundle/Utils/Upload/PublicImageUploadTrait.php:42-67`.
  Used by `Dashboard/Controllers/DashboardSystemController.php:28` and referenced by
  `Dashboard/Controllers/DashboardStaticPagesController.php:155-156`.
- **Severity:** Low (mitigated by admin-only access control).
- **Description:** Unlike the avatar flow (which fully re-encodes the image through GD), this
  trait stores the uploaded bytes **as-is** via `move_uploaded_file`. It validates MIME with
  `mime_content_type()` against an image whitelist and, on a disallowed extension, silently
  **coerces the stored extension to `jpg`** (`$ext = 'jpg'`, line 59) rather than rejecting.
  A file whose content sniffs as an allowed image type but is a polyglot (valid image header +
  trailing script) would be stored verbatim under a random name with a forced image extension.
- **Exploitation scenario:** Reachable **only** by users passing `static::isAllowed()`
  (`DashboardSystemController` / `DashboardStaticPagesController` gate this to admins/owners —
  confirmed the endpoints are Dashboard-only). Because the stored extension is always a safe
  image extension and the filename is random hex, direct RCE is not achievable even for an
  admin; the residual concern is storing un-sanitised (polyglot / metadata-laden) bytes in a
  publicly served directory. Not reachable by regular authenticated users.
- **Recommendation:** For consistency with the avatar path, re-encode uploaded images through
  GD/Imagick (strip metadata, normalise format) instead of `move_uploaded_file` of raw bytes,
  and **reject** disallowed extensions rather than coercing to `jpg`.

### F-05-03 — `sanitizeUrl()` allows link-shaped values that render literally on the interstitial (very low)

- **File / Line:** `Foreground/Controllers/ExternalController.php:61-75` (`sanitizeUrl`).
- **Severity:** Low / informational.
- **Description:** `sanitizeUrl()` correctly whitelists only `http`/`https` schemes and
  requires a host (rejecting `javascript:`, `data:`, relative paths, and malformed input). It
  does **not** further normalise the host, so values such as `http://127.0.0.1/`,
  `http://169.254.169.254/`, `http://[::1]/`, `http://user@evil.tld@good.tld/`, or
  IDN/punycode hosts are accepted and shown to the user.
- **Exploitation scenario:** This is an **interstitial display page only** — the server never
  fetches the URL (confirmed: no SSRF sink anywhere, see F-verified list). The accepted URL is
  emitted into the Twig template as `target_url` / `host_text`; Twig auto-escaping neutralises
  HTML injection, and `parse_url(..., PHP_URL_HOST)` derives the displayed host. The only
  residual risk is user-facing phishing (a confusing/deceptive host string on the warning
  page), which is precisely the abuse the interstitial is designed to surface, not enable.
- **Recommendation:** Optional hardening — when building `host_text`, prefer the parsed
  `PHP_URL_HOST` (already done) and consider flagging obviously-internal hosts
  (loopback / link-local / RFC1918) in the UI. **Critical caveat for future maintainers:** if
  any server-side fetch of this URL is ever introduced (preview, unfurl, screenshot,
  OG-scrape), this function is **insufficient** as an SSRF guard and must be replaced with
  DNS-resolved IP allow/deny-listing. As of this review, no such fetch exists.

---

## Verified — Not a Vulnerability

Each item below was traced end-to-end and confirmed defended:

1. **RCE via executable upload (`.php`, `.phtml`, `.htaccess`) — BLOCKED.**
   `FileUploadManager::validateFile` (`FileUploadManager.php:136-184`) enforces an extension
   whitelist **and** a finfo real-MIME whitelist; `storeSingle` (`:84-103`) writes to a
   server-generated random name `bin2hex(random_bytes(16)).<ext>` where `<ext>` derives from an
   already-whitelisted original name, and only after `is_uploaded_file()` +
   `move_uploaded_file()`. `.php` is absent from every `UploadRules` preset. Avatars never keep
   the uploaded bytes at all — `ImageUpload::saveImage` re-encodes via `Gumlet\ImageResize`
   and writes a server-chosen extension (`ImageUpload.php:26-35, 65-90`). No web-executable
   file can be produced.

2. **Path traversal on upload write — BLOCKED.** `storeSingle` applies `basename($file['name'])`
   (`FileUploadManager.php:85`) before deriving the extension, and the stored name is fully
   server-generated, so `../../` in a client filename cannot escape the subdir.
   `delete()`/`getPath()`/`exists()` all `basename()` the input (`:108-132`).

3. **Path traversal on download read — BLOCKED.** `SecureFileServing::serve`
   (`SecureFileServing.php:52-66`) `basename()`s `storedName` and then requires
   `realpath($fullPath)` to be contained within `realpath($basePath)`. `storedName` is not even
   user-supplied at the HTTP layer — it is looked up from the DB by integer attachment id.

4. **Avatar / attachment IDOR (overwrite or delete another user's file) — NOT PRESENT.**
   Self-service profile save (`RegMiddleware::processPost`,
   `garnet-framework/.../RegMiddleware.php:87-112`, invoked by
   `MainController::post__profile_edit`, `MainController.php:523-533`) operates exclusively on
   `Account::fromSession()`; `prevData` and the `{token16}` upload path come from the session
   account's own record (`UserEntityConfig.php:102`), never from request input. There is no
   user-supplied id/filename in the avatar path.

5. **IM IDOR (read/write another user's dialog) — NOT PRESENT.**
   - `post__messages` (`FwImController.php:206-227`) requires
     `conversationsTable::isParticipant($conversationId, $sessionAccountId)` before returning
     any message; `isParticipant` checks `participant_a`/`participant_b`
     (`FwImConversations.php:53-61`).
   - `get__download` (`FwImController.php:350-390`) applies the same `isParticipant` access
     check via `SecureFileServing`'s `accessCheck`.
   - `post__send` (`:276-346`) always routes to `findOrCreate($sessionAccountId, $recipientId)`
     — a caller cannot inject an arbitrary `conversation_id` to write into a foreign dialog.
   - `post__quickChat` (`:430-506`) only reads a pre-existing conversation keyed by
     `min/max(sessionId, partnerId)`; it never exposes third-party dialogs.

6. **Support-ticket IDOR — NOT PRESENT.** `post__messages`, `post__reply`, and `get__download`
   in `FwSupportController` all enforce `ticket.account_id === sessionAccountId`
   (`FwSupportController.php:220, 359, 432`) and additionally refuse `is_internal` messages to
   users (`:227, 423`).

7. **Stored XSS via message / comment body — NOT PRESENT.** `MessageBubble.tsx:24` renders
   `{message.body}` and `AttachmentDisplay.tsx` renders `{att.original_name}` through React JSX
   escaping. Comment bodies flow through the same React path. The only
   `dangerouslySetInnerHTML` (`RegistrationForm.tsx:152`) injects
   `renderMarkdownLinks(I18n.Consent_PD())` — a static translation constant, not user input.

8. **XSS via attachment `download_url` — NOT PRESENT.** URLs are built server-side as
   `<controller>~download?id=<int-cast id>` (`FwImController.php:151`,
   `FwSupportController.php:126`); the id is integer-cast and the URL is used as a React `href`,
   not raw HTML.

9. **SSRF — NOT APPLICABLE.** Repository-wide grep (excluding vendor) for server-side URL
   fetching (`file_get_contents(http…`, `curl_init`/`curl_exec`/`curl_setopt`,
   `fopen(http…`, `GuzzleHttp`/`new Client`/`->request($…)`/`->get($…)`, `fsockopen`,
   `get_headers`) returned **zero** matches in application code. `ExternalController` displays
   the URL but never requests it.

10. **Upload size / count limits — PRESENT.** `UploadRules` enforces `maxFileSize`
    (5 MB default, 20 MB lessons) and `maxFilesCount` (`UploadRules.php:15-23`), checked in
    `FileUploadManager::storeAll`/`validateFile` (`:51-53, 148-154`).

11. **CSRF on state-changing endpoints — PRESENT.** `post__send`, `post__createTicket`,
    `post__reply`, and comment create/delete verify `hash_equals(Session::touchCSRF_(), …)`
    (`FwImController.php:283-287`, `FwSupportController.php:277-281, 342-346`,
    `CommentsController.php:84-87, 142-145`).

---

## Notes / Residual Hardening Backlog (non-blocking)

- Add `X-Content-Type-Options: nosniff` to `SecureFileServing` responses (F-05-01).
- Prefer `attachment` disposition for `text/*`; reserve `inline` for `image/*` + `pdf`.
- Re-encode images in `PublicImageUploadTrait` and reject (don't coerce) bad extensions (F-05-02).
- If a URL-preview/unfurl feature is ever added, replace `ExternalController::sanitizeUrl` with
  a DNS-resolving IP-based SSRF guard before any server-side fetch (F-05-03).
- Consider serving all user-uploaded content from a separate cookieless origin.
