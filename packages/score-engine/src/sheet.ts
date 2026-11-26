// Port of LickGo's parser.py, normalize.py and music_theory.py.
export const fields = ["chords", "melody", "melody_rhythm", "voicing", "voicing_rhythm"] as const;
type Field = typeof fields[number];
export type Source = Record<Field, string> & {key: string; time: string; grid: number; tempo?: number; name: string};
export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const rhythms = {
    1: [480, "whole"], 2: [240, "half"], 4: [120, "quarter"], 6: [80, "quarter", 3], 8: [60, "eighth"],
    12: [40, "eighth", 3], 16: [30, "16th"], 20: [24, "16th", 5], 24: [20, "16th", 3],
} as const;
type Rhythm = keyof typeof rhythms;
const values = Object.keys(rhythms).map(Number) as Rhythm[];
const keys = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const steps = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
type Step = keyof typeof steps;
type Pitch = {step: Step; alter: number; octave: number; midi: number};
type Note = {pitches: Pitch[]; start: boolean; stop?: boolean; value: Rhythm};
type Hand = "right" | "left";
type Measure = Record<Hand, Note[]> & {chords: string[]; pickup: boolean};

export function parseSheet(text: string): Source {
    const result: Source = {
        chords: "", melody: "", melody_rhythm: "", voicing: "", voicing_rhythm: "",
        key: "C", time: "4/4", grid: 8, name: "",
    };
    const seen = new Set<Field>();
    let field: Field | undefined;
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
        const label = lines[i].trim();
        if (/^-{3,}$/.test(lines[i + 1]?.trim() ?? "")) {
            if (!(fields as readonly string[]).includes(label)) throw new Error(`알 수 없는 항목: ${label}`);
            field = label as Field;
            if (seen.has(field)) throw new Error(`중복된 항목: ${field}`);
            seen.add(field);
            i++;
        } else if (field) {
            result[field] += lines[i] + "\n";
        } else if (label) {
            const header = /^(?:Tempo|Time|Q|M):/i.test(label);
            if (header) {
                const options = [...label.matchAll(/(Tempo|Time|Q|M):[ \t]*(?:1\/4[ \t]*=[ \t]*)?(\d+(?:\/\d+)?)/gi)];
                const leftover = label.replace(/(Tempo|Time|Q|M):[ \t]*(?:1\/4[ \t]*=[ \t]*)?(\d+(?:\/\d+)?)/gi, "").trim();
                if (!options.length || leftover) throw new Error(`올바르지 않은 Tempo/Time 설정: ${label}`);
                for (const [, option, value] of options) {
                    if (/^(Time|M)$/i.test(option)) result.time = value;
                    else {
                        const tempo = Number(value);
                        if (!Number.isFinite(tempo) || tempo <= 0) throw new Error("Tempo는 양수 BPM이어야 합니다.");
                        result.tempo = tempo;
                    }
                }
                continue;
            }
            const option = /^(key|time|grid|name):\s*(.+)$/.exec(label);
            if (!option) throw new Error(`악보 항목 앞에 올 수 없는 내용: ${label}`);
            const [, key, value] = option;
            if (key === "grid") result.grid = Number(value);
            else result[key as "key" | "time" | "name"] = value;
        }
    }
    for (const field of fields) result[field] = result[field].trim();
    return result;
}

export function splitBars(source: string) {
    let text = source.replace(/\r\n?/g, "\n").trim();
    if (!text) return [];
    while (/\|[^\S\n]*\n\s*\|/.test(text)) {
        text = text.replace(/\|[^\S\n]*\n\s*\|/g, "|");
    }
    const bars = text.split("|").map(bar => bar.trim());
    if (text.startsWith("|")) bars.shift();
    if (text.endsWith("|")) bars.pop();
    return bars;
}

function parsePitch(token: string, previous: number, hand: Hand, fifths: number): Pitch {
    const match = /^([A-Ga-g])(#+|b+|n)?(\d+)?$/.exec(token);
    if (!match) throw new Error(`올바르지 않은 음표: ${token}`);
    const step = match[1].toUpperCase() as Step;
    const [, , accidental, explicitOctave] = match;
    const signatureOrder = fifths > 0 ? "FCGDAEB" : "BEADGCF";
    let alter = 0;
    if (accidental && accidental !== "n") alter = accidental.length * (accidental.startsWith("#") ? 1 : -1);
    if (!accidental && !explicitOctave && signatureOrder.slice(0, Math.abs(fifths)).includes(step)) alter = Math.sign(fifths);
    const base = steps[step] + alter;
    let octave = Number(explicitOctave);
    if (!explicitOctave) {
        const [low, high] = hand === "right" ? [55, 77] : [36, 69];
        let distance = Infinity;
        for (let candidate = 0; candidate <= 9; candidate++) {
            const midi = (candidate + 1) * 12 + base;
            if (midi >= low && midi <= high && Math.abs(midi - previous) < distance) {
                octave = candidate;
                distance = Math.abs(midi - previous);
            }
        }
    }
    if (!Number.isInteger(octave) || octave > 9 || Math.abs(alter) > 2) throw new Error(`지원 범위를 벗어난 음표: ${token}`);
    return {step, alter, octave, midi: (octave + 1) * 12 + base};
}

function duration(notes: Note[]) {
    return notes.reduce((sum, note) => sum + rhythms[note.value][0], 0);
}

function buildHand(source: string, rhythmSource: string, hand: Hand, grid: Rhythm, length: number, pickup: boolean, fifths: number) {
    let previous = hand === "right" ? 72 : 48;
    const notes = words(source).map(token => {
        const start = token.endsWith("~");
        const text = start ? token.slice(0, -1) : token;
        const pitches = text === "!" ? [] : text.split("-").map(part => {
            const pitch = parsePitch(part, previous, hand, fifths);
            previous = pitch.midi;
            return pitch;
        });
        return {pitches, start};
    });
    const label = hand === "right" ? "오른손" : "왼손";
    const tokens = words(rhythmSource);
    const result: Note[] = [];
    let index = 0;
    if (!tokens.length) {
        const capacity = Math.floor(length / rhythms[grid][0]);
        if (notes.length > capacity) throw new Error(`${label} 음표 개수가 마디 용량(${capacity})보다 많습니다.`);
        result.push(...notes.map(note => ({...note, value: grid})));
    }
    for (let i = 0; i < tokens.length; i++) {
        const match = /^(!?)(\d+)(~?)$/.exec(tokens[i]);
        const value = Number(match?.[2]) as Rhythm;
        if (!match || !rhythms[value]) throw new Error(`올바르지 않은 리듬: ${tokens[i]}`);
        const [, rest, , tie] = match;
        let count = 1;
        if (tokens[i + 1]?.startsWith("*")) {
            const repetition = tokens[++i].slice(1);
            count = /^\d+$/.test(repetition) ? Number(repetition) : NaN;
            if (!Number.isSafeInteger(count) || count * rhythms[value][0] > length) throw new Error(`올바르지 않은 반복: *${repetition}`);
        }
        for (let run = 0; run < count; run++) {
            const note = rest ? {pitches: [], start: false} : notes[index++];
            if (!note) throw new Error(`${label} 리듬보다 음표가 부족합니다.`);
            result.push({...note, start: note.start || Boolean(tie), value});
        }
    }
    if (tokens.length && index !== notes.length) throw new Error(`${label} 음표와 리듬 개수가 맞지 않습니다.`);
    if (result.some(note => note.start && !note.pitches.length)) throw new Error("쉼표에는 붙임줄을 시작할 수 없습니다.");
    let remaining = length - duration(result);
    if (remaining < 0) throw new Error("마디 길이를 초과했습니다.");
    if (!tokens.length || !pickup) {
        const order = tokens.length ? values : [grid, ...values];
        const reachable = new Uint8Array(remaining + 1);
        reachable[0] = 1;
        for (let tick = 1; tick <= remaining; tick++) {
            if (values.some(value => reachable[tick - rhythms[value][0]])) reachable[tick] = 1;
        }
        while (remaining > 0) {
            const value = order.find(value => reachable[remaining - rhythms[value][0]]);
            if (!value) throw new Error("남은 마디 길이를 쉼표로 채울 수 없습니다.");
            result.push({pitches: [], start: false, value});
            remaining -= rhythms[value][0];
        }
    }
    return result;
}

function linkTies(measures: Measure[], hand: Hand, firstNumber: number) {
    const notes = measures.flatMap((measure, i) => measure[hand].map(note => ({note, bar: i + firstNumber})));
    notes.forEach(({note, bar}, i) => {
        if (!note.start) return;
        const next = notes[i + 1]?.note;
        if (!next || note.pitches.length !== next.pitches.length ||
            note.pitches.some((pitch, j) => pitch.midi !== next.pitches[j].midi)) {
            throw new Error(`${bar}마디 오류: 붙임줄 다음에는 같은 음표가 와야 합니다.`);
        }
        next.stop = true;
    });
}

const xml = (s: string) => s.replace(/[<>&"']/g, char => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[char]!);

const kinds: Record<string, string> = {
    "": "major", M: "major", maj: "major", m: "minor", "6": "major-sixth", M6: "major-sixth",
    m6: "minor-sixth", "7": "dominant", M7: "major-seventh", maj7: "major-seventh",
    m7: "minor-seventh", mM7: "major-minor", h: "half-diminished", h7: "half-diminished",
    m7b5: "half-diminished", o: "diminished", o7: "diminished-seventh", dim: "diminished",
    dim7: "diminished-seventh", "+": "augmented", aug: "augmented", "+7": "augmented-seventh",
    "9": "dominant-ninth", M9: "major-ninth", m9: "minor-ninth", "11": "dominant-11th",
    M11: "major-11th", m11: "minor-11th", "13": "dominant-13th", M13: "major-13th",
    m13: "minor-13th", sus2: "suspended-second", sus4: "suspended-fourth",
};
function harmony(symbol: string, offset: number) {
    const match = /^([A-Ga-g])([b#]*)(.*?)(?:\/([A-Ga-g])([b#]*))?$/.exec(symbol);
    const offsetXml = offset ? `<offset sound="yes">${offset}</offset>` : "";
    if (!match) return `<direction placement="above"><direction-type><words>${xml(symbol)}</words></direction-type>${offsetXml}</direction>`;
    const [, root, accidental, quality, bass, bassAccidental] = match;
    const suffix = quality.replace(/[(),]/g, "");
    let kind = Object.prototype.hasOwnProperty.call(kinds, suffix) ? kinds[suffix] : undefined;
    let degrees = "";
    if (!kind) {
        const altered = /^(.*?)([b#]\d+(?:[b#]\d+)*)$/.exec(suffix);
        const base = altered?.[1] ?? suffix;
        if (Object.prototype.hasOwnProperty.call(kinds, base)) kind = kinds[base];
        if (altered && kind) {
            for (const [, sign, value] of altered[2].matchAll(/([b#])(\d+)/g)) {
                degrees += `<degree><degree-value>${value}</degree-value><degree-alter>${sign === "#" ? 1 : -1}</degree-alter><degree-type>add</degree-type></degree>`;
            }
        }
    }
    if (!kind) return `<direction placement="above"><direction-type><words>${xml(symbol)}</words></direction-type>${offsetXml}<staff>1</staff></direction>`;
    const alter = (tag: string, sign: string) => sign ? `<${tag}-alter>${sign.length * (sign[0] === "#" ? 1 : -1)}</${tag}-alter>` : "";
    const bassXml = bass ? `<bass><bass-step>${bass.toUpperCase()}</bass-step>${alter("bass", bassAccidental)}</bass>` : "";
    return `<harmony><root><root-step>${root.toUpperCase()}</root-step>${alter("root", accidental)}</root><kind>${kind}</kind>${bassXml}${degrees}${offsetXml}<staff>1</staff></harmony>`;
}

function tupletMarks(events: Note[]) {
    const marks = new Map<number, string>();
    const beams = new Map<number, string>();
    for (let i = 0; i < events.length;) {
        const [, , size] = rhythms[events[i].value];
        if (!size) {
            i++;
            continue;
        }
        let end = i + 1;
        while (end < events.length && end < i + size && events[end].value === events[i].value) end++;
        if (end - i > 1) {
            marks.set(i, '<tuplet type="start" number="1"/>');
            marks.set(end - 1, '<tuplet type="stop" number="1"/>');
            const type = rhythms[events[i].value][1];
            if (type !== "quarter" && events.slice(i, end).every(note => note.pitches.length > 0)) {
                const levels = type === "16th" ? 2 : 1;
                for (let index = i; index < end; index++) {
                    const mark = index === i ? "begin" : index === end - 1 ? "end" : "continue";
                    beams.set(index, Array.from({length: levels}, (_, level) =>
                        `<beam number="${level + 1}">${mark}</beam>`).join(""));
                }
            }
        }
        i = end;
    }
    return {notations: marks, beams};
}

function noteXml(note: Note, staff: number, tupletMark = "", beamMark = "") {
    const [ticks, type, tuplet] = rhythms[note.value];
    const timing = tuplet ? `<time-modification><actual-notes>${tuplet}</actual-notes><normal-notes>${tuplet === 5 ? 4 : 2}</normal-notes></time-modification>` : "";
    const tieTypes = [note.stop && "stop", note.start && "start"].filter(Boolean);
    const ties = tieTypes.map(type => `<tie type="${type}"/>`).join("");
    const tied = tieTypes.map(type => `<tied type="${type}"/>`).join("");
    return (note.pitches.length ? note.pitches : [null]).map((pitch, index) => {
        const marks = tied + (index === 0 ? tupletMark : "");
        const notations = marks ? `<notations>${marks}</notations>` : "";
        const body = pitch ? `<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>` : "<rest/>";
        return `<note>${index ? "<chord/>" : ""}${body}<duration>${ticks * 84}</duration>${ties}<voice>${staff}</voice><type>${type}</type>${timing}<staff>${staff}</staff>${index === 0 ? beamMark : ""}${notations}</note>`;
    }).join("");
}

export function toMusicXml(source: Source): string | null {
    const signature = /^([1-9]\d?)\/(1|2|4|8)$/.exec(source.time);
    if (!signature) throw new Error(`올바르지 않은 박자: ${source.time}`);
    const [, beats, beatType] = signature;
    const length = Number(beats) * 480 / Number(beatType);
    const minor = source.key.endsWith("m") || /^[a-g]/.test(source.key);
    const keyName = source.key.replace(/m$/, "").replace(/^[a-g]/, s => s.toUpperCase());
    const majorFifths = keys.indexOf(keyName) - 7;
    const minorFifths = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"].indexOf(keyName) - 7;
    const fifths = minor ? minorFifths : majorFifths;
    if (fifths < -7) throw new Error(`지원하지 않는 조성: ${source.key}`);
    const grid = source.grid as Rhythm;
    if (!rhythms[grid]) throw new Error(`올바르지 않은 Grid: ${grid}`);
    const inputs = fields.map(field => source[field]);
    const first = inputs.some(value => value && !value.startsWith("|")) ? 0 : 1;
    const [chords, melody, melodyRhythm, voicing, voicingRhythm] = inputs.map(splitBars);
    const count = Math.max(chords.length, melody.length, melodyRhythm.length, voicing.length, voicingRhythm.length);
    if (!count) return null;
    const measures = Array.from({length: count}, (_, i): Measure => {
        const candidate = i === 0 && first === 0;
        try {
            const pitchSignature = minor || keyName === "Cb" ? 0 : fifths;
            const right = buildHand(melody[i] ?? "", melodyRhythm[i] ?? "", "right", grid, length, candidate, pitchSignature);
            const left = buildHand(voicing[i] ?? "", voicingRhythm[i] ?? "", "left", grid, length, candidate, pitchSignature);
            const pickup = candidate && [right, left].some(hand => hand.length && duration(hand) < length);
            return {chords: words(chords[i] ?? ""), right, left, pickup};
        } catch (error) {
            throw new Error(`${first + i}마디 오류: ${(error as Error).message}`);
        }
    });
    linkTies(measures, "right", first);
    linkTies(measures, "left", first);
    const hasNotes = (hand: Hand) => measures.some(measure => measure[hand].some(note => note.pitches.length));
    const hands: Hand[] = hasNotes("left") ? (hasNotes("right") ? ["right", "left"] : ["left"]) : ["right"];
    const clefs = hands.map((hand, i) => `<clef number="${i + 1}"><sign>${hand === "right" ? "G" : "F"}</sign><line>${hand === "right" ? 2 : 4}</line></clef>`).join("");
    const attributes = `<attributes><divisions>10080</divisions><key><fifths>${fifths}</fifths><mode>${minor ? "minor" : "major"}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>${hands.length}</staves>${clefs}</attributes>`;
    const contents = measures.map((measure, index) => {
        const number = index + (measures[0].pickup ? 0 : 1);
        const renderedLength = (hand: Hand) => measure.pickup ? duration(measure[hand]) || length : length;
        const harmonyOffsets = measure.chords.map((symbol, i) => ({
            symbol, offset: Math.round(i * renderedLength(hands[0]) * 84 / measure.chords.length),
        }));
        let nextHarmony = 0;
        const addHarmonies = (cursor: number) => {
            let result = "";
            while (nextHarmony < harmonyOffsets.length && harmonyOffsets[nextHarmony].offset <= cursor) {
                const {symbol, offset} = harmonyOffsets[nextHarmony++];
                result += harmony(symbol, offset - cursor);
            }
            return result;
        };
        const staves = hands.map((hand, i) => {
            const staff = i + 1;
            const length = renderedLength(hand) * 84;
            const events = measure[hand];
            let cursor = 0;
            let notes = "";
            if (events.some(event => event.pitches.length)) {
                const marks = tupletMarks(events);
                events.forEach((event, index) => {
                    if (!i) notes += addHarmonies(cursor);
                    notes += noteXml(event, staff, marks.notations.get(index), marks.beams.get(index));
                    cursor += rhythms[event.value][0] * 84;
                });
            } else {
                if (!i) notes = addHarmonies(0);
                notes += `<note><rest${measure.pickup ? "" : ' measure="yes"'}/><duration>${length}</duration><voice>${staff}</voice><staff>${staff}</staff></note>`;
            }
            if (!i) notes += addHarmonies(length);
            return `${i ? `<backup><duration>${renderedLength(hands[0]) * 84}</duration></backup>` : ""}${notes}`;
        }).join("");
        return `<measure number="${number}"${measure.pickup ? ' implicit="yes"' : ""}>${index ? "" : attributes}${!index && source.tempo ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${source.tempo}</per-minute></metronome></direction-type><sound tempo="${source.tempo}"/></direction>` : ""}${staves}</measure>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${contents}</part></score-partwise>`;
}
