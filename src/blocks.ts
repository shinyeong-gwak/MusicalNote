const fence = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`~]*)/;

export function findBlocks(markdown: string) {
    const blocks: {language: string; text: string; start: number; end: number; opening: number}[] = [];
    let active: {marker: string; language: string; start: number; opening: number} | undefined;
    let offset = 0;
    for (const line of markdown.split("\n")) {
        const match = fence.exec(line);
        if (!active) {
            if (match && (match[1].startsWith("~") || !line.slice(match[0].length).includes("`"))) {
                active = {marker: match[1], language: match[2].toLowerCase(), start: offset + line.length + 1, opening: offset};
            }
        } else if (match && match[1][0] === active.marker[0] && match[1].length >= active.marker.length &&
            !match[2] && !line.slice(match[0].length).trim()) {
            blocks.push({...active, text: markdown.slice(active.start, offset).replace(/\r?\n$/, ""), end: offset});
            active = undefined;
        }
        offset += line.length + 1;
    }
    return blocks;
}
