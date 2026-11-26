const {test} = require("node:test");
const assert = require("node:assert/strict");
const {buildSync} = require("esbuild");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = buildSync({
    entryPoints: [path.join(root, "packages/score-engine/src/index.ts")],
    bundle: true, platform: "node", format: "cjs", external: ["opensheetmusicdisplay"], write: false,
}).outputFiles[0].text;
const moduleObject = {exports: {}};
new Function("require", "module", "exports", output)(require, moduleObject, moduleObject.exports);
const engine = moduleObject.exports;

test("Obsidian sheet and LickGo saved model produce identical MusicXML", () => {
    const lick = {key: "Eb", time: "4/4", grid: 8, chords: "| Fh7 Bb7 | EbM7 |",
        melody: "| Ab3 Bb3 Eb4 Gb4 | Gb4-Bb4 Ab4 |", melodyRhythm: "| 8 12 *3 | 2 2 |",
        voicing: "| C3-Eb3 | Bb2-D3 |", voicingRhythm: "| 1 | 1 |"};
    const source = engine.parseSheet("key: Eb\ntime: 4/4\n" +
        "chords\n---\n" + lick.chords + "\nmelody\n---\n" + lick.melody +
        "\nmelody_rhythm\n---\n" + lick.melodyRhythm +
        "\nvoicing\n---\n" + lick.voicing + "\nvoicing_rhythm\n---\n" + lick.voicingRhythm);
    assert.equal(engine.toMusicXml(source), engine.lickToMusicXml(lick));
    assert.equal(engine.lickToMusicXml(lick), engine.lickToMusicXml({
        ...lick, melody: undefined, melodyRhythm: undefined, voicing: undefined, voicingRhythm: undefined,
        rh: lick.melody, rh_r: lick.melodyRhythm, lh: lick.voicing, lh_r: lick.voicingRhythm,
    }));
});

test("newline bar boundaries collapse while explicit empty bars remain", () => {
    assert.deepEqual(engine.splitBars("| C |\r\n  | D |"), ["C", "D"]);
    assert.deepEqual(engine.splitBars("| C || D |"), ["C", "", "D"]);
});

test("all supported meters and tempo remain available", () => {
    for (const time of ["3/4","4/4","6/8","5/4","7/4","9/4","7/8","9/8"]) {
        const source = engine.parseSheet("Tempo: 96 Time: " + time + "\nmelody\n---\n| C4 |");
        const xml = engine.toMusicXml(source);
        assert.ok(xml.includes("<per-minute>96</per-minute>"));
        assert.ok(xml.includes("<beats>" + time.split("/")[0] + "</beats>"));
    }
});

test("ties, written accidentals and invalid ties survive extraction", () => {
    const xml = engine.lickToMusicXml({chords: "| C7 |", melody: "| G#4 G#4 |", melodyRhythm: "| 2~ 2 |"});
    assert.ok(xml.includes('<tie type="start"/>'));
    assert.ok(xml.includes('<tie type="stop"/>'));
    assert.ok(xml.includes("<step>G</step><alter>1</alter>"));
    assert.throws(() => engine.lickToMusicXml({melody: "| C4 D4 |", melodyRhythm: "| 2~ 2 |"}), /붙임줄/);
});

test("quarter and eighth triplets export exact MusicXML durations", () => {
    for (const [rhythm, type, ticks, count] of [[6, "quarter", 6720, 6], [12, "eighth", 3360, 12]]) {
        const xml = engine.lickToMusicXml({
            melody: "| " + Array(count).fill("C4").join(" ") + " |",
            melodyRhythm: "| " + rhythm + " *" + count + " |",
        });
        assert.equal((xml.match(new RegExp("<duration>" + ticks + "</duration>", "g")) || []).length, count);
        assert.equal((xml.match(new RegExp("<type>" + type + "</type>", "g")) || []).length, count);
        assert.equal((xml.match(/<actual-notes>3<\/actual-notes>/g) || []).length, count);
        assert.equal((xml.match(/<tuplet type="start"/g) || []).length, count / 3);
    }
});

test("swing keeps tuplet beats straight and preserves regular eighth swing elsewhere", () => {
    const output = buildSync({
        entryPoints: [path.join(root, "src/player.ts")],
        bundle: true, platform: "node", format: "cjs", write: false,
    }).outputFiles[0].text;
    const moduleObject = {exports: {}};
    new Function("module", "exports", output)(moduleObject, moduleObject.exports);
    const notes = [
        {midi: 60, beat: 0, length: 1 / 3},
        {midi: 62, beat: 2 / 3, length: 1 / 3},
        {midi: 48, beat: 0.5, length: 0.5},
        {midi: 64, beat: 1, length: 0.5},
        {midi: 65, beat: 1.5, length: 0.5},
    ];
    const swung = moduleObject.exports.swingNotes(notes, [0]);
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(swung[i].beat - notes[i].beat) < 1e-9);
        assert.ok(Math.abs(swung[i].length - notes[i].length) < 1e-9);
    }
    assert.ok(Math.abs(swung[3].length - 0.58) < 1e-9);
    assert.ok(Math.abs(swung[4].beat - 1.58) < 1e-9);
    assert.ok(Math.abs(swung[4].length - 0.42) < 1e-9);
    assert.equal(notes[4].beat, 1.5);
});
