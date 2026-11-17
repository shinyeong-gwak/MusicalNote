import {
    editorInfoField, editorLivePreviewField, MarkdownRenderChild, MarkdownView, Notice,
    Menu, normalizePath, Plugin, TFile,
    type Editor, type MarkdownPostProcessorContext, type MarkdownSectionInformation,
} from "obsidian";
import type { Text } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";
import { findBlocks } from "./blocks";
import { openMusicKeyboard } from "./keyboard";
import { chordReference, renderChord, sheetReference, type ChordToken } from "./chord";
import { fields, parseSheet, splitBars, toMusicXml, words } from "./sheet";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const sheetTemplate = "```sheet\n\n" + fields.map(field => field + "\n---\n").join("\n\n") + "\n```";
const chordTemplate = "```chord\n| \n```";
class RenderedMusic extends MarkdownRenderChild {
    disposed = false;
    onunload() { this.disposed = true; }
}

const widgetChildren = new WeakMap<HTMLElement, RenderedMusic>();

class ReferenceWidget extends WidgetType {
    constructor(readonly source: string, readonly path: string, readonly doc: Text, readonly plugin: LickGoNote) { super(); }
    eq(other: ReferenceWidget) { return this.source === other.source && this.path === other.path && this.doc === other.doc; }
    toDOM(view: EditorView) {
        const wrapper = view.dom.ownerDocument.createElement("span");
        wrapper.className = "lickgo-live-reference";
        const child = new RenderedMusic(wrapper);
        this.plugin.addChild(child);
        widgetChildren.set(wrapper, child);
        this.plugin.renderReference(this.source, this.path, child, this.doc.toString());
        return wrapper;
    }
    destroy(dom: HTMLElement) {
        const child = widgetChildren.get(dom);
        if (child) this.plugin.removeChild(child);
        widgetChildren.delete(dom);
    }
}

export default class LickGoNote extends Plugin {
    onload() {
        this.registerMarkdownCodeBlockProcessor("sheet", (source, el, ctx) => {
            void this.renderSheet(source, this.child(el, ctx));
        });
        this.registerMarkdownCodeBlockProcessor("chord", (source, el, ctx) => {
            void this.renderChart(source, ctx.sourcePath, this.child(el, ctx), undefined,
                token => void this.toggleChord(ctx.sourcePath, source, token, el, ctx.getSectionInfo(el)));
        });
        this.registerMarkdownPostProcessor((el, ctx) => {
            for (const paragraph of el.querySelectorAll("p")) {
                if (paragraph.closest(".lickgo-music")) continue;
                const lines = paragraph.textContent?.trim().split(/\n/) ?? [];
                if (!lines.length || !lines.every(line => chordReference.test(line.trim()) || sheetReference.test(line.trim()))) continue;
                if (paragraph.querySelector("code, a, img")) continue;
                const output = paragraph.ownerDocument.createElement("div");
                paragraph.replaceWith(output);
                for (const line of lines) {
                    const target = output.createDiv();
                    this.renderReference(line.trim(), ctx.sourcePath, this.child(target, ctx));
                }
            }
        });
        this.registerLiveReferences();
        this.addCommand({id: "insert-sheet", name: "악보 블록 삽입", icon: "music", editorCallback: editor => this.insert(editor, "sheet")});
        this.addCommand({id: "insert-chord", name: "코드 블록 삽입", icon: "list-music", editorCallback: editor => this.insert(editor, "chord")});
        this.addCommand({
            id: "music-keyboard", name: "음악 키보드 열기", icon: "keyboard",
            editorCallback: (editor, ctx) => openMusicKeyboard(this.app, editor, ctx),
        });
        this.addRibbonIcon("music", "LickGo Note", event => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const menu = new Menu();
            menu.addItem(item => item.setTitle("악보 블록 삽입").setIcon("music").onClick(() => this.insert(view.editor, "sheet")));
            menu.addItem(item => item.setTitle("코드 블록 삽입").setIcon("list-music").onClick(() => this.insert(view.editor, "chord")));
            menu.addItem(item => item.setTitle("음악 키보드 열기").setIcon("keyboard")
                .onClick(() => openMusicKeyboard(this.app, view.editor, view)));
            menu.showAtMouseEvent(event);
        });
    }

    private registerLiveReferences() {
        const plugin = this;
        this.registerEditorExtension(ViewPlugin.fromClass(class {
            decorations = Decoration.none;
            constructor(view: EditorView) { this.decorate(view); }
            update(update: ViewUpdate) { this.decorate(update.view); }
            decorate(view: EditorView) {
                if (!view.state.field(editorLivePreviewField, false)) {
                    this.decorations = Decoration.none;
                    return;
                }
                const path = view.state.field(editorInfoField, false)?.file?.path;
                if (!path) {
                    this.decorations = Decoration.none;
                    return;
                }
                const widgets = [];
                const tree = syntaxTree(view.state);
                const selections = view.state.selection.ranges;
                let last = 0;
                for (const range of view.visibleRanges) {
                    let position = range.from;
                    while (position <= range.to) {
                        const line = view.state.doc.lineAt(position);
                        position = line.to + 1;
                        if (last === line.number) continue;
                        last = line.number;
                        const source = line.text.trim();
                        if (!chordReference.test(source) && !sheetReference.test(source)) continue;
                        if (selections.some(selection => selection.from <= line.to && selection.to >= line.from)) continue;
                        let node = tree.resolveInner(line.from + line.text.indexOf(source) + 1);
                        let inCode = false;
                        while (node) {
                            if (/code|frontmatter|hmd-yaml/i.test(node.name)) { inCode = true; break; }
                            if (!node.parent) break;
                            node = node.parent;
                        }
                        if (!inCode) widgets.push(Decoration.replace({widget: new ReferenceWidget(source, path, view.state.doc, plugin)}).range(line.from, line.to));
                    }
                }
                this.decorations = Decoration.set(widgets, true);
            }
        }, { decorations: view => view.decorations }));
    }

    private insert(editor: Editor, type: "chord" | "sheet") {
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        const before = editor.getLine(from.line).slice(0, from.ch);
        const after = editor.getLine(to.line).slice(to.ch);
        const prefix = before ? "\n\n" : "";
        const suffix = after ? "\n\n" : "\n";
        const selected = editor.getSelection().trim();
        let template = type === "sheet" ? sheetTemplate : chordTemplate;
        if (selected) template = type === "sheet" ? template.replace("chords\n---\n", () => "chords\n---\n" + selected) : "```chord\n" + selected + "\n```";
        editor.replaceRange(prefix + template + suffix, from, to);
        editor.setCursor({line: from.line + (before ? 2 : 0) + (type === "sheet" ? 4 : 1), ch: type === "chord" && !selected ? 2 : 0});
        editor.focus();
    }

    private child(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const child = new RenderedMusic(el);
        ctx.addChild(child);
        return child;
    }

    renderReference(line: string, path: string, child: RenderedMusic, liveText?: string) {
        const chord = chordReference.exec(line);
        if (chord) {
            void this.renderChart(line, path, child, liveText);
        } else {
            const name = sheetReference.exec(line)?.[1];
            if (!name) return;
            void this.findReference(name, path, "sheet", liveText).then(source => {
                if (child.disposed) return;
                if (source !== undefined) return this.renderSheet(source, child);
                this.status(child, `sheet[${name}] · 악보를 찾을 수 없습니다.`);
            }).catch(error => this.status(child, (error as Error).message));
        }
    }

    private async findReference(name: string, path: string, language: "chord" | "sheet", liveText?: string): Promise<string | undefined> {
        const source = this.app.vault.getAbstractFileByPath(path);
        const note = liveText ?? (source instanceof TFile ? await this.app.vault.cachedRead(source) : "");
        if (note) {
            const local = findBlocks(note).find(block => {
                const header = block.text.split(/^chords\s*\n-{3,}\s*$/m, 1)[0];
                return block.language === "sheet" && /^name:[ \t]*(.+)$/m.exec(header)?.[1]?.trim() === name.trim();
            });
            if (local) return language === "sheet" ? local.text : parseSheet(local.text).chords;
        }
        const target = this.app.metadataCache.getFirstLinkpathDest(normalizePath(name.trim()), path);
        if (!(target instanceof TFile) || target.extension !== "md") return undefined;
        const blocks = findBlocks(await this.app.vault.cachedRead(target));
        const block = blocks.find(block => block.language === language);
        // Keep references from recursively expanding other chord references.
        if (block) return block.text;
        const sheet = blocks.find(block => block.language === "sheet");
        if (sheet && language === "chord") return parseSheet(sheet.text).chords;
        return undefined;
    }

    private status(child: RenderedMusic, message: string) {
        if (child.disposed) return;
        child.containerEl.empty();
        child.containerEl.addClass("lickgo-music");
        child.containerEl.createDiv({cls: "lickgo-status", text: message});
    }

    private async toggleChord(path: string, source: string, token: ChordToken,
        el: HTMLElement, section: MarkdownSectionInformation | null) {
        const localOffset = token.start - (source.length - source.trimStart().length);
        const replacement = /^\*\*.+\*\*$/.test(token.value)
            ? token.value.slice(2, -2) : `**${token.value}**`;
        const locate = (markdown: string) => {
            const candidates = findBlocks(markdown).filter(block => block.language === "chord" && block.text.trim() === source.trim());
            const nearby = section ? candidates.filter(block => {
                const line = markdown.slice(0, block.opening).split("\n").length - 1;
                return line >= section.lineStart && line <= section.lineEnd;
            }) : [];
            const block = nearby.length === 1 ? nearby[0] : candidates.length === 1 ? candidates[0] : undefined;
            if (!block) return;
            const start = block.start + block.text.length - block.text.trimStart().length + localOffset;
            const end = start + token.value.length;
            if (markdown.slice(start, end) === token.value) return {start, end};
        };
        try {
            const views = this.app.workspace.getLeavesOfType("markdown")
                .map(leaf => leaf.view)
                .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === path && view.getMode() === "source");
            const editor = (views.find(view => view.containerEl.contains(el)) ?? views[0])?.editor;
            if (editor) {
                const range = locate(editor.getValue());
                if (range) {
                    editor.replaceRange(replacement, editor.offsetToPos(range.start), editor.offsetToPos(range.end));
                    return;
                }
            } else {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    let replaced = false;
                    await this.app.vault.process(file, markdown => {
                        const range = locate(markdown);
                        if (!range) return markdown;
                        replaced = true;
                        return markdown.slice(0, range.start) + replacement + markdown.slice(range.end);
                    });
                    if (replaced) return;
                }
            }
            new Notice("코드 위치를 확인할 수 없습니다. 블록을 다시 열어 주세요.");
        } catch (error) {
            new Notice(`코드 강조를 적용하지 못했습니다. ${(error as Error).message}`);
        }
    }

    private async renderChart(source: string, path: string, child: RenderedMusic, liveText?: string,
        toggleEmphasis?: (token: ChordToken) => void) {
        try {
            const output = child.containerEl.createDiv({cls: "lickgo-music"});
            await renderChord(source, output, name => this.findReference(name, path, "chord", liveText), toggleEmphasis);
            if (child.disposed) output.remove();
        } catch (error) {
            this.status(child, (error as Error).message);
        }
    }

    private async renderSheet(text: string, child: RenderedMusic) {
        try {
            const sheet = parseSheet(text);
            const xml = toMusicXml(sheet);
            if (!xml) {
                this.status(child, "악보 입력을 기다리는 중입니다.");
                return;
            }
            const wrapper = child.containerEl.createDiv({cls: "lickgo-music"});
            if (sheet.name) wrapper.createDiv({cls: "lickgo-caption", text: sheet.name});
            const frame = wrapper.createDiv({cls: "lickgo-score-frame"});
            const output = frame.createDiv({cls: "lickgo-score"});
            const display = new OpenSheetMusicDisplay(output, {
                autoResize: false, autoBeam: true, drawTitle: false, drawPartNames: false, backend: "svg",
            });
            await display.load(xml);
            if (child.disposed) return;
            const dense = [sheet.chords, sheet.melody, sheet.voicing].some(source =>
                splitBars(source).some(bar => words(bar).length >= 8));
            display.zoom = 0.6;
            const rules = display.EngravingRules;
            rules.FixedMeasureWidth = true;
            rules.PageLeftMargin = 0.5;
            rules.PageRightMargin = 0.5;
            rules.PageTopMargin = rules.PageBottomMargin;
            rules.MeasureLeftMargin = 0.2;
            rules.MeasureRightMargin = 0;
            let previousWidth = 0;
            const draw = () => {
                if (child.disposed || !output.clientWidth || output.clientWidth === previousWidth) return;
                previousWidth = output.clientWidth;
                rules.RenderXMeasuresPerLineAkaSystem = dense || previousWidth < 520 ? 2 : 4;
                try { display.render(); }
                catch (error) { this.status(child, (error as Error).message); }
            };
            const observer = new ResizeObserver(draw);
            observer.observe(output);
            child.register(() => { observer.disconnect(); display.clear(); });
            draw();
        } catch (error) {
            this.status(child, (error as Error).message);
        }
    }
}
