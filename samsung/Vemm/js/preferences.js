(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPreferences = api; }
}(this, function () {
    "use strict";
    var key = "vemm-tizen-preferences";
    var skipIntervals = [5, 10, 15, 30, 60];
    // The LG client's ladders (rust-modules/plex/src/plex/session.rs): quality rungs with its
    // bitrate ceilings, Direct Play Auto/Force/Off, Next episode Countdown/After credits/Off,
    // subtitle sizes up to extra large and its grey tones (plus the yellow earlier builds saved).
    var qualities = ["original", "1080h", "1080", "720", "720l", "480"];
    var directPlayModes = ["auto", "force", "off"];
    var nextEpisodeModes = ["countdown", "after_credits", "off"];
    var subtitleSizes = ["small", "medium", "large", "extra_large"];
    var subtitlePositions = ["low", "middle", "high"];
    var subtitleColors = ["white", "grey_85", "grey_70", "grey_55", "grey_40", "grey_28", "yellow"];
    // Off is the LG look (outlined text); On adds a dark box behind the line.
    var subtitleBackgrounds = ["off", "on"];
    // Auto skip is opt-in per marker kind (UIF-P1, TV-UIFLOWS §3): the client only jumps past
    // a marker type the viewer asked it to jump past. The single legacy autoSkip row split
    // into intro and credits rows; the old key stays accepted read-only for downgrades.
    // UIFLOW3 A5: each row is three-state — "disabled" hides the marker pill entirely,
    // "manually" shows the pill without jumping (the old "off"), "automatically" jumps
    // (the old "on"). Stored two-state values migrate on load.
    var autoSkipModes = ["disabled", "manually", "automatically"];
    // Up Next countdown length (TV-UIFLOWS §4): LG presets plus an immediate start.
    // UIFLOW3 A6 adds the official one-minute preset.
    var upNextCountdowns = ["immediate", "5", "10", "15", "30", "60"];
    // UIFLOW3 A2: play up to N cinema trailers before a movie started from the beginning.
    var cinemaTrailerCounts = ["off", "1", "2"];
    // UIFLOW3 A3: hours of remote inactivity before Up Next auto-play asks "Still watching?".
    var passOutModes = ["never", "1", "2", "3"];
    // UIFLOW3 A4: seconds rewound when playback starts from a saved resume position.
    var rewindOnResumeModes = ["none", "5", "10", "15", "30"];
    // Browse layouts, remembered per library the way the LG client remembers its browse mode.
    var sectionLayouts = ["grid", "list", "summary"];
    // Burn-in stays on by default: an embedded subtitle track is handed to the server to burn.
    // Off keeps the original picture and leaves only the app-rendered text overlay.
    var subtitleBurnInModes = ["off", "on"];
    // Appearance is opt-in and stored per app, not per library: high contrast replaces the
    // greyscale palette and the text scale steps raise the UI type sizes.
    var highContrastModes = ["off", "on"];
    var textScales = ["normal", "large", "xlarge"];
    // Theme music plays by default on show pages (owner request 2026-11-06: default on).
    var themeMusicModes = ["off", "on"];
    // Screen saver burns in protection on by default (owner request 2026-11-06: default on).
    var screenSaverModes = ["off", "on"];
    // UIFLOW3 B1: the topbar clock and the player's "Ends HH:MM" readout are both opt-in,
    // and one shared choice decides whether they print 24-hour or 12-hour times.
    var clockDisplayModes = ["off", "on"];
    var clockFormats = ["24h", "12h"];
    // UIFLOW3 B2: which watched checkmarks cards may show.
    var watchedIndicatorModes = ["all", "movies", "tv", "none"];
    // UIFLOW3 B3: zero out CSS transitions and animations for viewers who ask for less motion.
    var reduceMotionModes = ["off", "on"];
    // UIFLOW3 B4: how many items the Continue Watching row shows; the fetch may ask for more.
    var continueWatchingSizes = [6, 12, 20];
    function isSectionViews(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) { return false; }
        return Object.keys(value).every(function (libraryKey) {
            return sectionLayouts.indexOf(value[libraryKey]) !== -1;
        });
    }
    // UIFLOW3 B5: the last selected browse pill per library. Values are pill id strings;
    // ids a future build adds must survive a save/load round-trip untouched, so the
    // validator only requires a non-empty string and main.js falls back for unknown ids.
    function isSectionPills(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) { return false; }
        return Object.keys(value).every(function (libraryKey) {
            return typeof value[libraryKey] === "string" && value[libraryKey] !== "";
        });
    }
    var subtitleDelayMinMs = -60000;
    var subtitleDelayMaxMs = 60000;
    // UIFLOW3 A5: a stored two-state skip value maps onto the new three-state rows: the old
    // "off" showed the pill without jumping ("manually"), "on" jumped ("automatically").
    function skipMode(value) {
        if (value === "off") { return "manually"; }
        if (value === "on") { return "automatically"; }
        return value;
    }
    // The legacy combined autoSkip key predates the split, so it may still hold either the
    // old two-state values or values a newer build wrote; accept both vocabularies.
    function isLegacySkipMode(value) {
        return value === "off" || value === "on" || autoSkipModes.indexOf(value) !== -1;
    }
    function validate(value) {
        var skipInterval = value && value.skipInterval !== undefined ? value.skipInterval : 10;
        var subtitleSize = value && value.subtitleSize !== undefined ? value.subtitleSize : "medium";
        var subtitlePosition = value && value.subtitlePosition !== undefined ? value.subtitlePosition : "low";
        var subtitleColor = value && value.subtitleColor !== undefined ? value.subtitleColor : "white";
        var subtitleBackground = value && value.subtitleBackground !== undefined ? value.subtitleBackground : "off";
        var subtitleDelayMs = value && value.subtitleDelayMs !== undefined ? value.subtitleDelayMs : 0;
        var directPlay = value && value.directPlay !== undefined ? value.directPlay : "auto";
        // Builds before the split stored one combined Auto skip row. It migrates: a stored
        // value turns both new rows on or off, while any explicit new row outranks it.
        // UIFLOW3 A5: the same migration also maps the old two-state values onto the new
        // three-state rows; a fresh install lands on "manually" (pill shown, no auto-jump).
        var autoSkipLegacy = value && value.autoSkip !== undefined ? value.autoSkip : undefined;
        var autoSkipDefault = skipMode(autoSkipLegacy !== undefined ? autoSkipLegacy : "manually");
        var autoSkipIntro = skipMode(value && value.autoSkipIntro !== undefined ?
            value.autoSkipIntro : autoSkipDefault);
        var autoSkipCredits = skipMode(value && value.autoSkipCredits !== undefined ?
            value.autoSkipCredits : autoSkipDefault);
        var upNextCountdown = value && value.upNextCountdown !== undefined ? value.upNextCountdown : "15";
        // UIFLOW3 A2/A3/A4: cinema trailers, pass-out protection and rewind on resume.
        var cinemaTrailers = value && value.cinemaTrailers !== undefined ? value.cinemaTrailers : "off";
        var passOutProtection = value && value.passOutProtection !== undefined ? value.passOutProtection : "2";
        var rewindOnResume = value && value.rewindOnResume !== undefined ? value.rewindOnResume : "none";
        var subtitleBurnIn = value && value.subtitleBurnIn !== undefined ? value.subtitleBurnIn : "on";
        var highContrast = value && value.highContrast !== undefined ? value.highContrast : "off";
        var textScale = value && value.textScale !== undefined ? value.textScale : "normal";
        var themeMusic = value && value.themeMusic !== undefined ? value.themeMusic : "on";
        var screenSaver = value && value.screenSaver !== undefined ? value.screenSaver : "on";
        var sectionViews = value && value.sectionViews !== undefined ? value.sectionViews : {};
        var enhancedGraphics = value && value.enhancedGraphics !== undefined ? value.enhancedGraphics : false;
        // UIFLOW3 B1–B5: new display and navigation rows. Defaults match a fresh install;
        // main.js applies them through normalizePreferences(), and validate() only echoes
        // a key back when the stored value carried one, so older builds' exact shapes
        // (and the preferences contract tests that pin them) keep loading unchanged.
        var showClock = value && value.showClock !== undefined ? value.showClock : "off";
        var showEndTime = value && value.showEndTime !== undefined ? value.showEndTime : "off";
        var clockFormat = value && value.clockFormat !== undefined ? value.clockFormat : "24h";
        var watchedIndicators = value && value.watchedIndicators !== undefined ?
            value.watchedIndicators : "all";
        var reduceMotion = value && value.reduceMotion !== undefined ? value.reduceMotion : "off";
        var continueWatchingSize = value && value.continueWatchingSize !== undefined ?
            value.continueWatchingSize : 12;
        var sectionPills = value && value.sectionPills !== undefined ? value.sectionPills : {};
        // Builds before the Next episode choice saved only an on/off auto-play flag.
        var nextEpisode = value && value.nextEpisode !== undefined ? value.nextEpisode :
            (value && value.autoNext === false ? "off" : "countdown");
        if (!value || qualities.indexOf(value.quality) === -1 ||
                ["en", "es", "be", "ro"].indexOf(value.language) === -1 ||
                (value.autoNext !== undefined && typeof value.autoNext !== "boolean") ||
                nextEpisodeModes.indexOf(nextEpisode) === -1 ||
                (value.continueAction !== undefined && ["details", "play"].indexOf(value.continueAction) === -1) ||
                skipIntervals.indexOf(skipInterval) === -1 || subtitleSizes.indexOf(subtitleSize) === -1 ||
                subtitlePositions.indexOf(subtitlePosition) === -1 || subtitleColors.indexOf(subtitleColor) === -1 ||
                subtitleBackgrounds.indexOf(subtitleBackground) === -1 ||
                typeof subtitleDelayMs !== "number" || !isFinite(subtitleDelayMs) ||
                Math.floor(subtitleDelayMs) !== subtitleDelayMs || subtitleDelayMs % 100 !== 0 ||
                subtitleDelayMs < subtitleDelayMinMs || subtitleDelayMs > subtitleDelayMaxMs ||
                directPlayModes.indexOf(directPlay) === -1 ||
                autoSkipModes.indexOf(autoSkipIntro) === -1 || autoSkipModes.indexOf(autoSkipCredits) === -1 ||
                (autoSkipLegacy !== undefined && !isLegacySkipMode(autoSkipLegacy)) ||
                upNextCountdowns.indexOf(upNextCountdown) === -1 ||
                cinemaTrailerCounts.indexOf(cinemaTrailers) === -1 ||
                passOutModes.indexOf(passOutProtection) === -1 ||
                rewindOnResumeModes.indexOf(rewindOnResume) === -1 ||
                subtitleBurnInModes.indexOf(subtitleBurnIn) === -1 ||
                highContrastModes.indexOf(highContrast) === -1 || textScales.indexOf(textScale) === -1 ||
                themeMusicModes.indexOf(themeMusic) === -1 ||
                screenSaverModes.indexOf(screenSaver) === -1 ||
                !isSectionViews(sectionViews) ||
                clockDisplayModes.indexOf(showClock) === -1 ||
                clockDisplayModes.indexOf(showEndTime) === -1 ||
                clockFormats.indexOf(clockFormat) === -1 ||
                watchedIndicatorModes.indexOf(watchedIndicators) === -1 ||
                reduceMotionModes.indexOf(reduceMotion) === -1 ||
                continueWatchingSizes.indexOf(continueWatchingSize) === -1 ||
                !isSectionPills(sectionPills) ||
                typeof enhancedGraphics !== "boolean") {
            throw new Error("Saved preferences are invalid. Reset app preferences in Settings.");
        }
        // Per-library layouts are copied so a saved object cannot be mutated through the app.
        var savedViews = {};
        Object.keys(sectionViews).forEach(function (libraryKey) { savedViews[libraryKey] = sectionViews[libraryKey]; });
        // UIFLOW3 B5: same copy rule for the remembered browse pills.
        var savedPills = {};
        Object.keys(sectionPills).forEach(function (libraryKey) { savedPills[libraryKey] = sectionPills[libraryKey]; });
        // Preferences saved before continueAction existed load with the safe default.
        var result = { quality: value.quality, language: value.language, nextEpisode: nextEpisode,
            continueAction: value.continueAction || "details", skipInterval: skipInterval,
            subtitleSize: subtitleSize, subtitlePosition: subtitlePosition, subtitleColor: subtitleColor,
            subtitleBackground: subtitleBackground, subtitleDelayMs: subtitleDelayMs, directPlay: directPlay,
            autoSkipIntro: autoSkipIntro, autoSkipCredits: autoSkipCredits,
            upNextCountdown: upNextCountdown,
            cinemaTrailers: cinemaTrailers, passOutProtection: passOutProtection,
            rewindOnResume: rewindOnResume,
            subtitleBurnIn: subtitleBurnIn, sectionViews: savedViews,
            highContrast: highContrast, textScale: textScale, enhancedGraphics: enhancedGraphics,
            themeMusic: themeMusic, screenSaver: screenSaver };
        // UIFLOW3 B1–B5: only keys the stored value carried round-trip, so a save from an
        // older build (or a fresh-install load) keeps the exact pre-Run-B shape.
        if (value && value.showClock !== undefined) { result.showClock = showClock; }
        if (value && value.showEndTime !== undefined) { result.showEndTime = showEndTime; }
        if (value && value.clockFormat !== undefined) { result.clockFormat = clockFormat; }
        if (value && value.watchedIndicators !== undefined) { result.watchedIndicators = watchedIndicators; }
        if (value && value.reduceMotion !== undefined) { result.reduceMotion = reduceMotion; }
        if (value && value.continueWatchingSize !== undefined) { result.continueWatchingSize = continueWatchingSize; }
        if (value && value.sectionPills !== undefined) { result.sectionPills = savedPills; }
        // A stored legacy row keeps round-tripping untouched so an older build still reads it;
        // new writes carry only the two per-marker rows.
        if (autoSkipLegacy !== undefined) { result.autoSkip = autoSkipLegacy; }
        return result;
    }
    return {
        load: function (storage) {
            var value = storage.getItem(key);
            if (!value) { return validate({ quality: "original", language: "en", nextEpisode: "countdown" }); }
            try { return validate(JSON.parse(value)); }
            catch (error) { throw new Error("Saved preferences are invalid. Reset app preferences in Settings."); }
        },
        save: function (storage, value) { storage.setItem(key, JSON.stringify(validate(value))); },
        reset: function (storage) { storage.removeItem(key); },
        qualities: qualities.slice(), directPlayModes: directPlayModes.slice(),
        nextEpisodeModes: nextEpisodeModes.slice(), subtitleSizes: subtitleSizes.slice(),
        subtitleColors: subtitleColors.slice(), subtitleBackgrounds: subtitleBackgrounds.slice(),
        autoSkipModes: autoSkipModes.slice(), upNextCountdowns: upNextCountdowns.slice(),
        cinemaTrailerCounts: cinemaTrailerCounts.slice(), passOutModes: passOutModes.slice(),
        rewindOnResumeModes: rewindOnResumeModes.slice(),
        sectionLayouts: sectionLayouts.slice(),
        subtitleBurnInModes: subtitleBurnInModes.slice(),
        highContrastModes: highContrastModes.slice(), textScales: textScales.slice(),
        themeMusicModes: themeMusicModes.slice(),
        screenSaverModes: screenSaverModes.slice(),
        clockDisplayModes: clockDisplayModes.slice(), clockFormats: clockFormats.slice(),
        watchedIndicatorModes: watchedIndicatorModes.slice(),
        reduceMotionModes: reduceMotionModes.slice(),
        continueWatchingSizes: continueWatchingSizes.slice()
    };
}));
