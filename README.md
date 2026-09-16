# Midea JRE + UNILAND Daily Energy Calculator

I made this because the daily energy report is simple in theory, but annoying to do by hand every morning.

The raw numbers are cumulative meter readings. Some meters use multipliers, some areas contain several meters, JRE and UNILAND do not use exactly the same reporting format, and a single typo can turn into a very convincing but completely wrong kWh figure. Excel is still useful as the archive, but it should not be the place where somebody has to repeat the same subtraction and ratio math every day.

This page does that repetitive part locally in the browser.

There is no ChatGPT, Gemini, OpenAI API, backend, login, database, analytics script, or API key in the runtime. The calculation rules are plain JavaScript and can be checked line by line.

## What the calculator actually does

For a normal meter:

```text
Daily consumption = Today cumulative reading - Yesterday cumulative reading
```

For a meter with a multiplier:

```text
Daily consumption = (Today - Yesterday) × Ratio
```

For the UNILAND meters written like this:

```text
((Ratio 3200)/1000)
```

the calculation is:

```text
(Today - Yesterday) × 3200 / 1000
```

The plant rules are fixed in `engine.js`, so the page does not silently invent ratios from whatever text happens to be pasted.

## The two plant workflows

### JRE

JRE uses the 29-point daily report format we have been using in the factory group.

A few examples of fixed ratios:

- Indoor: first meter ×250, second meter ×40
- Outdoor: first meter ×1, second meter ×40
- Window: ×1, ×90, ×90, ×40, ×40
- Heat Exchanger: ×40, ×1, ×1, ×1
- Piping Building 1#: ×40
- Warehouse Area: ×40, ×1, ×1
- Utility Area: ×1, ×40
- Heater LPG: ×40

The output keeps the JRE report style, including two decimal places for non-zero kWh values.

The page also calculates:

```text
Piping All = Piping Building 1# + Piping Building 3#
```

and compares the sum of points 2–29 against the main Total meter. That gap is shown on the dashboard because it is useful when checking whether all monitored sub-areas explain the plant total.

The built-in JRE example is deliberately synthetic. It uses the real ratio rules and all 29 report rows, but it does not publish a historical factory meter snapshot in the repository. The self-check currently expects:

```text
Total = 1000.00 kWh
Indoor = 70.00 kWh
Injection Molding = 130.00 kWh
Electricity Building 2# = 22.00 kWh
Sum points 2–29 = 886.00 kWh
Gap = 114.00 kWh
Piping All = 15.00 kWh
```

### UNILAND

UNILAND follows the same idea, but a few meters have fixed conversion ratios:

```text
Total                         × 3200 / 1000   -> MWh
Building A                    × 160 / 1000    -> MWh
Building B                    × 80 / 1000     -> MWh
PP hydrant                    × 160 / 1000    -> MWh
SDP pompa                     × 20 / 1000     -> MWh
Dp power house                × 20 / 1000     -> MWh
Refrigant and LPG area        × 40            -> kWh
```

A dash (`-`) means the reading is unavailable. It is **not** converted to zero.

JRE has one narrow exception because of how the daily log is currently written: for `Air Compressor 1#` and `New Air Compressor 2#`, a dash paired with a zero reading on the other day is treated as an inactive meter and reported as `0 kWh`. A dash paired with a non-zero counter reading is still treated as missing and is flagged for checking.

The UNILAND Excel helper also calculates these two grouped columns automatically:

```text
Indoor Area = Indoor + Vacum box indoor

Outdoor Area = Outdoor
             + Vacum box outdoor
             + Line compressor outdoor
```

The built-in UNILAND example is synthetic for the same reason. It still exercises the fixed ratios, missing `-` readings, repeated report numbering, and derived worksheet columns:

```text
Total = 3.2 MWh
Building A = 0.32 MWh
Heat Exchanger = 40 kWh
Refrigant and LPG area = 20 kWh
Indoor Area = 25 kWh
Outdoor Area = 43 kWh
```

The slightly strange repeated row numbering in the UNILAND report is kept on purpose because that is the current group-report template. The calculator matches equipment by name, not by assuming every row number is unique.

## Input format

You can paste the meter text almost exactly as it comes from the daily message.

Both decimal styles are accepted:

```text
131.11
131,11
```

A date line is also accepted:

```text
16/09/2026
```

The Today date is used as the report date when it is present in the pasted text.

Example JRE line:

```text
2. Indoor: 131,11 (Ratio 250) + 138,72 (Ratio 40)
```

Example UNILAND line:

```text
1. Total: 101 ((Ratio 3200)/1000)
```

The parser also tolerates the usual message preamble when a reading is copied together with a name/timestamp, as long as the actual meter lines keep the normal `Name: Reading` structure.

## What happens when the raw data looks wrong

The calculator does not auto-correct suspicious readings.

It warns when it sees things such as:

- Today lower than Yesterday
- an unusually large cumulative-meter jump
- a pasted ratio that disagrees with the fixed plant ratio
- a date pair that is not a normal consecutive 24-hour interval
- one day containing a meter while the other day contains `-`
- malformed or duplicated equipment lines

If a suspicious reading is found, the report gets a `CHECK RAW DATA` section instead of quietly guessing what the operator meant.

That behavior is deliberate. A calculator should be good at arithmetic, not at inventing meter readings.

## Running it

The repo is intentionally just a static page.

### Easiest way

Open `index.html` in a browser.

No install step is required.

### Local HTTP server

If your browser or company policy is stricter about local files, run any simple static server from the repo folder. For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### GitHub Pages / Vercel / internal static hosting

There is no build step. Serve the repository root as a static site.

The files that matter at runtime are:

```text
index.html
style.css
engine.js
app.js
asset/Midea.webp
```

## Daily use

A normal workflow is:

1. Select JRE or UNILAND.
2. Paste Yesterday's cumulative readings.
3. Paste Today's cumulative readings.
4. Paste the daily LPG / gas / water / refrigerant values if needed.
5. Click **CALCULATE REPORT** or press `Ctrl+Enter`.
6. Read any validation warning before copying the report.
7. Use **COPY FULL REPORT** for the group format. The button only copies when both JRE and UNILAND have been calculated for the same report date, so an old UNILAND result cannot quietly ride along with a newer JRE report.
8. Use **Copy Current Plant** when you intentionally need only one plant, and **Copy Paste-Ready Row** for the relevant Excel worksheet columns.
9. At the end, **SAVE TODAY AS NEXT BASELINE** if this browser should remember today's raw reading for tomorrow.

Only that explicitly saved baseline is persisted. The page no longer writes every current meter entry and calculated report into browser storage automatically.

If the computer is shared, use **Forget Saved Baseline** when you do not want the saved baseline to remain in that browser.

## Report format

The full output follows this structure:

```text
[INDONESIA FACTORY ENERGY REPORT]

Summary situation:
A) JRE (SEPTEMBER XX, 2026 - 24 HOURS)
...
- LPG: ...
- Oxygen: ...
- Nitrogen: ...
- Refrigerant R32: ...
- Water: ...

B) UNILAND (SEPTEMBER XX, 2026 - 24 Hours)
...
* LPG: ...
* Air Compressor: ...
* Oxygen: ...
* Nitrogen: ...
* Water: ...
* R32: ...
* R454B: ...
```

The different utility prefixes (`-` for JRE, `*` for UNILAND) and the JRE/UNILAND `24 HOURS` capitalization are intentional because they follow the current report baseline.

## Self-check and tests

There are two ways to check the math.

Inside the page, click **Self-Check**. It runs synthetic JRE and UNILAND fixtures against the same plant formulas used for real inputs.

If Node.js is available, the repository also has a small test suite with no third-party dependency:

```bash
npm test
```

The tests cover the reference calculations, decimal-comma parsing, missing `-` readings, report formatting, worksheet derived columns, and typo/jump detection.

## Repo layout

```text
.
├── index.html                 # page structure
├── style.css                  # UI styling
├── engine.js                  # parser, ratios, calculations, validation, report format
├── app.js                     # browser UI and local baseline handling
├── asset/
│   └── Midea.webp
├── tests/
│   └── engine.test.mjs
├── SECURITY.md
├── package.json               # only used for npm test; no dependencies
└── README.md
```

## Before making the repository public

The cleaned tree no longer contains the historical factory meter snapshots that were used while the first version was being built, and it does not contain a working API key or token.

There is still plant-specific information in the source **by design**: equipment names, fixed meter ratios, report wording, and the Midea logo. If those details are considered internal at your site, keep the repository private even though the app itself has no backend or credential.

Also remember that Git has a memory. Older commits in the existing GitHub repository contained factory-looking sample readings and an AI Studio `.env.example` with placeholder variable names such as `GEMINI_API_KEY`. The placeholder value was not a usable secret, but removing a file in a new commit does not erase old commits. If the historical readings should not remain public, rewrite the repository history or start a fresh clean repository from this snapshot before publishing it.

If a real credential was ever committed at any point, rotate it first. History cleanup is not a substitute for credential rotation.

## A note about the old version

The first version of this repo came from a much heavier starter scaffold. It still had an unused React/Vite structure, an unused `@google/genai` dependency, an AI-Studio metadata flag, and two external time API calls even though the README said the app was fully local.

Those pieces were removed in this cleanup.

The current version does not need them. The browser already knows how to calculate the date in `Asia/Jakarta`, and energy arithmetic does not need an AI SDK.

If you change the meter layout later, update the plant schema and the test case together. That is much safer than changing a ratio in the UI and hoping everybody's browser has the same local configuration.
