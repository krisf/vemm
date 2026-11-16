"use strict";
// Regression: rapid skipping during playback must not raise a seek error.
// Before the fix, avplay.seek() rejected a second seek while one was in flight
// ("A seek is already in progress. Wait before seeking again."), which surfaced
// as the "Playback problem" panel when the user skipped around a lot. The fix
// coalesces: the newest target wins and every caller in the burst gets the final
// landed position, with no rejection.
var assert = require("assert");
var av = require("../../samsung/Vemm/js/avplay.js");

// A native adapter whose seekTo HOLDS its callback so a seek stays in flight,
// reproducing a second skip arriving before the first lands.
function holding() {
    var state = "NONE";
    var time = 0;
    var pending = [];
    return {
        getState: function () { return state; },
        open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; },
        stop: function () { state = "IDLE"; },
        setDisplayRect: function () {},
        setDisplayMethod: function () {},
        setListener: function () {},
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return 100000; },
        getCurrentTime: function () { return time; },
        seekTo: function (target, success, error) { pending.push({ target: target, success: success, error: error }); },
        play: function () { state = "PLAYING"; },
        pause: function () { state = "PAUSED"; },
        getTotalTrackInfo: function () { return []; },
        setSelectTrack: function () {},
        setSilentSubtitle: function () {},
        land: function () {
            var p = pending.shift();
            if (!p) { return false; }
            time = Math.floor(p.target / 1000) * 1000;
            p.success();
            return true;
        },
        inflight: function () { return pending.length; }
    };
}

async function run() {
    var native = holding();
    var adapter = av.create({ avplay: native, seekTimeout: 1000 });
    await adapter.open("https://synthetic.invalid/stream", 0);

    // First skip goes in flight and holds.
    var first = adapter.seek(20000);
    assert.strictEqual(native.inflight(), 1, "the first seek must reach the native player");

    // Rapid skip: a second seek arrives while the first is still in flight.
    var second = adapter.seek(60000);
    var rejected = false;
    second.then(function () {}, function () { rejected = true; });

    // Land the first native seek; the adapter must chain to the newest target.
    native.land();
    await Promise.resolve();
    assert.strictEqual(native.inflight(), 1, "the adapter must chain a native seek to the newest target");
    native.land();

    var landed = await second;
    await first;
    assert.strictEqual(rejected, false, "rapid skipping must not raise a seek error");
    assert.strictEqual(landed, 60000, "the newest seek target must win");
    assert.strictEqual(adapter.snapshot().position, 60000, "the playhead must land at the newest target");

    // A burst of three skips still lands at the last target with no error.
    var a = adapter.seek(10000);
    var b = adapter.seek(40000);
    var c = adapter.seek(80000);
    var burstRejected = false;
    c.then(function () {}, function () { burstRejected = true; });
    native.land();           // lands the in-flight seek, chains toward 80000
    await Promise.resolve();
    while (native.inflight()) { native.land(); await Promise.resolve(); }
    assert.strictEqual(await c, 80000, "a three-skip burst must land at the last target");
    assert.strictEqual(burstRejected, false, "a skip burst must not raise a seek error");
    await a; await b;
    assert.strictEqual(adapter.snapshot().position, 80000);
    adapter.close();
    console.log("Tizen rapid-seek coalescing tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });