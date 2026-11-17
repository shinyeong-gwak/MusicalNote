import { Modal, Notice, type App, type Editor, type MarkdownFileInfo } from "obsidian";
import { findBlocks } from "./blocks";
import { fields } from "./sheet";

type Field = typeof fields[number];
type Lane = {
    field: Field; section: number; start: number; end: number; original: string; value: string;
    anchor: number; caret: number;
};

const labels: Record<Field, string> = {
    chords: "코드", melody: "오른손 음표", melody_rhythm: "오른손 리듬",
    voicing: "왼손 보이싱", voicing_rhythm: "왼손 리듬",
};

function getLanes(language: string, source: string, start: number, end: number): Lane[] {
    function lane(field: Field, from: number, to: number, section = from): Lane {
        // Leave separator lines and indentation around the edited text intact.
        const raw = source.slice(from, to);
        const leading = /^(?:[^\S\n]*\n)*(?=\s*\S)/.exec(raw)?.[0].length ?? 0;
        const value = raw.slice(leading).replace(/(?:\r?\n[^\S\n]*)+$/, "");
        return {field, section, start: from + leading, end: from + leading + value.length,
            original: value, value, anchor: value.length, caret: value.length};
    }
    if (language === "chord") return [lane("chords", start, end)];
    const headers = [...source.slice(start, end).matchAll(
        /^[ \t]*(chords|melody|melody_rhythm|voicing|voicing_rhythm)[ \t]*\r?\n[ \t]*-{3,}[ \t]*\r?\n/gm,
    )];
    return headers.map((header, index) => lane(header[1] as Field,
        start + header.index + header[0].length, start + (headers[index + 1]?.index ?? end - start), start + header.index));
}

const notes = ["C", "D", "E", "F", "G", "A", "B"];
const flats = ["Db", "Eb", "Gb", "Ab", "Bb", "n"];
const sharps = ["C#", "D#", "F#", "G#", "A#"];
const octaves = ["1", "2", "3", "4", "5", "6", "7", "8"];
const rhythms = ["1", "2", "4", "8", "12", "16", "20", "24"];
const chordKeys = [notes, ["b", "#", "M", "m", "o", "h", "+", "/"], ["6", "7", "9", "11", "13", "sus", "add", "alt"], ["|", "(", ")", "**"]];
const noteKeys = [notes, flats, sharps, octaves, ["-", "!", "~", "|"]];
const rhythmKeys = [rhythms.slice(0, 4), rhythms.slice(4), ["!", "~", "|", "*"], octaves];

class MusicKeyboard extends Modal {
    private preview!: HTMLPreElement;
    private keys!: HTMLDivElement;
    private tabs: HTMLButtonElement[] = [];

    constructor(app: App, private editor: Editor, private info: MarkdownFileInfo,
        private path: string | undefined, private snapshot: string,
        private lanes: Lane[], private active: number) {
        super(app);
    }

    onOpen() {
        this.titleEl.setText("음악 키보드");
        this.modalEl.addClass("lickgo-keyboard-modal");
        const tabs = this.contentEl.createDiv({cls: "lickgo-keyboard-tabs"});
        if (this.lanes.length > 1) this.tabs = this.lanes.map((lane, index) => {
            const button = tabs.createEl("button", {text: labels[lane.field]});
            button.onclick = () => { this.active = index; this.drawLane(); };
            return button;
        });
        this.preview = this.contentEl.createEl("pre", {cls: "lickgo-keyboard-preview", attr: {"aria-label": "입력 내용"}});
        this.keys = this.contentEl.createDiv({cls: "lickgo-keyboard-keys"});
        const edits = this.contentEl.createDiv({cls: "lickgo-keyboard-row"});
        this.button(edits, "←", () => this.move(-1), "커서 왼쪽");
        this.button(edits, "→", () => this.move(1), "커서 오른쪽");
        this.button(edits, "공백", () => this.insert(" "));
        this.button(edits, "↵", () => this.insert("\n"), "줄바꿈");
        this.button(edits, "⌫", () => this.backspace(), "지우기");
        const actions = this.contentEl.createDiv({cls: "lickgo-keyboard-actions"});
        this.button(actions, "취소", () => this.close());
        this.button(actions, "적용", () => this.apply()).addClass("mod-cta");
        this.drawLane();
    }

    onClose() { this.contentEl.empty(); }

    private get lane() { return this.lanes[this.active]; }

    private button(container: HTMLElement, text: string, action: () => void, label = text) {
        const button = container.createEl("button", {text, attr: {"aria-label": label, type: "button"}});
        button.onclick = action;
        return button;
    }

    private drawLane() {
        this.tabs.forEach((tab, index) => tab.setAttribute("aria-pressed", String(index === this.active)));
        this.keys.empty();
        const field = this.lane.field;
        const isRhythm = field.endsWith("_rhythm");
        const rows = field === "chords" ? chordKeys : isRhythm ? rhythmKeys : noteKeys;
        rows.forEach((row, index) => {
            const element = this.keys.createDiv({cls: "lickgo-keyboard-row"});
            for (const key of row) {
                const label = key === "h" ? "ø" : key.replace(/b/g, "♭").replace(/#/g, "♯").replace(/^n$/, "♮");
                const token = (isRhythm && index < 2) || (!isRhythm && field !== "chords" && key === "!");
                const display = isRhythm && index === 3 ? `×${label}` : label;
                const value = isRhythm && index === 3 ? `*${key}` : key;
                this.button(element, display, () => this.insertKey(value, token || value.startsWith("*") && value.length > 1, field));
            }
        });
        this.drawPreview();
    }

    private drawPreview() {
        const {value, anchor, caret} = this.lane;
        const from = Math.min(anchor, caret);
        const to = Math.max(anchor, caret);
        this.preview.empty();
        this.preview.append(value.slice(0, from));
        if (to > from) this.preview.createSpan({cls: "lickgo-keyboard-selection", text: value.slice(from, to)});
        const marker = this.preview.createSpan({cls: "lickgo-keyboard-caret", attr: {"aria-hidden": "true"}});
        this.preview.append(value.slice(to));
        const bounds = this.preview.getBoundingClientRect();
        const point = marker.getBoundingClientRect();
        if (point.bottom > bounds.bottom) this.preview.scrollTop += point.bottom - bounds.bottom + 6;
        else if (point.top < bounds.top) this.preview.scrollTop += point.top - bounds.top - 6;
    }

    private move(delta: number) {
        const lane = this.lane;
        const next = lane.anchor === lane.caret
            ? lane.caret + delta
            : delta < 0 ? Math.min(lane.anchor, lane.caret) : Math.max(lane.anchor, lane.caret);
        lane.anchor = lane.caret = Math.max(0, Math.min(lane.value.length, next));
        this.drawPreview();
    }

    private insertKey(value: string, token: boolean, field: Field) {
        const {anchor, caret, value: current} = this.lane;
        const from = Math.min(anchor, caret);
        const to = Math.max(anchor, caret);
        const before = current.slice(0, from);
        const after = current.slice(to);
        const root = /^[A-G]/.test(value);
        const partOfVoicing = before.endsWith("-");
        const slashBass = field === "chords" && before.endsWith("/");
        const rhythmRest = field.endsWith("_rhythm") && before.endsWith("!");
        if ((token || root || value === "|" || value === "!") && before && !/[\s|]$/.test(before) &&
            !partOfVoicing && !slashBass && !rhythmRest) value = " " + value;
        if (value.trim() === "|" && after && !/^[\s|]/.test(after)) value += " ";
        this.insert(value);
    }

    private insert(value: string) {
        const lane = this.lane;
        const from = Math.min(lane.anchor, lane.caret);
        const to = Math.max(lane.anchor, lane.caret);
        lane.value = lane.value.slice(0, from) + value + lane.value.slice(to);
        lane.anchor = lane.caret = from + value.length;
        this.drawPreview();
    }

    private backspace() {
        const lane = this.lane;
        if (lane.anchor === lane.caret) lane.anchor = Math.max(0, lane.caret - 1);
        this.insert("");
    }

    private apply() {
        if (this.path !== this.info.file?.path || this.editor.getValue() !== this.snapshot) {
            new Notice("노트가 변경되었습니다. 음악 키보드를 다시 열어 주세요.");
            return;
        }
        const changes = this.lanes.filter(lane => lane.original !== lane.value).map(lane => {
            const needsLineBreak = lane.value && !this.snapshot.slice(lane.end).startsWith("\n") &&
                !this.snapshot.slice(lane.end).startsWith("\r\n") && !lane.value.endsWith("\n");
            return {
                from: this.editor.offsetToPos(lane.start), to: this.editor.offsetToPos(lane.end),
                text: lane.value + (needsLineBreak ? "\n" : ""),
            };
        });
        if (changes.length) {
            // A single transaction keeps all lane edits in one undo step.
            this.editor.transaction({changes});
        }
        this.close();
    }
}

export function openMusicKeyboard(app: App, editor: Editor, info: MarkdownFileInfo) {
    const snapshot = editor.getValue();
    const cursor = editor.posToOffset(editor.getCursor());
    const block = findBlocks(snapshot).find(candidate =>
        (candidate.language === "sheet" || candidate.language === "chord") &&
        candidate.opening <= cursor && cursor <= candidate.end);
    const lanes = block ? getLanes(block.language, snapshot, block.start, block.end) : [];
    if (!lanes.length) {
        new Notice("sheet 또는 chord 블록 안에 커서를 놓고 음악 키보드를 열어 주세요.");
        return;
    }
    let active = 0;
    lanes.forEach((lane, index) => { if (lane.section <= cursor) active = index; });
    const lane = lanes[active];
    const offset = (pos: "from" | "to") => Math.max(0, Math.min(lane.value.length,
        editor.posToOffset(editor.getCursor(pos)) - lane.start));
    lane.anchor = offset("from");
    lane.caret = offset("to");

    // The modal only uses buttons. Blurring the editor dismisses text entry before it opens.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    new MusicKeyboard(app, editor, info, info.file?.path, snapshot, lanes, active).open();
}
