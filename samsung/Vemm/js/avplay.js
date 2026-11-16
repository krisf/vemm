(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmAvplay = api; }
}(this, function () {
    "use strict";

    function create(options) {
        options = options || {};
        var avplay = options.avplay;
        var emit = options.onEvent || function () {};
        var generation = 0;
        var state = "idle";
        var position = 0;
        var duration = 0;
        var pending = null;
        var pendingSeek = null;
        var seekWaiters = [];
        var seekLatest = null;
        var timer = null;

        function notify(type, detail) { emit({ type: type, state: state, position: position, duration: duration, detail: detail }); }
        function transition(next) { state = next; notify("state"); }
        function error(operation) {
            var failure = new Error("Samsung playback failed during " + operation + ". Stop and retry this title.");
            failure.code = "avplay-" + operation;
            return failure;
        }
        function requireState(allowed, operation) {
            if (!avplay) { throw new Error("Samsung AVPlay is not available in this runtime."); }
            if (allowed.indexOf(state) === -1) { throw new Error("Cannot " + operation + " while playback is " + state + "."); }
        }
        function cancelPending() {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            if (pending) { var reject = pending; pending = null; reject(new Error("Playback preparation was cancelled.")); }
        }
        function close() {
            generation += 1;
            cancelPending();
            if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
            if (avplay && state !== "idle") {
                try {
                    var nativeState = avplay.getState();
                    if (nativeState === "PLAYING" || nativeState === "PAUSED") { avplay.stop(); }
                    avplay.close();
                } catch (failure) {
                    transition("error");
                    throw error("close");
                }
            }
            position = 0;
            duration = 0;
            transition("idle");
        }
        function open(url, offset, paused) {
            if (!avplay) { return Promise.reject(new Error("Samsung AVPlay is unavailable. Use an authorized Samsung TV runtime.")); }
            close();
            if (!/^https?:\/\//.test(url) || /[\r\n]/.test(url)) {
                return Promise.reject(new Error("The playback URL is invalid."));
            }
            var ownGeneration = generation;
            transition("preparing");
            return new Promise(function (resolve, reject) {
                pending = reject;
                function failed(operation) {
                    if (ownGeneration !== generation || !pending) { return; }
                    clearTimeout(timer);
                    timer = null;
                    pending = null;
                    generation += 1;
                    transition("error");
                    reject(error(operation));
                }
                try {
                    avplay.open(url);
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                    avplay.setListener({
                        onbufferingstart: function () {
                            if (ownGeneration === generation) { notify("buffering", true); }
                        },
                        onbufferingprogress: function (percent) {
                            if (ownGeneration === generation) { notify("buffer-progress", percent); }
                        },
                        onbufferingcomplete: function () {
                            if (ownGeneration === generation) { notify("buffering", false); }
                        },
                        oncurrentplaytime: function (time) {
                            if (ownGeneration === generation && typeof time === "number" && isFinite(time)) {
                                position = Math.max(0, Math.round(time));
                                notify("time");
                            }
                        },
                        onsubtitlechange: function (length, text) {
                            if (ownGeneration === generation) { notify("subtitle", { text: String(text || ""), duration: length }); }
                        },
                        onstreamcompleted: function () {
                            if (ownGeneration === generation) {
                                generation += 1;
                                cancelPending();
                                if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
                                position = Math.max(position, duration);
                                transition("ended");
                                notify("ended");
                            }
                        },
                        onerror: function () {
                            if (ownGeneration !== generation) { return; }
                            if (pending) { failed("prepare"); }
                            else {
                                generation += 1;
                                if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
                                transition("error"); notify("error", error("stream").message);
                            }
                        }
                    });
                    timer = setTimeout(function () { failed("prepare-timeout"); }, options.prepareTimeout || 25000);
                    avplay.prepareAsync(function () {
                        if (ownGeneration !== generation || !pending) { return; }
                        try {
                            duration = Math.max(0, Number(avplay.getDuration()) || 0);
                            transition("ready");
                            var resumeWait = options.resumeSeekTimeout || 8000;
                            function play(resumed) {
                                if (ownGeneration !== generation || !pending) { return; }
                                try {
                                    avplay.play();
                                    if (paused) { avplay.pause(); }
                                    position = Math.max(0, Math.round(Number(avplay.getCurrentTime()) || 0));
                                    clearTimeout(timer);
                                    timer = null;
                                    pending = null;
                                    transition(paused ? "paused" : "playing");
                                    resolve();
                                } catch (failure) { failed("play"); return; }
                                if (!resumed) { seekWhilePlaying(); }
                            }
                            // A READY-state seek is unreliable for HLS on Tizen: on a UE55MU6172 it never
                            // called back. Retry the resume from PLAYING, which Samsung documents as safe.
                            function seekWhilePlaying() {
                                var done = false;
                                function lost() {
                                    if (done || ownGeneration !== generation) { return; }
                                    done = true;
                                    notify("resume-failed", offset);
                                }
                                var guard = setTimeout(lost, resumeWait);
                                try {
                                    avplay.seekTo(offset, function () {
                                        if (done || ownGeneration !== generation) { return; }
                                        done = true;
                                        clearTimeout(guard);
                                        position = offset;
                                        notify("time");
                                    }, function () { clearTimeout(guard); lost(); });
                                } catch (failure) { clearTimeout(guard); lost(); }
                            }
                            if (offset > 0) {
                                var readySettled = false;
                                var readyGuard = setTimeout(function () {
                                    if (readySettled) { return; }
                                    readySettled = true;
                                    play(false);
                                }, resumeWait);
                                var settleReady = function (resumed) {
                                    if (readySettled) { return; }
                                    readySettled = true;
                                    clearTimeout(readyGuard);
                                    play(resumed);
                                };
                                try {
                                    avplay.seekTo(offset, function () { settleReady(true); }, function () { settleReady(false); });
                                } catch (failure) { settleReady(false); }
                            } else { play(true); }
                        } catch (failure) { failed("prepare"); }
                    }, function () { failed("prepare"); });
                } catch (failure) { failed("open"); }
            });
        }
        // Rapid skipping coalesces into one seek chain: the newest target wins and
        // every caller in the burst settles with the final outcome. A second skip no
        // longer rejects ("A seek is already in progress"), which used to surface as
        // the Playback-problem panel when the user skipped around a lot.
        function runSeekChain() {
            var ownGeneration = generation;
            var target = seekLatest;
            var settled = false;
            var timeout = setTimeout(function () { settle(error("seek-timeout")); }, options.seekTimeout || 10000);
            function settle(failure, landed) {
                if (settled) { return; }
                settled = true;
                clearTimeout(timeout);
                pendingSeek = null;
                var waiters = seekWaiters; seekWaiters = []; seekLatest = null;
                for (var i = 0; i < waiters.length; i += 1) {
                    if (failure) { waiters[i].reject(failure); } else { waiters[i].resolve(landed); }
                }
            }
            pendingSeek = function (failure) { settle(failure || new Error("Seek cancelled.")); };
            try {
                avplay.seekTo(target, function () {
                    if (settled) { return; }
                    if (ownGeneration !== generation) { settle(new Error("Seek cancelled.")); return; }
                    // A newer skip arrived while this native seek was in flight: hand off
                    // to another chain link aimed at the newest target (waiters carry over).
                    if (seekLatest !== null && seekLatest !== target) {
                        clearTimeout(timeout);
                        settled = true;
                        pendingSeek = null;
                        runSeekChain();
                        return;
                    }
                    try {
                        position = Math.max(0, Math.round(Number(avplay.getCurrentTime()) || 0));
                        settle(null, position);
                        notify("time");
                    } catch (failure) { settle(error("seek")); }
                }, function () { settle(error("seek")); });
            } catch (failure) { settle(error("seek")); }
        }

        function seek(target) {
            try { requireState(["playing", "paused", "ready"], "seek"); }
            catch (failure) { return Promise.reject(failure); }
            if (typeof target !== "number" || !isFinite(target)) { return Promise.reject(new Error("Invalid seek position.")); }
            target = Math.max(0, Math.min(duration || target, Math.round(target)));
            return new Promise(function (resolve, reject) {
                seekWaiters.push({ resolve: resolve, reject: reject });
                seekLatest = target;
                if (pendingSeek) { return; }
                runSeekChain();
            });
        }
        return {
            open: open, close: close, seek: seek,
            // Best-effort output level (0-100); used to keep theme music under the UI.
            setVolume: function (level) {
                if (!avplay) { return; }
                try { avplay.setVolume(Math.max(0, Math.min(100, level))); } catch (failure) { /* best effort */ }
            },
            snapshot: function () { return { state: state, position: position, duration: duration }; },
            pause: function () {
                requireState(["playing"], "pause");
                try { avplay.pause(); transition("paused"); } catch (failure) { throw error("pause"); }
            },
            play: function () {
                requireState(["paused", "ready"], "play");
                try { avplay.play(); transition("playing"); } catch (failure) { throw error("play"); }
            },
            tracks: function () {
                requireState(["ready", "playing", "paused"], "list tracks");
                try { return avplay.getTotalTrackInfo(); } catch (failure) { throw error("tracks"); }
            },
            selectTrack: function (type, index) {
                requireState(["playing", "paused"], "change track");
                if (["AUDIO", "TEXT"].indexOf(type) === -1 || typeof index !== "number" || index < 0) {
                    throw new Error("Invalid playback track.");
                }
                var resume = state === "playing";
                try {
                    if (resume) { avplay.pause(); }
                    avplay.setSelectTrack(type, index);
                    if (resume) { avplay.play(); }
                } catch (failure) {
                    if (resume && avplay.getState() === "PAUSED") {
                        try { avplay.play(); } catch (resumeFailure) { transition("error"); }
                    }
                    throw error("track-selection");
                }
            },
            subtitles: function (enabled) {
                requireState(["playing", "paused"], "change subtitles");
                try { avplay.setSilentSubtitle(!enabled); } catch (failure) { throw error("subtitles"); }
            },
            suspend: function () {
                requireState(["playing", "paused"], "suspend");
                try { avplay.suspend(); transition("suspended"); } catch (failure) { throw error("suspend"); }
            },
            restore: function () {
                requireState(["suspended"], "restore");
                try { avplay.restore(); transition("paused"); } catch (failure) { throw error("restore"); }
            }
        };
    }
    return { create: create };
}));
