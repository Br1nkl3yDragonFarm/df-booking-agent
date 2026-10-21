---
name: ship-change
description: Finish and hand off a code change in the Dragon Farm booking hub - check it, get it reviewed, update the README, commit and push to the working branch. Use when the owner says "ship it", "wrap this up", "commit this", "open a PR" or the work on a feature is done.
---

# Ship a change

Follow these steps in order. Stop and tell the owner if any step fails; don't skip it.

1. **See what changed.** `git status` and `git diff`. If files changed that have nothing to do with the task, ask before including them.
2. **Syntax check.** Run `node --check` on every changed `.js` / `.mjs` file:
   `git diff --name-only HEAD | grep -E '\.m?js$' | grep -v '^vendor/' | xargs -rn1 node --check`
3. **Prove it works** (the Definition of done in `CLAUDE.md`):
   - Page changes: load the page in Chromium with Playwright at desktop and 390px width, take screenshots and look at them.
   - Function changes: run the function and show what it returned.
4. **Review.** Hand the diff to the `code-reviewer` agent. Fix every bug or security finding before going on.
5. **README.** Make sure `README.md` has a Features bullet for anything new, a Setup step for any new environment variable, and the File Structure entry for any new file.
6. **Commit** with a short, plain-English message saying what the owner gets ("Add a fan sign-up QR code to show cards"), not how.
7. **Push** to the branch you were given: `git push -u origin <branch>`. Never push to `main`.
8. **PR** only if the owner asked for one.
9. **Tell the owner** in 3-5 plain lines: what changed, what you ran to check it and what it showed, and anything they need to do (a Netlify variable to set, a redeploy).
