import { Modal, type App } from "obsidian";
import { splitBars } from "./sheet";

export function bindChordPress(button: HTMLButtonElement, tap: () => void, hold: () => void) {
    let press: {id: number; x: number; y: number; timer: number} | undefined;
    let suppressClick = false;
    const clear = () => {
        if (press) window.clearTimeout(press.timer);
        press = undefined;
    };
    button.addEventListener("pointerdown", event => {
        if (!event.isPrimary || event.button !== 0) return;
        clear();
        suppressClick = false;
        button.setPointerCapture(event.pointerId);
        const timer = window.setTimeout(() => {
            suppressClick = true;
            if (button.isConnected) hold();
        }, 550);
        press = {id: event.pointerId, x: event.clientX, y: event.clientY, timer};
    });
    button.addEventListener("pointermove", event => {
        if (press?.id !== event.pointerId || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 10) return;
        suppressClick = true;
        clear();
    });
    button.addEventListener("pointerup", clear);
    button.addEventListener("pointercancel", () => {
        suppressClick = true;
        clear();
    });
    button.addEventListener("lostpointercapture", clear);
    button.addEventListener("contextmenu", event => event.preventDefault());
    button.addEventListener("keydown", event => {
        if (event.key !== "Enter" || !event.shiftKey || event.repeat) return;
        event.preventDefault();
        hold();
    });
    button.addEventListener("click", event => {
        event.stopPropagation();
        if (event.detail === 0 || !suppressClick) tap();
        suppressClick = false;
    });
}

export function editAnnotation(source: string, row: number, column: number, value: string) {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/);
    const positions = lines.flatMap((line, index) => line.trimStart().startsWith(">") ? [index] : []);
    const index = positions[row];
    const original = index === undefined ? [] : splitBars(lines[index].trimStart().slice(1));
    if ((original[column] ?? "") === value) return source;
    const cells = Array.from({length: Math.max(4, original.length)}, (_, i) => i === column ? value : original[i] ?? "");
    const text = "> | " + cells.join(" | ") + " |";
    if (index !== undefined) {
        lines[index] = lines[index].match(/^\s*/)?.[0] + text;
    } else {
        const insertion = positions.length ? positions[positions.length - 1] + 1 : lines.length;
        lines.splice(insertion, 0, ...Array<string>(row - positions.length).fill(">|||||"), text);
    }
    return lines.join(eol);
}

export class ChordAnnotationModal extends Modal {
    constructor(app: App, private bar: number, private value: string, private save: (text: string) => void) { super(app); }

    onOpen() {
        this.titleEl.setText(`${this.bar + 1}마디 주석`);
        const form = this.contentEl.createEl("form");
        const input = form.createEl("input", {type: "text", cls: "lickgo-chord-annotation-input", attr: {"aria-label": "마디 아래 주석"}});
        input.value = this.value;
        const error = form.createDiv({cls: "lickgo-status", attr: {role: "status"}});
        const actions = form.createDiv({cls: "lickgo-keyboard-actions"});
        actions.createEl("button", {attr: {type: "button"}, text: "취소"}).onclick = () => this.close();
        actions.createEl("button", {attr: {type: "submit"}, text: "저장", cls: "mod-cta"});
        form.onsubmit = event => {
            event.preventDefault();
            if (input.value.includes("|")) {
                error.setText("|는 마디 구분에 사용됩니다.");
                return;
            }
            this.save(input.value.trim());
            this.close();
        };
        input.focus();
    }

    onClose() { this.contentEl.empty(); }
}
