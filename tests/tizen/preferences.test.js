"use strict";
var assert = require("assert");
var prefs = require("../../samsung/Vemm/js/preferences.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.deepStrictEqual(prefs.load(storage), { quality: "original", language: "en", nextEpisode: "countdown",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto",
    autoSkipIntro: "manually", autoSkipCredits: "manually", upNextCountdown: "15",
    cinemaTrailers: "off", passOutProtection: "2", rewindOnResume: "none",
    subtitleBurnIn: "on", sectionViews: {}, enhancedGraphics: false,
    highContrast: "off", textScale: "normal", themeMusic: "on", screenSaver: "on" });
value = JSON.stringify({ quality: "720", language: "en", autoNext: false });
assert.deepStrictEqual(prefs.load(storage), { quality: "720", language: "en", nextEpisode: "off",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto",
    autoSkipIntro: "manually", autoSkipCredits: "manually", upNextCountdown: "15",
    cinemaTrailers: "off", passOutProtection: "2", rewindOnResume: "none",
    subtitleBurnIn: "on", sectionViews: {}, enhancedGraphics: false,
    highContrast: "off", textScale: "normal", themeMusic: "on", screenSaver: "on" },
    "Preferences from earlier app versions receive safe defaults; auto-play off stays off");
value = JSON.stringify({ quality: "720", language: "en", autoNext: true });
assert.strictEqual(prefs.load(storage).nextEpisode, "countdown", "Auto-play on becomes the LG credits countdown");
assert.strictEqual("autoNext" in prefs.load(storage), false);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", token: "synthetic-secret",
    skipInterval: 15, subtitleSize: "large", subtitlePosition: "middle", subtitleColor: "yellow", subtitleDelayMs: 500 });
assert.strictEqual(value.includes("secret"), false, "Only non-secret preference fields may be persisted");
assert.strictEqual(prefs.load(storage).language, "es");
assert.strictEqual(prefs.load(storage).skipInterval, 15);
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 500);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: -60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, -60000, "Sidecar timing supports the LG 60-second earlier bound");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 60000, "Subtitle timing supports the LG 60-second later bound");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 50 });
}, /invalid/, "Timing offsets must use the LG 100 ms step");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60100 });
}, /invalid/, "Timing offsets must stay inside the LG 60-second bound");
assert.strictEqual(prefs.load(storage).continueAction, "details", "Preferences saved before the Continue Watching choice load as Open details");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "play",
    skipInterval: 60, subtitleSize: "small", subtitlePosition: "high", subtitleColor: "white", subtitleDelayMs: -500 });
assert.strictEqual(prefs.load(storage).continueAction, "play");
assert.strictEqual(prefs.load(storage).skipInterval, 60);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "delete" }); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off" });
assert.strictEqual(prefs.load(storage).quality, "original", "Original quality is a saved choice");
assert.throws(function () { prefs.save(storage, { quality: "4k", language: "en", nextEpisode: "off" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", skipInterval: 45 }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitlePosition: "center" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 2501 }); }, /invalid/);
prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "off" });
assert.strictEqual(prefs.load(storage).directPlay, "off");
prefs.save(storage, { quality: "1080h", language: "en", nextEpisode: "after_credits", directPlay: "force",
    subtitleSize: "extra_large", subtitleColor: "grey_55" });
assert.strictEqual(prefs.load(storage).quality, "1080h", "The LG ladder's 1080p 20 Mbps rung is a saved choice");
assert.strictEqual(prefs.load(storage).directPlay, "force");
assert.strictEqual(prefs.load(storage).subtitleSize, "extra_large");
assert.strictEqual(prefs.load(storage).subtitleColor, "grey_55");
assert.strictEqual(prefs.load(storage).subtitleBackground, "off", "Subtitles default to the LG outline, no box");
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "on" });
assert.strictEqual(prefs.load(storage).subtitleBackground, "on");
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "grey" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "always" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "always" }); }, /invalid/);
value = "{invalid";
assert.throws(function () { prefs.load(storage); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: true });
assert.strictEqual(prefs.load(storage).enhancedGraphics, true);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: false });
assert.strictEqual(prefs.load(storage).enhancedGraphics, false);
[1, "true", null, {}].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: invalid });
    }, /invalid/);
});
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkipIntro: "automatically", autoSkipCredits: "manually" });
assert.strictEqual(prefs.load(storage).autoSkipIntro, "automatically", "Auto skip intro is a saved opt-in choice");
assert.strictEqual(prefs.load(storage).autoSkipCredits, "manually", "Auto skip credits is saved independently");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkipIntro: "manually", autoSkipCredits: "automatically" });
assert.strictEqual(prefs.load(storage).autoSkipCredits, "automatically", "Credits auto skip stays opt-in per row");
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkipIntro: "always" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkipCredits: true }); }, /invalid/);
assert.deepStrictEqual(prefs.autoSkipModes, ["disabled", "manually", "automatically"], "Settings offers exactly the supported auto-skip modes");
// UIF-P1 migration: the single legacy "Auto skip":"on" turns BOTH new rows on.
// UIFLOW3 A5: the stored two-state values land on their three-state equivalents.
value = JSON.stringify({ quality: "original", language: "en", autoSkip: "on" });
assert.strictEqual(prefs.load(storage).autoSkipIntro, "automatically", "Legacy Auto skip on turns intro auto skip on");
assert.strictEqual(prefs.load(storage).autoSkipCredits, "automatically", "Legacy Auto skip on turns credits auto skip on");
value = JSON.stringify({ quality: "original", language: "en", autoSkip: "off" });
assert.strictEqual(prefs.load(storage).autoSkipIntro, "manually", "Legacy Auto skip off keeps both rows manual");
assert.strictEqual(prefs.load(storage).autoSkipCredits, "manually");
// Explicit new rows win over the legacy key; the legacy key stays accepted (read-only) so a
// downgrade to an older build keeps working unchanged.
value = JSON.stringify({ quality: "original", language: "en", autoSkip: "on", autoSkipIntro: "off", autoSkipCredits: "on" });
assert.strictEqual(prefs.load(storage).autoSkipIntro, "manually", "The stored intro row outranks the legacy key");
assert.strictEqual(prefs.load(storage).autoSkipCredits, "automatically");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkip: "on" });
assert.strictEqual(prefs.load(storage).autoSkip, "on", "The legacy key keeps being accepted for downgrade compatibility");
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", autoSkip: "always" }); }, /invalid/,
    "The legacy key still validates");
// UIF-P1: Up Next countdown presets, default 15 s (TV-UIFLOWS §4).
assert.strictEqual(prefs.load({ getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }).upNextCountdown,
    "15", "Up Next countdown defaults to 15 seconds");
["immediate", "5", "10", "15", "30", "60"].forEach(function (preset) {
    prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", upNextCountdown: preset });
    assert.strictEqual(prefs.load(storage).upNextCountdown, preset, "Up Next countdown preset " + preset + " survives a restart");
});
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", upNextCountdown: "20" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", upNextCountdown: 15 }); }, /invalid/);
assert.deepStrictEqual(prefs.upNextCountdowns, ["immediate", "5", "10", "15", "30", "60"], "Settings offers exactly the supported countdown presets");
assert.deepStrictEqual(prefs.sectionLayouts, ["grid", "list", "summary"],
    "Settings offers exactly the supported browse layouts");
assert.deepStrictEqual(prefs.subtitleBurnInModes, ["off", "on"],
    "Settings offers exactly the supported subtitle burn-in modes");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off",
    sectionViews: { "1": "list", "7": "summary" } });
assert.deepStrictEqual(prefs.load(storage).sectionViews, { "1": "list", "7": "summary" },
    "Each library keeps the browse layout its viewer chose");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", subtitleBurnIn: "off" });
assert.strictEqual(prefs.load(storage).subtitleBurnIn, "off", "Subtitle burn-in is a saved opt-out choice");
[1, "list", ["list"], { "1": "columns" }, null].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", sectionViews: invalid });
    }, /invalid/, "A damaged per-library layout map is rejected: " + JSON.stringify(invalid));
});
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", subtitleBurnIn: "always" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", subtitleBurnIn: true }); }, /invalid/);
prefs.reset(storage);
assert.strictEqual(value, null);
prefs.save(storage, { quality: "original", language: "ro", nextEpisode: "off" });
assert.strictEqual(prefs.load(storage).language, "ro", "Romanian menu language survives a restart");
// Theme music ships switched on; the choice round-trips and bad values are rejected.
prefs.reset(storage);
assert.strictEqual(prefs.load(storage).themeMusic, "on", "Theme music defaults to on");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", themeMusic: "off" });
assert.strictEqual(prefs.load(storage).themeMusic, "off", "Theme music off survives a restart");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", themeMusic: "on" });
assert.strictEqual(prefs.load(storage).themeMusic, "on");
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", themeMusic: "sometimes" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", themeMusic: true }); }, /invalid/);
assert.strictEqual(prefs.load(storage).screenSaver, "on", "Screen saver defaults to on (owner request 2026-11-06)");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", screenSaver: "off" });
assert.strictEqual(prefs.load(storage).screenSaver, "off", "Screen saver off survives a restart");
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", screenSaver: "on" });
assert.strictEqual(prefs.load(storage).screenSaver, "on");
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", screenSaver: "sometimes" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", screenSaver: false }); }, /invalid/);
console.log("Tizen preference persistence/allowlist/reset tests: passed");
