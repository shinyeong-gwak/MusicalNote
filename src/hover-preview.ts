import {editorInfoField} from "obsidian";
import {EditorView, ViewPlugin, type ViewUpdate} from "@codemirror/view";
import {findBlocks} from "./blocks";
import {chordReference, sheetReference} from "./chord";

type Preview = {language: "chord" | "sheet" | "reference"; source: string; path: string; document: string};
export function musicHoverPreview(render: (preview: Preview, element: HTMLElement) => () => void) {
    return ViewPlugin.fromClass(class {
        private point?: {x: number; y: number};
        private modifier = false;
        private popup?: HTMLElement;
        private dispose?: () => void;
        private key = "";
        private win: Window;
        constructor(private view: EditorView) {
            this.win = view.dom.ownerDocument.defaultView!;
            view.dom.addEventListener("mousemove", this.move);
            view.dom.addEventListener("mouseleave", this.leave);
            view.scrollDOM.addEventListener("scroll", this.close);
            this.win.addEventListener("keydown", this.keydown);
            this.win.addEventListener("keyup", this.keyup);
            this.win.addEventListener("blur", this.close);
        }
        update(update: ViewUpdate) { if (update.docChanged) this.close(); }
        private move = (event: MouseEvent) => {
            this.point = {x: event.clientX, y: event.clientY};
            this.modifier = event.shiftKey || event.ctrlKey || event.metaKey;
            this.show();
        };
        private leave = (event: MouseEvent) => {
            if (this.popup?.contains(event.relatedTarget as Node | null)) return;
            this.point = undefined;
            this.close();
        };
        private keydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { this.close(); return; }
            this.modifier = event.shiftKey || event.ctrlKey || event.metaKey;
            this.show();
        };
        private keyup = (event: KeyboardEvent) => {
            this.modifier = event.shiftKey || event.ctrlKey || event.metaKey;
            if (!this.modifier) this.close();
        };
        private show() {
            if (!this.modifier || !this.point) { this.close(); return; }
            const pos = this.view.posAtCoords(this.point);
            const path = this.view.state.field(editorInfoField, false)?.file?.path;
            if (pos === null || !path) { this.close(); return; }
            const text = this.view.state.doc.toString();
            const block = findBlocks(text).find(block => block.opening <= pos && pos <= block.end);
            let preview: Preview;
            let key: string;
            if (block && (block.language === "chord" || block.language === "sheet")) {
                preview = {language: block.language, source: block.text, path, document: text};
                key = path + ":" + block.opening;
            } else {
                const line = this.view.state.doc.lineAt(pos);
                const source = line.text.trim();
                if (block || (!chordReference.test(source) && !sheetReference.test(source))) {
                    this.close();
                    return;
                }
                preview = {language: "reference", source, path, document: text};
                key = path + ":" + line.from;
            }
            if (key === this.key && this.popup) return;
            this.close();
            this.key = key;
            const popup = this.view.dom.ownerDocument.createElement("div");
            popup.className = "lickgo-hover-preview";
            popup.setAttribute("role", "region");
            popup.setAttribute("aria-label", "음악 미리보기");
            popup.style.left = Math.max(8, Math.min(this.point.x + 12, this.win.innerWidth - Math.min(680, this.win.innerWidth - 16) - 8)) + "px";
            popup.style.top = Math.max(8, Math.min(this.point.y + 18, this.win.innerHeight - 280)) + "px";
            this.view.dom.ownerDocument.body.append(popup);
            this.popup = popup;
            this.dispose = render(preview, popup);
            popup.addEventListener("mouseleave", () => { this.point = undefined; this.close(); });
        }
        private close = () => {
            this.dispose?.();
            this.dispose = undefined;
            this.popup?.remove();
            this.popup = undefined;
            this.key = "";
        };
        destroy() {
            this.close();
            this.view.dom.removeEventListener("mousemove", this.move);
            this.view.dom.removeEventListener("mouseleave", this.leave);
            this.view.scrollDOM.removeEventListener("scroll", this.close);
            this.win.removeEventListener("keydown", this.keydown);
            this.win.removeEventListener("keyup", this.keyup);
            this.win.removeEventListener("blur", this.close);
        }
    });
}
