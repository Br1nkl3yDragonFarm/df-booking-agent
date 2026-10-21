# Dragon Farm booking hub — notes for Claude

Booking, sync and fan tools for Dragon Farm Records (Nashville). The owner is not a programmer: explain changes in plain English, and ask before anything that can't be undone.

## Stack
- Static HTML pages and plain browser JS at the repo root. No framework, no bundler, no build step (`netlify.toml` has `command = ""`).
- Server code: `netlify/functions/*.mjs`, shared helpers in `netlify/lib/`. Data lives in Netlify Blobs.
- Third-party browser libraries are vendored in `vendor/` with their license headers. Don't edit them.
- Automations: `n8n/` (an n8n workflow and a Google Sheets Apps Script).
- The file map and every feature are documented in `README.md`.

## Commands
- Install server dependencies: `npm ci`
- Syntax-check a file: `node --check path/to/file.js` (works for `.js` and `.mjs`)
- Check everything you changed: `git diff --name-only | grep -E '\.m?js$' | xargs -n1 node --check`
- There is no test suite, linter or formatter in this repo. Don't invent one; ask first.

## Code rules
- Read the surrounding code first and write new code the same way: same naming, same comment style, small and simple.
- Make the smallest change that does the job. No new framework, database, build step or npm dependency without the owner's OK.
- Never put a key or secret in the code. Keys go in Netlify environment variables and get a numbered Setup step in `README.md`.
- Private data (leads, money, fans, contacts) stays behind `DF_CRM_PASSCODE`. Public pages (`index.html`, `epk.html`, `fans.html`, `sign.html`) show only what is meant to be public.
- Claude calls go through `netlify/functions/ai-proxy.mjs` or a server function, never straight from the browser with a key.
- Check webhook signatures (Stripe, Resend). Never trust form input.
- Every new feature gets a Features bullet in `README.md`, plus the File Structure list if you add a file.

## Never touch
- `vendor/` (third-party code), `logo*` images, `package-lock.json` by hand (use `npm`), `.env` or any secrets file.
- `main`: never push, merge or deploy to it. Work on the branch you were given.

## Mistakes made here before
- A catch-all redirect in `netlify.toml` swallowed `/.netlify/functions/*` and broke every function. Test redirects against a function URL.
- Claude replies that should be JSON sometimes come back wrapped in prose or code fences. Parse them tolerantly (find the JSON), as the finder does.
- The AI proxy once broke on a fetch/https mismatch in the Netlify runtime. Run a changed function, don't just read it.
- Mobile layouts (hamburger menu, sync grid) broke without anyone noticing. Check UI work at phone width.

## Definition of done
A change is done only when all of these are true, and your summary says what you ran and what it printed:
1. `node --check` passes on every changed `.js` / `.mjs` file.
2. UI changes: the page was loaded in a browser (Playwright + the preinstalled Chromium is fine) at desktop and ~390px width, and you looked at the screenshot.
3. Function changes: the function was run (`npx netlify dev`, or by importing the handler in a small script) and returned what it should.
4. `README.md` reflects the change.
Never say "should work". Say what you ran and what happened.

## AI team
Specialist agents live in `.claude/agents/` (booker, sync-scout, deal-checker, promoter, pr-specialist, designer, coder, snoop-coordinator, code-reviewer). They draft; nothing is sent, posted, signed or paid without the owner's OK.
Installing a skill (`npx skills add …`) or an MCP server runs someone else's code with full permissions: ask first, and prefer known sources (`anthropics`, `vercel-labs`, `supabase`).

## For you, the human
- `/clear` between unrelated tasks.
- `/compact` when one task runs long.
- Esc Esc rewinds when Claude takes a wrong turn. It undoes Claude's file edits, but not changes made by shell commands, so commit before anything risky.
