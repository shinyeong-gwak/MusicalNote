import { bindChordPress } from "./chord-actions";
import { splitBars, words } from "./sheet";

export const chordReference = /^chord\[([^\]]+)\]$/i;
export const sheetReference = /^sheet\[([^\]]+)\]$/i;
export type ChordToken = {start: number; value: string};
export type ChordActions = {hold: (token: ChordToken) => void; tap: (bar: number, value: string) => void};
type Bar = {tokens: string[]; sequences: string[]; positions?: ChordToken[]};
const sequenceMarker = /^\/seq\[([^\]]*)\]$/i;

function measures(text: string) {
    return splitBars(text.replace(/\|\s*\n\s*\|/g, "|"));
}

function parseMeasure(text: string): Bar {
    const tokens: string[] = [];
    const sequences: string[] = [];
    for (const token of words(text)) {
        const sequence = /^\/seq\[([^\]]*)\]$/i.exec(token);
        if (sequence) sequences.push(sequence[1].trim());
        else tokens.push(token);
    }
    return {tokens, sequences};
}

const notation = (value: string) => value.replaceAll("b", "♭").replaceAll("h", "ø");

function renderToken(container: HTMLElement, token: string) {
    const emphasis = /^\*\*(.+?)\*\*$/.exec(token);
    const value = (emphasis?.[1] ?? token).trim();
    const element = container.createSpan({cls: emphasis ? "lickgo-chord-token is-highlighted" : "lickgo-chord-token"});
    const match = /^([A-Ga-g](?:#|b)?)(m|M|o|h|\+)?(6|7)?(.*)$/.exec(value);
    if (!match) {
        element.setText(notation(value));
        return;
    }
    const [, root, quality = "", degree = "", tail = ""] = match;
    const bass = /\/[A-Ga-g](?:#|b)?$/.exec(tail)?.[0] ?? "";
    const extension = bass ? tail.slice(0, -bass.length) : tail;
    element.createSpan({text: notation(root)});
    if (quality || degree) element.createSpan({cls: "lickgo-chord-detail", text: notation(quality) + degree});
    if (extension) element.createSpan({cls: "lickgo-chord-extension", text: notation(extension)});
    if (bass) element.createSpan({cls: "lickgo-chord-bass", text: notation(bass)});
}

export async function renderChord(
    source: string,
    container: HTMLElement,
    resolve: (name: string) => Promise<string | undefined>,
    actions?: ChordActions,
) {
    const lines = [...source.matchAll(/[^\r\n]+/g)].map(match => ({
        text: match[0].trim(),
        start: match.index + match[0].length - match[0].trimStart().length,
    })).filter(line => line.text);
    const resolved = await Promise.all(lines.map(({text}) => {
        const name = chordReference.exec(text)?.[1];
        return name ? resolve(name) : undefined;
    }));
    const bars: Bar[] = [];
    const annotations: string[][] = [];
    const references = new Set<string>();
    const missing = new Set<string>();
    let pending: string[] = [];
    lines.forEach(({text: line, start}, i) => {
        if (line.startsWith(">")) {
            annotations.push(measures(line.slice(1)));
            return;
        }
        const ref = chordReference.exec(line)?.[1];
        if (ref && resolved[i] === undefined) {
            missing.add(ref);
            return;
        }
        if (ref) references.add(ref);
        const value = resolved[i] ?? line;
        const lineBars = measures(value).map(parseMeasure);
        if (!ref && actions) {
            const positions = [...line.matchAll(/[^\s|]+/g)]
                .filter(match => !sequenceMarker.test(match[0]))
                .map(match => ({start: start + match.index, value: match[0]}));
            let offset = 0;
            for (const bar of lineBars) {
                bar.positions = positions.slice(offset, offset + bar.tokens.length);
                offset += bar.tokens.length;
            }
        }
        if (!value.includes("|") && lineBars.every(bar => !bar.tokens.length)) {
            pending.push(...lineBars.flatMap(bar => bar.sequences));
            return;
        }
        if (lineBars.length && pending.length) {
            lineBars[0].sequences.unshift(...pending);
            pending = [];
        }
        bars.push(...lineBars);
    });

    if (references.size) container.createDiv({cls: "lickgo-caption", text: [...references].join(" · ")});
    for (const name of missing) container.createDiv({cls: "lickgo-status", text: `chord[${name}] · 코드를 찾을 수 없습니다.`});
    if (!bars.length) {
        if (!missing.size) container.createDiv({cls: "lickgo-status", text: "코드가 없습니다."});
        return;
    }
    const chart = container.createDiv({cls: "lickgo-chart", attr: {role: "group", "aria-label": "코드 진행"}});
    for (let i = 0; i < bars.length; i += 4) {
        const row = chart.createDiv({cls: "lickgo-chord-row"});
        for (let col = 0; col < 4; col++) {
            const measure = row.createDiv({cls: "lickgo-chord-measure"});
            const bar = bars[i + col];
            if (!bar) continue;
            if (bar.sequences.length) measure.createDiv({cls: "lickgo-sequences", text: bar.sequences.map(id => `/seq[${id}]`).join(" ")});
            const tokens = bar.tokens.slice(0, 4);
            const cells = measure.createDiv({cls: `lickgo-chord-cells lickgo-chord-count-${tokens.length}`});
            tokens.forEach((token, index) => {
                const position = bar.positions?.[index];
                if (actions && position?.value === token) {
                    const button = cells.createEl("button", {
                        cls: "lickgo-chord-symbol lickgo-chord-button",
                        attr: {type: "button", title: "탭: 주석 · 길게 누르기: 강조", "aria-label": `${token} 마디 주석`, "aria-keyshortcuts": "Shift+Enter"},
                    });
                    bindChordPress(button, () => actions.tap(i + col, annotations[i / 4]?.[col] ?? ""), () => actions.hold(position));
                    renderToken(button, token);
                } else {
                    renderToken(cells.createSpan({cls: "lickgo-chord-symbol", attr: {title: token}}), token);
                }
            });
        }
        const marks = annotations[i / 4];
        if (marks) {
            const annotation = chart.createDiv({cls: "lickgo-annotation", attr: {"aria-label": "아랫단 주석"}});
            for (let col = 0; col < 4; col++) annotation.createSpan({text: marks[col] ?? ""});
        }
    }
}
