# 09 — Display method and playback speed probe evidence

Phase P4 of the parity plan delivers **probe scripts and this document only**. No
picture-settings or playback-speed UI ships from this phase, and nothing in
`samsung/Vemm/` was changed by it. The gate is that evidence is recorded here
before any UI ships.

## What exists

`tools/tizen/display-speed-probe/` is an isolated, account-free Tizen Web app
(`VemmDisp01.Probe`, package `VemmDisp01`) plus a host contract:

| File | Role |
|---|---|
| `probe.js` | Reads the installed `webapis.avplay` runtime and records its answers |
| `index.html`, `config.xml` | Minimal shell; `productinfo` + `avplay` privileges only |
| `selftest.cjs` | Host contract against a mocked AVPlay object |
| `README.md` | Staging, inspector procedure, teardown |

`selftest.cjs` is wired into the host gate (`tools/tizen/test.sh`) next to the
acceleration probe's selftest. It proves the probe's bookkeeping, not the
firmware's behaviour:

- display-method and speed **constants are read from the runtime**. The fixture
  deliberately numbers `AVPLAY_DISPLAY_WIN_FIT` as `7` and
  `AVPLAY_SPEED_FAST_FORWARD_2X` as `11`; the probe sends those numbers, so a
  firmware that numbers them differently is recorded instead of being sent a
  guessed value.
- a constant the runtime does not define is reported as `unknown-constant` with
  the names it does define, and is never sent. That includes the legacy
  `PLAYER_DISPLAY_MODE_LETTER_BOX` string the product uses today, which is not
  an `AVPLAY_*` constant.
- `setSpeed` before a stream is open is refused locally as `requires-stream`
  (allowed states `READY`, `PLAYING`, `PAUSED`, `BUFFERING`), so an idle player
  cannot produce a meaningless rejection record.
- `setDisplayArea` refuses a non-integer, negative or zero-sized rectangle
  locally; only a valid `AVPlayVideoRect` reaches the firmware.
- a method the firmware lacks is recorded as `unsupported` and never called; a
  missing `getDisplayMethod`/`getSpeed` getter is recorded as `unsupported`
  rather than guessed; a throwing method is recorded as `rejected` with the
  firmware's own message and error code.
- `prepare` refuses a URL that is not `http(s)` or that carries credentials,
  before AVPlay is touched — the probe cannot leak a token.
- `report()` is JSON-serializable and timestamped; `reset()` empties it.
- the probe source contains no `fetch`, `XMLHttpRequest`, `localStorage`,
  cookie, application or Plex surface.

Host result on this checkout: **green** — `14 display/speed probe contract checks
passed (host mocks, not device evidence).`

## What is not established

Nothing about a Samsung model has been measured by this phase. Specifically,
**no device run has been recorded**, so the following are all still unknown:

- whether the target firmware exposes `getDisplayMethod` / `getSpeed` at all
  (the probe will report `unsupported` rather than invent them);
- which `AVPLAY_SPEED_*` constants a given model defines, and whether
  `setSpeed` is accepted but silently ignored — an `accepted` record with an
  unchanged `after` read-back is exactly that case, and the report is built to
  show it;
- whether `setDisplayArea` crops, pans or is ignored, and whether it survives a
  stream change;
- whether a display-method change during playback repaints without a seek.

Per `AGENTS.md`, a green host contract is not hardware acceptance, and no
capability claim is made beyond the evidence below.

## Evidence already on file

- **Display method is required, and the product hardcodes one.**
  `samsung/Vemm/js/avplay.js:75` calls
  `setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX")` on every prepare.
- **Letterboxing was observed on real hardware.** `docs/samsung-tizen-poc.md`
  (aspect-ratio row, and test T2.6): with only `setDisplayRect(0,0,1920,1080)`
  2.40:1 content was stretched to fill 16:9 (Owner-observed); calling
  `setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')` gave correct bars and
  proportions (Owner-observed). That is level-3 playback observation for one
  2017 tuple only; it says nothing about `AVPLAY_DISPLAY_CROP`, `setDisplayArea`
  or zoom.
- **Playback speed is absent from the app.** `parity-research/VEMM-FEATURES.md`
  records no `setSpeed`/`playbackRate` anywhere in the app, and
  `parity-research/PLEX-FEATURES.md` records Plex's speed control as available
  generally but **not** on the Samsung client — so speed is differentiation, not
  parity, and the official Samsung client is not evidence that AVPlay exposes it.
- **Frame-rate matching stays a documented non-goal.** There is no AVPlay API
  for it; nothing in this probe measures it.

## Gate before any UI ships

1. Run the probe on the QN92F and on the emulator (agent-run, under explicit
   deployment authorization) and paste the full `report()` here, per model, with
   the exact model/family/firmware/Tizen tuple and the date.
2. Add the visual half: a screenshot of the same frame at each accepted
   `AVPLAY_DISPLAY_*` value, and of the picture after each accepted
   `setDisplayArea`.
3. Only then design UI, and only for the outcomes the report shows as `accepted`
   with a matching read-back. Anything `unsupported` ships as an explicit
   unsupported state, never as a silently dead control.
