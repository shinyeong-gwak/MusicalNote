# @lickgo/score-engine

Obsidian과 LickGo의 공용 악보 엔진입니다. MusicalNote 저장소의 이 디렉터리에서 입력 문법, MusicXML 생성, OpenSheetMusicDisplay 설정을 관리합니다. Obsidian API나 LickGo 서버 호출에 의존하지 않습니다.

## 빌드와 가져오기

저장소 루트에서 `npm ci`, `npm run build:library`를 실행합니다. 패키지의 `dist/`에 ESM, CommonJS, TypeScript 타입 선언을 생성합니다. Obsidian은 `file:packages/score-engine` 의존성으로 이 패키지를 사용합니다.

```ts
import {parseSheet, toMusicXml, renderMusicXml} from "@lickgo/score-engine";

const sheet = parseSheet(markdownCodeBlockContent);
const xml = toMusicXml(sheet);
if (xml) {
    const renderer = await renderMusicXml(container, xml, {
        measuresPerLine: 4,
        isCurrent: () => !closed,
        onError: error => console.error(error),
    });
    // 화면이 닫히거나 악보가 교체될 때 호출합니다.
    renderer.dispose();
}
```

렌더링에는 브라우저 DOM과 ResizeObserver가 필요합니다. `parseSheet`와 `toMusicXml`은 DOM 없이 사용할 수 있습니다. 입력이 비었으면 MusicXML 생성은 null을 반환하고, 잘못된 음표·리듬·붙임줄은 오류를 발생시킵니다.

## LickGo

저장소 루트에서 다음을 실행합니다.

```sh
npm run sync:lickgo -- /path/to/PleasePracticeJazz
```

같은 소스를 번들링하여 `static/vendor/lickgo-score-engine/`에 엔진과 라이선스를 복사합니다. LickGo는 이 파일을 일반 스크립트로 읽고 `window.LickGoScore`를 사용합니다. 엔진을 수정한 뒤 이 명령을 다시 실행하고 LickGo의 정적 파일 변경도 배포합니다.

```js
const xml = LickGoScore.lickToMusicXml(savedLick);
const renderer = await LickGoScore.renderMusicXml(output, xml);
```

`fromLick`과 `lickToMusicXml`은 저장 모델의 melody/melodyRhythm/voicing/voicingRhythm과 기존 미리보기 요청의 rh/rh_r/lh/lh_r를 모두 받습니다. 반환 XML은 Obsidian에서 같은 입력을 변환한 결과와 같습니다.

LickGo Note의 미리보기와 저장 MusicXML 뷰어가 공용 엔진을 사용합니다. 서버에서 파일을 생성하는 내보내기·12키 전조 API는 Python/music21 구현을 사용합니다.

## 검증

`npm run test:engine`으로 두 입력 형식의 XML 일치, 줄바꿈 마디 경계, 박자·Tempo와 붙임줄을 검증합니다.
