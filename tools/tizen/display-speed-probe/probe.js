(function () {
    "use strict";
    // Account-free display/speed probe. It is not a Plx/Vemm build: no Plex client, no
    // credentials, no network requests of its own, no storage writes. It only reports what the
    // installed webapis.avplay runtime exposes and what the firmware answers to
    // setDisplayMethod / setDisplayArea / setSpeed, so that picture and speed UI can ship on
    // measured evidence instead of an assumption.
    var log = [];
    var STREAM_STATES = ["READY", "PLAYING", "PAUSED", "BUFFERING"];
    var DISPLAY_PREFIX = "AVPLAY_DISPLAY";
    var SPEED_PREFIX = "AVPLAY_SPEED";

    function api() {
        return window.webapis && window.webapis.avplay ? window.webapis.avplay : null;
    }
    function assign(target, extra) {
        Object.keys(extra).forEach(function (key) { target[key] = extra[key]; });
        return target;
    }
    function record(entry) {
        entry.at = new Date().toISOString();
        log.push(entry);
        return entry;
    }
    function safeState() {
        var player = api();
        if (!player || typeof player.getState !== "function") { return null; }
        try { return String(player.getState()); } catch (error) { return "unreadable"; }
    }
    // Constants are read from the installed runtime, never assumed: a firmware that numbers
    // them differently must show up in the record instead of being sent a guessed value.
    function constants(prefix) {
        var player = api();
        var names = [];
        if (!player) { return names; }
        Object.keys(player).forEach(function (key) {
            if (key.indexOf(prefix) === 0 && typeof player[key] !== "function") { names.push(key); }
        });
        return names.sort();
    }
    function constantValue(name) {
        var player = api();
        if (!player) { return undefined; }
        return player[name];
    }
    function hasMethod(name) {
        var player = api();
        return !!player && typeof player[name] === "function";
    }
    function readBack(name) {
        if (!hasMethod(name)) { return "unsupported"; }
        try { return String(api()[name]()); } catch (error) { return "unreadable"; }
    }
    function invoke(name, args) {
        var entry = { api: name, state: safeState() };
        if (!api()) { return assign(entry, { outcome: "no-avplay" }); }
        if (!hasMethod(name)) { return assign(entry, { outcome: "unsupported" }); }
        try {
            entry.result = api()[name].apply(api(), args || []);
            entry.outcome = "accepted";
        } catch (error) {
            entry.outcome = "rejected";
            entry.message = String(error && error.message ? error.message : error);
            entry.code = error && error.code !== undefined ? String(error.code) : null;
        }
        return entry;
    }
    function gateConstant(request, name, prefix) {
        var entry = { request: request, constant: name };
        if (!api()) { return assign(entry, { outcome: "no-avplay" }); }
        if (typeof name !== "string" || name.indexOf(prefix) !== 0) {
            return assign(entry, { outcome: "unknown-constant", available: constants(prefix) });
        }
        if (constantValue(name) === undefined) {
            return assign(entry, { outcome: "unknown-constant", available: constants(prefix) });
        }
        return null;
    }
    function setDisplayMethod(name) {
        var blocked = gateConstant("setDisplayMethod", name, DISPLAY_PREFIX);
        if (blocked) { return record(blocked); }
        if (!hasMethod("setDisplayMethod")) {
            return record({ request: "setDisplayMethod", constant: name, outcome: "unsupported" });
        }
        var value = constantValue(name);
        var before = readBack("getDisplayMethod");
        var call = invoke("setDisplayMethod", [value]);
        return record({ request: "setDisplayMethod", constant: name, value: value,
            state: call.state, before: before, after: readBack("getDisplayMethod"),
            outcome: call.outcome, message: call.message, code: call.code });
    }
    function setDisplayArea(rect) {
        var entry = { request: "setDisplayArea" };
        if (!api()) { return record(assign(entry, { outcome: "no-avplay" })); }
        var values = rect || {};
        var fields = ["x", "y", "width", "height"];
        for (var index = 0; index < fields.length; index += 1) {
            var value = values[fields[index]];
            if (typeof value !== "number" || !isFinite(value) || value < 0 ||
                    Math.floor(value) !== value) {
                return record(assign(entry, { outcome: "invalid-rect", field: fields[index] }));
            }
        }
        if (values.width === 0 || values.height === 0) {
            return record(assign(entry, { outcome: "invalid-rect", field: "width or height" }));
        }
        if (!hasMethod("setDisplayArea")) {
            return record(assign(entry, { outcome: "unsupported" }));
        }
        var call = invoke("setDisplayArea", [values]);
        return record(assign(entry, { rect: values, state: call.state, outcome: call.outcome,
            message: call.message, code: call.code }));
    }
    function setSpeed(name) {
        var blocked = gateConstant("setSpeed", name, SPEED_PREFIX);
        if (blocked) { return record(blocked); }
        if (!hasMethod("setSpeed")) {
            return record({ request: "setSpeed", constant: name, outcome: "unsupported" });
        }
        var state = safeState();
        // Fast-forward and rewind only mean something once a stream is open; calling the
        // method on an idle player would record a meaningless rejection.
        if (state !== null && STREAM_STATES.indexOf(state) === -1) {
            return record({ request: "setSpeed", constant: name, state: state,
                outcome: "requires-stream", allowedStates: STREAM_STATES });
        }
        var value = constantValue(name);
        var before = readBack("getSpeed");
        var call = invoke("setSpeed", [value]);
        return record({ request: "setSpeed", constant: name, value: value, state: call.state,
            before: before, after: readBack("getSpeed"), outcome: call.outcome,
            message: call.message, code: call.code });
    }
    function prepare(url) {
        var entry = { request: "prepare" };
        if (!api()) { return record(assign(entry, { outcome: "no-avplay" })); }
        // A URL the operator typed, with no credentials and no whitespace or line breaks.
        if (typeof url !== "string" || !/^https?:\/\/[^\s@]+$/.test(url)) {
            return record(assign(entry, { outcome: "invalid-url" }));
        }
        if (!hasMethod("open")) { return record(assign(entry, { outcome: "unsupported" })); }
        var opened = invoke("open", [url]);
        if (opened.outcome !== "accepted") {
            return record(assign(entry, { state: opened.state, outcome: opened.outcome,
                message: opened.message }));
        }
        var prepared = hasMethod("prepareAsync") ? invoke("prepareAsync", [{}]) : invoke("prepare", [{}]);
        return record(assign(entry, { state: prepared.state, outcome: prepared.outcome,
            message: prepared.message, via: hasMethod("prepareAsync") ? "prepareAsync" : "prepare" }));
    }
    function play() { return record(assign({ request: "play" }, invoke("play"))); }
    function pause() { return record(assign({ request: "pause" }, invoke("pause"))); }
    function stop() { return record(assign({ request: "stop" }, invoke("stop"))); }
    function identity() {
        var product = window.webapis && window.webapis.productinfo;
        var player = api();
        return { userAgent: navigator.userAgent,
            model: product && typeof product.getModel === "function" ? product.getModel() : null,
            firmware: product && typeof product.getFirmware === "function" ? product.getFirmware() : null,
            avplayVersion: player && typeof player.getVersion === "function" ? player.getVersion() : null };
    }
    function capabilities() {
        var methods = ["setDisplayMethod", "getDisplayMethod", "setDisplayArea", "setSpeed",
            "getSpeed", "setSpeedV2", "setDisplayRect", "open", "prepare", "prepareAsync", "play",
            "pause", "stop", "getState", "getDuration", "getCurrentPosition"];
        var present = [];
        var missing = [];
        methods.forEach(function (name) {
            (hasMethod(name) ? present : missing).push(name);
        });
        var speed = constants(SPEED_PREFIX).map(function (name) {
            return { name: name, value: constantValue(name) };
        }).sort(function (left, right) { return left.value - right.value; });
        return { hasAvplay: !!api(), present: present, missing: missing,
            displayMethods: constants(DISPLAY_PREFIX), speeds: speed, state: safeState() };
    }
    window.displaySpeedProbe = {
        identity: identity,
        capabilities: capabilities,
        state: safeState,
        setDisplayMethod: setDisplayMethod,
        setDisplayArea: setDisplayArea,
        setSpeed: setSpeed,
        prepare: prepare,
        play: play,
        pause: pause,
        stop: stop,
        report: function () { return { identity: identity(), capabilities: capabilities(),
            entries: log.slice() }; },
        reset: function () { log = []; return log.length; }
    };
}());
