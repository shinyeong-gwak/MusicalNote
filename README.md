# LickGo Note

LickGo의 Note 문법과 악보 입력을 Obsidian 보관함에서 사용합니다. 악보 변환과 SVG 렌더링은 기기에서 처리하며 LickGo 서버나 네트워크 연결이 필요하지 않습니다.

## BRAT으로 설치

GitHub 릴리스 게시 후 iOS 또는 데스크톱 Obsidian에서 **BRAT: Add a beta plugin for testing**을 실행합니다. 플러그인 GitHub 저장소 주소를 넣고 **Latest version**을 선택합니다. 설치 후 커뮤니티 플러그인에서 **LickGo Note**를 활성화합니다.

릴리스 태그와 이름은 `manifest.json`의 버전과 일치해야 하며, GitHub Releases에 `manifest.json`, `main.js`, `styles.css`를 개별 파일로 첨부합니다. 비공개 저장소의 경우 BRAT에 해당 저장소의 Contents 읽기 권한이 있는 토큰을 등록해야 합니다. [BRAT 개발자 가이드](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)

## 수동 설치

1. 보관함 설정 폴더 아래 `plugins/lickgo-note`를 만듭니다. 기본 경로는 `<보관함>/.obsidian/plugins/lickgo-note/`입니다.
2. `manifest.json`, `main.js`, `styles.css`, `main.js.LEGAL.txt`, `opensheetmusicdisplay.LICENSE.txt`를 그 폴더에 복사합니다.
3. Obsidian을 다시 열고 커뮤니티 플러그인에서 **LickGo Note**를 활성화합니다. 모바일에서 보관함을 동기화하는 경우 플러그인 파일도 모바일 기기에 복사되어 있어야 합니다.

데스크톱에서는 리본의 음표 아이콘 또는 명령 팔레트를 사용합니다. 모바일에서는 **설정 → 인터페이스 → 모바일 툴바 설정 → 명령 추가**에서 **LickGo Note: 악보 블록 삽입**과 **LickGo Note: 코드 블록 삽입**을 고를 수 있습니다. [Obsidian 모바일 툴바 안내](https://help.obsidian.md/mobile#Mobile+toolbar)

Obsidian의 실시간 미리보기와 소스 모드를 모두 사용할 수 있습니다. 편집 화면 메뉴에서 실시간 미리보기를 선택하면 코드표와 악보를 편집 중에도 렌더링합니다. 읽기 모드에서도 동일하게 렌더링됩니다.

## 음악 키보드

모바일 툴바의 **명령 추가**에서 **LickGo Note: 음악 키보드 열기**를 추가합니다. 데스크톱에서는 명령 팔레트나 리본 메뉴에서 열 수 있습니다.

`sheet` 또는 `chord` 블록 안에 커서를 놓고 명령을 실행합니다. 패널 안에서 항목을 바꾸고 음악 버튼으로 입력한 뒤 **적용**을 누르면 노트에 저장됩니다. **취소**하면 패널에서 입력한 내용이 버려집니다.

## 코드 진행

````markdown
```chord
| **Dm7** G7(b9) | CM7/E | Fh7 Bb7 | EbM7 |
> | II–V | 토닉 | II–V | 토닉 |
```
````

기존처럼 `|`로 마디를 나누고, 한 마디 안의 코드는 공백으로 구분합니다. `**...**` 강조, `>` 아랫단 주석, 분수 코드, `h` 반감7 표기가 적용됩니다. 코드 블록에 직접 입력한 심벌을 탭하면 해당 마디 아래의 주석을 편집하고, 길게 누르면 핑크 강조를 켜거나 끕니다. 키보드로는 Enter로 주석을 열고 Shift+Enter로 강조를 전환할 수 있습니다. LickGo의 `/seq[...]` 표시는 텍스트로 남습니다.

기존 `chord[이름]` 및 `sheet[이름]`은 한 줄에 단독으로 적습니다. 현재 노트에서 `name: 이름`이 붙은 `sheet` 블록을 먼저 찾아 사용합니다. 또는 Obsidian 링크 경로로 같은 이름의 Markdown 파일을 찾아 첫 `sheet` 또는 `chord` 블록을 사용합니다. `chord[]`는 `chord` 블록이 없으면 `sheet`의 `chords` 항목을 그립니다. LickGo에 저장된 데이터는 해당 블록에 붙여 넣어야 합니다.

## 악보

악보 위의 플레이어에서 피아노 재생·일시정지·정지를 할 수 있습니다. 플레이어의 체크박스는 기본으로 켜져 있으며 8분음표를 5.8:4.2의 가벼운 스윙으로 재생합니다. 체크를 끄면 스트레이트로 재생하고, 변경하면 처음으로 돌아갑니다. Tempo를 생략하면 120 BPM이며 플레이어에서 BPM을 바꿀 수도 있습니다. 멜로디와 왼손 보이싱의 실제 음표를 재생하고 붙임줄·쉼표를 반영합니다. 코드 기호만 있는 악보에는 재생할 음표가 없습니다. 피아노 음색은 기기에서 합성하므로 오프라인에서도 사용합니다.

첫 줄에 `Tempo: 120 Time: 4/4`를 적습니다. Tempo는 4분음표 기준 BPM이며 악보에 표시됩니다. Time은 `3/4`, `4/4`, `6/8`, `5/4`, `7/4`, `9/4`, `7/8`, `9/8`을 지원합니다. 항목별 줄바꿈이나 ABC 스타일의 `Q: 1/4=120`, `M: 6/8`도 사용할 수 있습니다. 기존 `time: 3/4` 설정도 동작합니다.

줄 끝의 `|`와 다음 줄 첫 `|`는 하나의 마디 경계로 처리합니다. 같은 줄의 `||` 빈 마디는 유지됩니다.

````markdown
```sheet

chords
---
| Dm7 G7(b9) | CM7/E |

melody
---
| D4 F4 G4 B4 | C5 |

melody_rhythm
---
| 4 *4 | 1 |

voicing
---
| D3-F3-A3 G2-B2-F3 | C3-E3-B3 |

voicing_rhythm
---
| 2 2 | 1 |
```
````

다섯 항목에 LickGo에서 쓰던 내용을 붙여 넣습니다. 각 항목은 비워둘 수 있습니다. 첫 항목 위에 `key: Eb`, `time: 3/4`, `grid: 8`, `name: 제목`을 필요한 만큼 추가할 수 있습니다. 기본값은 C, 4/4, Grid 8입니다.

- `|`는 마디 경계입니다. 첫 `|` 앞에 입력하고 첫 마디 리듬이 박자보다 짧으면 못갖춘마디가 됩니다.
- `C4-E4-G4`는 동시 음표입니다. 옥타브를 생략하면 각 손의 음역에서 직전 음과 가장 가까운 음을 고릅니다.
- `!`는 음표 자리의 쉼표, 리듬의 `!8`은 음표를 소비하지 않는 8분쉼표입니다. `4 *4`는 4분음표 리듬을 네 번 반복합니다.
- `C4~` 또는 `4~`는 다음 같은 음으로 붙임줄을 연결합니다. 리듬을 비워 두면 Grid를 사용합니다.

MusicXML 변환은 LickGo의 파서 동작을 TypeScript로 옮겼고, 렌더러는 LickGo Note와 같은 OpenSheetMusicDisplay 1.9.2를 번들에 포함합니다. LickGo의 Python / music21 출력과 MusicXML 파일 구조나 조판 세부는 달라질 수 있습니다.

소스에서 빌드하려면 `npm ci`와 `npm run build`를 실행합니다.


## 공용 악보 엔진

파서와 MusicXML 변환, 악보 렌더러는 [packages/score-engine](packages/score-engine/README.md)에 있습니다. Obsidian은 이 패키지를 직접 사용하고, LickGo에는 `npm run sync:lickgo -- /path/to/PleasePracticeJazz`로 같은 소스의 브라우저 번들을 전달합니다. 입력 문법이나 조판 변경은 공용 패키지에서 수정합니다.

Shift（Ctrl/Cmd도 가능）를 누른 채 편집기의 `chord`·`sheet` 코드 블록이나 참조 줄 위에 마우스를 올리면 별도 미리보기가 나타납니다. 키를 놓거나 Escape를 누르면 닫힙니다.

리듬 `6`은 4분 셋잇단음표(⅔박), `12`는 8분 셋잇단음표(⅓박)입니다. 잇단음표나 잇단쉼표가 포함된 박은 양손 모두 스윙을 적용하지 않아 원래 길이와 동시성을 유지합니다.

악보 재생 중에는 세로 바가 현재 위치를 표시합니다. 악보의 음표나 쉼표 부근을 클릭·탭하면 가장 가까운 시점부터 재생하며, 일시정지 시에는 바가 그 위치에 머무르고 정지 시에는 사라집니다.
