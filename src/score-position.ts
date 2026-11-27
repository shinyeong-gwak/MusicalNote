import type {OpenSheetMusicDisplay} from "opensheetmusicdisplay";
import type {Component} from "obsidian";

type Location = {beat: number; x: number; y: number; height: number};

/** Matches cursor positions from the engraved score to musical timestamps. */
export function scorePosition(output: HTMLElement, owner: Component, seek: (beat: number) => void) {
    const bar = output.createSpan({cls: "lickgo-playhead", attr: {"aria-hidden": "true"}});
    bar.hidden = true;
    let locations: Location[] = [];
    let currentBeat = 0;
    let visible = false;
    let selected = -1;
    const setPosition = (beat: number, show: boolean) => {
        currentBeat = beat;
        visible = show;
        if (!show || !locations.length) { bar.hidden = true; return; }
        let low = 0;
        let high = locations.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (locations[middle].beat <= beat + 1e-7) low = middle + 1;
            else high = middle;
        }
        const index = Math.max(0, low - 1);
        if (selected !== index || bar.hidden) {
            const point = locations[index];
            bar.style.left = point.x + "px";
            bar.style.top = point.y + "px";
            bar.style.height = point.height + "px";
            bar.hidden = false;
            selected = index;
        }
    };
    const rebuild = (display: OpenSheetMusicDisplay) => {
        const cursor = display.cursor;
        if (!cursor) return;
        locations = [];
        selected = -1;
        cursor.CursorOptions = {...cursor.CursorOptions, type: 1, follow: false};
        cursor.reset();
        cursor.show();
        const origin = output.getBoundingClientRect();
        while (!cursor.Iterator.EndReached) {
            cursor.update();
            const bounds = cursor.cursorElement.getBoundingClientRect();
            const beat = cursor.Iterator.CurrentSourceTimestamp.RealValue * 4;
            if (bounds.height > 0 && Number.isFinite(beat)) {
                locations.push({
                    beat, x: bounds.left - origin.left + output.scrollLeft,
                    y: bounds.top - origin.top + output.scrollTop, height: bounds.height,
                });
            }
            cursor.next();
        }
        cursor.reset();
        cursor.hide();
        locations.sort((a, b) => a.beat - b.beat);
        setPosition(currentBeat, visible);
    };
    const click = (event: MouseEvent) => {
        const target = event.target;
        if (!locations.length || !(target instanceof Element) || !target.closest("svg") || !output.contains(target)) return;
        // A drag selecting text or scrolling should not seek.
        const selection = output.ownerDocument.getSelection();
        if (selection && !selection.isCollapsed) return;
        const bounds = output.getBoundingClientRect();
        const x = event.clientX - bounds.left + output.scrollLeft;
        const y = event.clientY - bounds.top + output.scrollTop;
        let nearest = locations[0];
        let distance = Infinity;
        for (const point of locations) {
            const vertical = Math.max(point.y - y, y - point.y - point.height, 0);
            const score = vertical * 10000 + Math.abs(point.x - x);
            if (score < distance) { nearest = point; distance = score; }
        }
        event.stopPropagation();
        seek(nearest.beat);
    };
    output.addEventListener("click", click);
    owner.register(() => { output.removeEventListener("click", click); bar.remove(); locations = []; });
    return {setPosition, rebuild};
}
