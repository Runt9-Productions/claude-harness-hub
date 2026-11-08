# Lens: browser-surface

Tries to make the hub act for someone other than the person at its own tab: another origin's page, a rebound DNS name, or board text a model wrote; covers request checks, the launch token and cookie, response headers, and how board text reaches the page.

## The question

Can a page on another origin, a request that only looks local, or text written into a board make the hub read or
change anything?

## Before the diff

Read "What ships, and why a defect is expensive", "Fragile spots CI does not catch" and "Rulings that are not
findings" in `.claude/code-review-profile.md`, and "Code rules" in `CLAUDE.md`, whose "Browser surface" item is the
contract this lens judges against.

## In scope

Build the request or the text that gets through. Try:

- **Cross-site requests.** A form `POST` from another origin, a `text/plain` or `multipart` body, a missing or `null`
  `Origin`, a `GET` that changes state, a preflight the server answers.
- **DNS rebinding and host checks.** A `Host` header with another name, a different port, a trailing dot, upper case,
  or an IPv6 form of the loopback address; a bind to anything but `127.0.0.1`.
- **The launch token and cookie.** The token logged after its one print, kept in the URL, accepted twice, or
  compared in a way that leaks its length or timing; a cookie without `HttpOnly` or `SameSite=Strict`, or one that
  outlives a restart.
- **Response headers.** A response, error pages and static files included, without the full CSP, `nosniff` or
  `Referrer-Policy`; any CORS header.
- **Board text in the page.** Text reaching `innerHTML`, `insertAdjacentHTML`, `document.write`, the framework's raw
  HTML escape hatch, an `href` or `src` (a `javascript:` URL), a style, or an attribute name; markdown rendered as
  markup.
- **The live stream.** An event stream that sends to an unauthenticated client, or carries more than the snapshot
  needs.

## Out of scope

Readers of files and processes belong to `server-input`; CI and dependencies to `guardrails`.

## How far to read

Follow each request from where the server accepts it, through every check, to the handler and what it writes. Follow
each piece of board text from the source that reads it to the element that shows it.

## Severity

Every finding gives the request or the text that gets through and the line that lets it. A suspicion you cannot turn
into one is an open question, stating which input would test it.

Critical when another origin or board text can change state or read the snapshot. High when it needs an unusual but
reachable setup, such as a second local hostname. Normal for hardening with no bypass you can show.
