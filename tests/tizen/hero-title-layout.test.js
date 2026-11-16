"use strict";
var assert = require("assert");
var fs = require("fs");
var css = fs.readFileSync(require.resolve("../../samsung/Vemm/css/style.css"), "utf8");

// VFIX A1: the TV/vh .home-hero-title override (font-size: 7vh + overflow: hidden)
// clipped descenders (g/y/p/q/j) on the last visible line: line-height 1.05 was
// tighter than the font's natural descent ("Skyking glypjq" measured scrollHeight
// ~5px over clientHeight on the emulator). The line box must leave descender room
// while the max-height keeps the ~2-line cap and the Play / More Info row in fold.
// The base rule uses px sizing and the later grouped rule only sets color/weight;
// neither is the TV override under test.
function heroTitleBodies() {
    var bodies = [];
    var pattern = /(?:^|[},])\s*\.home-hero-title\s*\{([^}]*)\}/gm;
    var match;
    while ((match = pattern.exec(css)) !== null) {
        bodies.push(match[1]);
    }
    return bodies;
}

var allBodies = heroTitleBodies();
var tvRules = allBodies.filter(function (body) {
    return /font-size:\s*7vh/.test(body) && /overflow:\s*hidden/.test(body);
});

try {
    assert.strictEqual(tvRules.length, 1,
        "Expected exactly one TV .home-hero-title rule (font-size: 7vh + overflow: hidden)");
    var rule = tvRules[0];

    var lineHeight = /line-height:\s*([0-9]+(?:\.[0-9]+)?)/.exec(rule);
    assert(lineHeight, "The TV hero title must declare a numeric line-height");
    assert(parseFloat(lineHeight[1]) >= 1.18,
        "line-height must be >= 1.18 so descenders fit inside the line box (no vertical clipping)");

    assert(/overflow:\s*hidden/.test(rule),
        "The TV hero title must keep overflow: hidden so long titles stay capped");

    var maxHeight = /max-height:\s*([0-9]+(?:\.[0-9]+)?)(vh|px)/.exec(rule);
    assert(maxHeight, "The TV hero title must declare a plain vh/px max-height (the ~2-line cap)");
    if (maxHeight[2] === "vh") {
        var lines = parseFloat(maxHeight[1]) / (7 * parseFloat(lineHeight[1]));
        assert(lines >= 2 && lines < 3,
            "max-height must fit ~2 lines of 7vh text (no unbounded growth, no 3-line hero)");
    }
} catch (err) {
    console.error("FAIL: Tizen home hero title layout");
    console.error(err.message);
    var offending = tvRules.length === 1 ? tvRules[0] : allBodies.join("\n}\n.home-hero-title {");
    console.error("Offending rule:\n.home-hero-title {" + offending + "\n}");
    process.exit(1);
}

console.log("PASS: Tizen home hero title descenders fit inside the box with a ~2-line vh cap");
