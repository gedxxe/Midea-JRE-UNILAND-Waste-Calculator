# Security notes

This project is a local/static calculator. It has no backend service and no authentication layer.

## Data handling

- Meter readings are calculated in the browser.
- The page does not send meter readings to an external API.
- `connect-src 'none'` is set in the page Content Security Policy, so runtime network requests are blocked by the browser.
- Current Yesterday/Today inputs and generated reports are kept in memory only.
- The only meter data intentionally persisted is the baseline saved with **SAVE TODAY AS NEXT BASELINE**.
- **Forget Saved Baseline** removes that saved baseline for the selected plant.

## Secrets

The repository does not require API keys, access tokens, passwords, `.env` files, or cloud credentials.

Do not add real credentials to the repo. If a future version ever needs a backend, keep secrets on the server side and out of browser JavaScript.

## Browser-side risks

Pasted meter text is treated as data, not executable HTML. Dynamic report/detail text is written with `textContent` / DOM nodes instead of injecting raw pasted strings into HTML.

A Content Security Policy is included as another layer of protection, but it is not a replacement for safe DOM handling.

## Reporting a problem

If you find a calculation or security issue, open an issue with a minimal example that reproduces it. Do not include internal passwords, tokens, or sensitive factory information that is not needed to reproduce the bug.

## What is still plant-specific

The app intentionally contains JRE/UNILAND equipment names, fixed meter ratios, report wording, and the Midea logo. Those are not credentials, but they may still count as internal operational information depending on company policy. If that information should not be public, use a private repository.

## Existing Git history

This cleaned snapshot uses synthetic example readings and contains no working API credential. The existing public Git history, however, includes older factory-looking sample readings and an AI Studio `.env.example` that used placeholder names such as `GEMINI_API_KEY="MY_GEMINI_API_KEY"`. That placeholder is not a usable API key, but deleting it from the current tree does not erase old commits.

If the historical meter readings should not remain public, rewrite the repository history (for example with `git filter-repo`) or publish this cleaned snapshot as a fresh repository. If a real credential was ever committed, rotate it first; deleting or rewriting Git history alone is not enough.
