# Account-free Samsung display and speed probe

An isolated Web app, **not a Vemm build**. It has no Plex client, no credentials,
no network requests of its own, no storage writes and no remote-key injection.
Its only job is to record what the installed `webapis.avplay` runtime exposes and
what the firmware answers to the picture and speed calls, so that picture
settings and playback speed can ship on measured evidence:

- `displaySpeedProbe.identity()` — model, firmware, AVPlay version, user agent.
- `displaySpeedProbe.capabilities()` — which AVPlay methods exist, which
  `AVPLAY_DISPLAY_*` / `AVPLAY_SPEED_*` constants the firmware defines and the
  values it gives them. Values are read from the runtime, never assumed.
- `displaySpeedProbe.state()` — `getState()` as a string.
- `displaySpeedProbe.prepare(URL)` / `.play()` / `.pause()` / `.stop()` — the
  operator supplies the URL. A URL that is not `http(s)` or that carries
  credentials is refused before it reaches AVPlay.
- `displaySpeedProbe.setDisplayMethod(NAME)` — sends the runtime's own constant,
  records the state, the value, the read-back from `getDisplayMethod()` when that
  getter exists, and the firmware's answer or error code.
- `displaySpeedProbe.setDisplayArea({x, y, width, height})` — same, for crop and
  pan; a non-integer, negative or zero-sized rectangle is refused locally.
- `displaySpeedProbe.setSpeed(NAME)` — refused locally with `requires-stream`
  unless the player is `READY`, `PLAYING`, `PAUSED` or `BUFFERING`, so an idle
  player never produces a meaningless rejection record.
- `displaySpeedProbe.report()` — `{ identity, capabilities, entries }`, ready to
  copy out of the inspector. `reset()` empties the log.

Outcomes are always one of `accepted`, `rejected`, `unsupported`,
`unknown-constant`, `requires-stream`, `invalid-rect`, `invalid-url`,
`no-avplay`. A method the firmware does not implement is reported as
`unsupported`; it is never emulated.

## Reproduce

Stage outside the checkout. Do not load production `main.js`: it can connect to
household accounts.

```sh
stage="$(mktemp -d)"
cp tools/tizen/display-speed-probe/{config.xml,index.html,probe.js} "$stage/"
node --check "$stage/probe.js"
node tools/tizen/display-speed-probe/selftest.cjs
tizen build-web --output "$stage/build" -- "$stage"
tizen package -t wgt -s EXISTING_SAMSUNG_PROFILE -o PRIVATE_OUTPUT -- "$stage/build"
```

Confirm the target's private identity and certificate coverage first, take the
toolkit's exclusive Samsung lane for the exact `TARGET_SERIAL`, and refuse to
install if `VemmDisp01.Probe` is already registered. Keep signed packages and
raw command output private.

Then, on the target, drive it from the inspector with a synthetic asset you own
(`YOUR_PLEX_TOKEN`-style tokens must never appear in the URL you pass):

```js
displaySpeedProbe.reset();
displaySpeedProbe.prepare("https://media.invalid/synthetic.mp4");
displaySpeedProbe.play();
displaySpeedProbe.capabilities().displayMethods.forEach(function (name) {
    displaySpeedProbe.setDisplayMethod(name);
});
displaySpeedProbe.setDisplayArea({ x: 0, y: 0, width: 1920, height: 1080 });
displaySpeedProbe.capabilities().speeds.forEach(function (entry) {
    displaySpeedProbe.setSpeed(entry.name);
});
JSON.stringify(displaySpeedProbe.report());
```

Record the whole `report()` object, the exact model/family/firmware tuple and
the date in [the results document](../../../docs/vemm/09-display-and-speed-probe.md).
A screenshot of the picture at each display method is the visual half of the
evidence; the report is the API half.

Always close the inspector, remove only the forward you created, stop this probe
and uninstall the full Web application ID:

```sh
tizen uninstall -p VemmDisp01.Probe -s TARGET_SERIAL
```

Verify absence with `sdb -s TARGET_SERIAL shell 0 applist`, confirm the product
app remains registered, and release the lane. Exit status alone never
establishes cleanup.

## Observed result

None yet. The host contract in `selftest.cjs` runs against mocks only; no model
has been measured. See
[the results document](../../../docs/vemm/09-display-and-speed-probe.md) for what
is and is not established, and for the gate that any UI must wait behind.
