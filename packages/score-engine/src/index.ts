import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { toMusicXml, type Source } from "./sheet";
export { fields, parseSheet, splitBars, toMusicXml, words, type Source } from "./sheet";

export type LickInput = {
    key?: string; time?: string; grid?: number | string; name?: string; tempo?: number;
    chords?: string; melody?: string; melodyRhythm?: string;
    voicing?: string; voicingRhythm?: string;
    rh?: string; rh_r?: string; lh?: string; lh_r?: string;
};

// Accepts both LickGo's saved model and its existing preview API payload.
export function fromLick(input: LickInput): Source {
    return {
        key: input.key || "C", time: input.time || "4/4", grid: Number(input.grid) || 8,
        name: input.name || "", tempo: input.tempo,
        chords: input.chords || "", melody: input.melody ?? input.rh ?? "",
        melody_rhythm: input.melodyRhythm ?? input.rh_r ?? "",
        voicing: input.voicing ?? input.lh ?? "", voicing_rhythm: input.voicingRhythm ?? input.lh_r ?? "",
    };
}

export function lickToMusicXml(input: LickInput) {
    return toMusicXml(fromLick(input));
}

export type RenderOptions = {
    zoom?: number; measuresPerLine?: number; drawTitle?: boolean;
    isCurrent?: () => boolean; onError?: (error: Error) => void;
    onRender?: (display: OpenSheetMusicDisplay) => void;
};

export async function renderMusicXml(output: HTMLElement, xml: string, options: RenderOptions = {}) {
    const display = new OpenSheetMusicDisplay(output, {
        autoResize: false, autoBeam: true, drawTitle: options.drawTitle ?? false,
        drawPartNames: false, backend: "svg",
    });
    const dispose = () => {
        disposed = true;
        observer?.disconnect();
        display.clear();
    };
    let disposed = false;
    let observer: ResizeObserver | undefined;
    try {
        await display.load(xml);
        if (options.isCurrent && !options.isCurrent()) {
            dispose();
            return {display, dispose};
        }
        display.zoom = options.zoom ?? 0.6;
        const rules = display.EngravingRules;
        rules.FixedMeasureWidth = true;
        rules.PageLeftMargin = 0.5;
        rules.PageRightMargin = 0.5;
        rules.PageTopMargin = rules.PageBottomMargin;
        rules.MeasureLeftMargin = 0.2;
        rules.MeasureRightMargin = 0;
        let lastWidth = 0;
        const draw = () => {
            if (disposed) return;
            if (options.isCurrent && !options.isCurrent()) { dispose(); return; }
            const width = output.clientWidth;
            if (!width || width === lastWidth) return;
            lastWidth = width;
            rules.RenderXMeasuresPerLineAkaSystem = width < 520 ? 2 : options.measuresPerLine ?? 4;
            try {
                display.render();
                options.onRender?.(display);
            }
            catch (error) {
                dispose();
                options.onError?.(error as Error);
            }
        };
        observer = new ResizeObserver(draw);
        observer.observe(output);
        draw();
        return {display, dispose};
    } catch (error) {
        dispose();
        throw error;
    }
}
