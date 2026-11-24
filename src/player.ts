import type { Component } from "obsidian";

export type PlaybackNote = {midi: number; beat: number; length: number};
export function readPlayback(xml: string) {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const notes: PlaybackNote[] = [];
    const ties = new Map<string, PlaybackNote>();
    const natural: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
    let division = 10080;
    let measureStart = 0;
    for (const measure of document.querySelectorAll("part > measure")) {
        let cursor = 0;
        let lastStart = 0;
        let end = 0;
        for (const element of measure.children) {
            const amount = Number(element.querySelector("duration")?.textContent ?? 0) / division;
            if (element.tagName === "attributes") {
                division = Number(element.querySelector("divisions")?.textContent ?? division);
            } else if (element.tagName === "backup") {
                cursor -= amount;
            } else if (element.tagName === "forward") {
                cursor += amount;
            } else if (element.tagName === "note") {
                const start = element.querySelector("chord") ? lastStart : cursor;
                if (!element.querySelector("chord")) {
                    lastStart = cursor;
                    cursor += amount;
                }
                end = Math.max(end, start + amount);
                const pitch = element.querySelector("pitch");
                if (!pitch) continue;
                const midi = (Number(pitch.querySelector("octave")?.textContent) + 1) * 12 +
                    natural[pitch.querySelector("step")!.textContent!] + Number(pitch.querySelector("alter")?.textContent ?? 0);
                const key = (element.querySelector("voice")?.textContent ?? "1") + ":" + midi;
                const stop = Boolean(element.querySelector('tie[type="stop"]'));
                const begins = Boolean(element.querySelector('tie[type="start"]'));
                const previous = ties.get(key);
                const current = stop && previous ? previous : {midi, beat: measureStart + start, length: 0};
                current.length += amount;
                if (!(stop && previous)) notes.push(current);
                if (begins) ties.set(key, current);
                else ties.delete(key);
            }
        }
        measureStart += end;
    }
    const tempo = Number(document.querySelector("sound[tempo]")?.getAttribute("tempo") ?? 120);
    return {notes: notes.sort((a, b) => a.beat - b.beat), beats: measureStart, tempo};
}

// A decaying harmonic piano voice, generated locally with no audio downloads.
function piano(context: AudioContext, midi: number) {
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, rate * 5, rate);
    const samples = buffer.getChannelData(0);
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const amplitudes = [1, 0.42, 0.22, 0.13, 0.08, 0.05, 0.03, 0.02];
    for (let partial = 1; partial <= amplitudes.length; partial++) {
        const hz = frequency * partial * Math.sqrt(1 + 0.00008 * partial * partial);
        if (hz >= rate / 2) break;
        const decay = 1.8 + partial * 0.55 + frequency / 2000;
        for (let i = 0; i < samples.length; i++) {
            const t = i / rate;
            samples[i] += Math.sin(2 * Math.PI * hz * t) * amplitudes[partial - 1] *
                Math.exp(-t * decay) * Math.min(1, t / 0.004) * 0.25;
        }
    }
    return buffer;
}

let stopOtherPlayer: (() => void) | undefined;

export function addPianoPlayer(container: HTMLElement, xml: string, owner: Component) {
    const score = readPlayback(xml);
    const toolbar = container.createDiv({cls: "lickgo-player", attr: {role: "group", "aria-label": "피아노 재생"}});
    const play = toolbar.createEl("button", {text: "▶ 재생", attr: {type: "button"}});
    const stop = toolbar.createEl("button", {text: "■ 정지", attr: {type: "button"}});
    const label = toolbar.createEl("label", {text: "BPM "});
    const tempo = label.createEl("input", {type: "number", attr: {min: "1", max: "999", "aria-label": "재생 BPM"}});
    tempo.value = String(score.tempo);
    const status = toolbar.createSpan({cls: "lickgo-status", text: "피아노"});
    play.disabled = !score.notes.length;
    if (!score.notes.length) status.setText("재생할 음표가 없습니다.");
    let context: AudioContext | undefined;
    let disposed = false;
    let running = false;
    let pending = false;
    let beat = 0;
    let started = 0;
    let bpm = score.tempo;
    let timer: number | undefined;
    let next = 0;
    const voices = new Set<AudioBufferSourceNode>();
    const cache = new Map<number, AudioBuffer>();
    const position = () => running && context ? beat + Math.max(0, context.currentTime - started) * bpm / 60 : beat;
    const silence = () => {
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        voices.forEach(voice => { try { voice.stop(); } catch { /* Already ended. */ } });
        voices.clear();
    };
    const pause = () => {
        beat = Math.min(score.beats, position());
        running = false;
        silence();
        play.setText("▶ 재개");
    };
    const reset = () => {
        running = false;
        beat = 0;
        silence();
        play.setText("▶ 재생");
        if (stopOtherPlayer === reset) stopOtherPlayer = undefined;
    };
    const schedule = () => {
        if (!context || !running) return;
        const current = position();
        while (next < score.notes.length && score.notes[next].beat <= current + bpm / 60 * 0.15) {
            const note = score.notes[next++];
            if (note.beat + note.length <= beat) continue;
            const noteStart = Math.max(beat, note.beat);
            const time = Math.max(context.currentTime, started + (noteStart - beat) * 60 / bpm);
            const duration = (note.beat + note.length - noteStart) * 60 / bpm;
            const voice = context.createBufferSource();
            if (!cache.has(note.midi)) cache.set(note.midi, piano(context, note.midi));
            voice.buffer = cache.get(note.midi)!;
            const gain = context.createGain();
            gain.gain.setValueAtTime(0.6, time);
            gain.gain.setValueAtTime(0.6, time + Math.max(0, duration - 0.03));
            gain.gain.linearRampToValueAtTime(0, time + duration + 0.06);
            voice.connect(gain).connect(context.destination);
            voices.add(voice);
            voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); };
            voice.start(time);
            voice.stop(time + Math.min(duration + 0.07, 5));
        }
        if (current >= score.beats) reset();
    };
    play.onclick = async () => {
        if (pending || disposed) return;
        if (running) { pause(); return; }
        const value = Number(tempo.value);
        if (!Number.isFinite(value) || value < 1 || value > 999) { status.setText("BPM은 1–999로 입력하세요."); return; }
        pending = true;
        play.disabled = true;
        try {
            context ??= new AudioContext();
            await context.resume();
            if (disposed) return;
            if (stopOtherPlayer && stopOtherPlayer !== reset) stopOtherPlayer();
            stopOtherPlayer = reset;
            bpm = value;
            next = 0;
            started = context.currentTime + 0.05;
            running = true;
            status.setText("피아노");
            play.setText("Ⅱ 일시정지");
            schedule();
            timer = window.setInterval(schedule, 40);
        } catch (error) {
            reset();
            status.setText(`재생 오류: ${(error as Error).message}`);
        } finally {
            pending = false;
            play.disabled = disposed || !score.notes.length;
        }
    };
    stop.onclick = reset;
    tempo.onchange = () => { if (running) pause(); };
    owner.register(() => {
        disposed = true;
        reset();
        cache.clear();
        void context?.close();
    });
}
