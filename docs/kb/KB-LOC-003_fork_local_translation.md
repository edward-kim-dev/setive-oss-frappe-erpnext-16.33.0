---
id: KB-LOC-003
title: 번역 문자열 추가 규약 — 앱 ko.po 에 쓰고 포크 main.pot 만 갱신 (msgctxt)
domain: 한글화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@16.31.0
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-14
verified_by: babel read_po 실측 + 번역 사전 런타임 조회(8/8) + v16.33.0 리베이스 시 main.pot·ko.po diff 실측 + v16.34.1 대비 main.pot 줄 수·충돌 집합 실측 + babel read_po→write_mo→read_mo 라운드트립 34/34 적중(§10.5) + frappe/erpnext ko.po 번역률·출처 전수 대조
related: [KB-LOC-002, KB-KOR-001, KB-OPS-001]
---

# KB-LOC-003: 번역 문자열 추가 규약

## 1. 요약

**번역은 앱 `setive_erpnext_kr/locale/ko.po` 에 씁니다. 포크의 `erpnext/locale/ko.po` 는 건드리지 않습니다.**

포크의 `ko.po` 는 Crowdin 봇이 통째로 덮어쓰는 파일이고([`crowdin.yml`](../../crowdin.yml) 이 `/erpnext/locale/%two_letters_code%.po` 를 관리), upstream 태그로 리베이스할 때마다 충돌원이 됩니다. 실제로 2026-09-06 리베이스에서 포크 `ko.po` 를 고친 SETIVE 커밋 1건이 드롭됐습니다(§6).

포크에 남는 것은 `main.pot` 하나입니다. Crowdin 이 읽는 **source** 이고 포크의 `__()` 호출에서 추출되는 결과물이므로 포크에 있어야 합니다.

| 파일 | 소유 | 무엇을 쓰는가 |
|---|---|---|
| `setive_erpnext_kr/locale/ko.po` | **앱 (저장소 B)** | 한국어 번역 전부. 신규 문자열도, erpnext/frappe 기존 번역의 교정도 |
| [`erpnext/locale/main.pot`](../../erpnext/locale/main.pot) | 포크 | 포크가 새로 만든 `__()` msgid 만. `msgstr ""` (§5) |
| [`erpnext/locale/ko.po`](../../erpnext/locale/ko.po) | upstream/Crowdin | **쓰지 않는다.** 현재 v16.33.0 원본과 바이트 동일 |

앱 번역이 이기는 근거: Frappe 는 설치 앱을 순회하며 번역 사전을 병합하고 **나중 앱이 앞 앱을 덮어씁니다**(`frappe/translate.py`). 앱 `hooks.py` 의 `required_apps = ["erpnext"]` 가 erpnext 뒤 설치를 강제하므로 순서가 보장됩니다. 런타임 조회 8/8 로 실측했습니다(§8.2).

## 2. 어디에 쓸지 판정

```
새 UI 문자열이 필요하다
  │
  ├─ 문자열이 앱 코드의 __() 호출이다        → 앱 ko.po (+ 앱 main.pot 이 필요하면 앱 쪽에서 추출)
  ├─ 문자열이 포크 코드의 __() 호출이다      → 앱 ko.po + 포크 main.pot (§5)
  └─ erpnext/frappe 기존 번역이 오역이다     → 앱 ko.po 에서 같은 (msgid, msgctxt) 재정의
```

세 경우 모두 **번역값이 들어가는 곳은 앱 `ko.po` 하나**입니다.

세 번째가 실제 사례입니다 — 포크 `ko.po` 의 `Stores` → `백화점` 오역 때문에 위저드 기본 창고가 `백화점 - <약어>` 로 생성됐습니다. 앱 `ko.po` 에서 `Stores` → `창고` 로 재정의해 해결했습니다(KB-KOR-002 §9-7, KB-KOR-003 §5). 런타임 확인은 §8.2.

## 3. 일반 단어 msgid 에는 반드시 `msgctxt` 를 붙인다

```javascript
__("Manufacturing", null, "KSIC")     // ✅ "제조업"
__("Manufacturing")                   // ❌ "조작"  ← 모듈명 문맥의 기존 번역
```

Frappe 의 `__(txt, replace, context)` 는 `frappe._messages["<msgid>:<msgctxt>"]` 를 먼저 찾고, 없으면 컨텍스트 없는 키로 폴백합니다(`frappe/public/js/frappe/translate.js`).
`msgctxt` 가 있으면 babel 카탈로그에서 **별개 항목**이 되므로 기존 번역과 충돌하지 않습니다.

컨텍스트가 필요한 신호: msgid 가 한 단어이거나, ERPNext 의 모듈명·DocType명·상태값과 겹치는 흔한 명사일 때.

**원본 호출과 `msgctxt` 가 정확히 같아야 합니다.** 원본이 `__("Manufacturing", null, "KSIC")` 이면 앱 `ko.po` 에도 `msgctxt "KSIC"` 가 있어야 매칭됩니다. 컨텍스트 없는 항목으로 적으면 조용히 무시됩니다.

한글을 소스에 하드코딩하지 않습니다. 영문 로케일도 지원 대상(`en, ko, ja, zh, zh-TW`)입니다.

## 4. 앱 `ko.po` 작성 규칙

파일은 손으로 관리합니다. 헤더에 같은 취지의 주석이 있습니다.

- **`bench update-po` 를 이 파일에 실행하지 않습니다.** babel 의 obsolete 처리로 소스에서 추출되지 않는 수동 msgid(= frappe 코어 문자열 재정의분)가 삭제됩니다.
- 항목마다 `# 원본 위치: <경로>:<라인>` 주석을 답니다. 앱이 아니라 포크·frappe 소스를 가리키는 경우가 대부분이라 이 주석이 유일한 역참조입니다.
- 중복 키는 만들지 않습니다 — §7 의 함정이 그대로 적용됩니다.
- **전역 정렬은 요구되지 않습니다.** 이 파일은 Crowdin 도 CI 도 재생성하지 않으므로 `main.pot` 과 달리 babel 정렬키에 맞출 이유가 없습니다. 대신 `# --- <제목> ---` 블록으로 묶습니다. 현재 10블록 124엔트리(중복 0):

| 블록 | 블록 내 정렬 | 내용 |
|---|---|---|
| KSIC 한국표준산업분류 제11차 대분류 | msgid 알파벳순 | `msgctxt "KSIC"` 21건 (KB-KOR-001) |
| 셋업 기본 마스터 명칭 오역 교정 | — | `Stores` → `창고` 1건 |
| 셋업 위저드 한국어 | 위저드 UI 등장 순 | 포크 `ko.po` 에서 이관한 43건 (§6.1) |
| frappe 코어 검증·설정 메시지 | — | 문서 저장·검증 메시지 25건 |
| 셋업 위저드 "계정 설정" 슬라이드 | 화면 등장 순 | frappe `user` 슬라이드 7건 (§10) |
| 위저드 셸 버튼 | — | `Previous` · `Next` 2건, **무맥락** (§10.2) |
| 비밀번호 강도 표시기 | 강도 오름차순 | 5건. `Average` 는 의도적 미번역 (§10.3) |
| 필수·형식 검증 모달 | — | `field_group.js` · `data.js` 6건 |
| 테마 전환 다이얼로그 | — | `theme_switcher.js` 8건 + `desk_theme` 형제 옵션 2건 |
| Fieldtype Select 오염 가드 | — | `msgctxt` 4건, `msgstr` 이 원문과 같음 (§10.4) |

**컴파일은 [`Makefile`](../../Makefile) 의 `make po` 로 충분합니다.** `compile_translations(target_app=None, ...)` 은 `frappe.get_all_apps(True)` 를 순회하므로 앱 `ko.po` 도 함께 MO 로 컴파일됩니다(`frappe/gettext/translate.py:247-248`). 앱 하나만 좁혀 돌리려면(배포 스크립트 등, KB-OPS-001 §5.1):

```bash
bench --site "$SITE" execute frappe.gettext.translate.compile_translations \
  --kwargs "{'target_app':'setive_erpnext_kr','locale':'ko','force':True}"
bench --site "$SITE" clear-cache
```

## 5. `main.pot` 은 포크에 유지한다

`main.pot` 은 Crowdin 의 **source** 이고 upstream CI(`.github/workflows/generate-pot-file.yml`)가 포크 소스의 `__()` 호출에서 재생성합니다. 포크가 `setup_wizard.js` 에 새 `__()` 를 넣었다면 그 msgid 는 `main.pot` 에 있어야 재생성이 no-op 이 됩니다.

- 위치: babel 정렬키 `(msgid, msgctxt)` 기준 정렬 위치
- `#: <경로>:<라인>` 위치 주석 포함. 다중행 `__()` 호출은 **문자열 리터럴이 있는 줄**을 가리킴
- `msgstr ""` — **번역값을 넣지 않습니다.** 번역은 앱 `ko.po` 담당

```
#: erpnext/public/js/setup_wizard.js:70
msgctxt "KSIC"
msgid "Manufacturing"
msgstr ""
```

현재 포크의 `main.pot` 델타는 KSIC 21블록 +105줄 하나뿐입니다(삭제 0).

> **미결 선택지.** 이 105줄은 런타임에 아무 영향이 없고(번역은 앱 `ko.po` 가 담당), `v16.33.0..v16.34.1` 구간에서 upstream 이 `main.pot` 을 `+510/−472` 로 바꾸는 **유일한 리베이스 충돌원**입니다. 포크에서 `main.pot` 변경을 통째로 철회하면 다음 리베이스 충돌이 0 이 되지만, Crowdin 이 이 msgid 들을 모르는 상태가 됩니다. 사람 결정 사항입니다.

### 5.1 알려진 정렬 위반 1건

`main.pot` 전체 10,153 엔트리 중 유일한 babel 정렬 위반이 SETIVE 삽입분에 있습니다.

```bash
grep -n 'msgid "Activities of' erpnext/locale/main.pot
# 2452  ... households as employers ...      ← 앞
# 2457  ... extraterritorial organizations   ← 뒤 (정렬키상 이쪽이 먼저여야 한다)
```

babel 2.16 의 `Message.__cmp__` 정렬키는 `(msgid, msgctxt)` 이므로 `Activities of e…` 가 `Activities of h…` 보다 앞이어야 합니다. 런타임 영향은 없지만 pot 재생성 시 이 두 블록이 뒤바뀐 diff 가 생기고 다음 리베이스의 충돌 해석을 어렵게 합니다. 앱 `ko.po` 는 두 항목을 올바른 순서로 갖고 있습니다.

## 6. 리베이스 시 `main.pot` 충돌 해소 절차

2026-09-06 `develop`(17.0.0-dev) → 태그 `v16.33.0` 리베이스에서 실제로 쓴 절차입니다. `ko.po` 는 포크가 손대지 않으므로 충돌 대상이 `main.pot` 하나로 줄어 있어야 정상입니다.

> **태그를 변수로 두십시오.** 아래는 `v16.33.0` 리베이스에서 쓴 것이지만 명령 자체는 태그에 의존합니다. 옛 태그 리터럴을 그대로 실행하면 upstream 변경분을 통째로 되돌리면서 **검증 3종이 모두 통과합니다.**

```bash
NEW=v16.33.0          # ← 올리는 태그로 바꾼다 (예: v16.34.1)

# 1. 새 태그의 원본을 그대로 채택 (SETIVE 델타를 여기서 섞지 않는다)
git show "$NEW":erpnext/locale/main.pot > erpnext/locale/main.pot

# 2. SETIVE 블록만 정렬 위치에 다시 삽입 (삭제 0, 순수 추가여야 한다)
#    삽입 후 확인 — 기대: 105 0
git diff --numstat "$NEW"..HEAD -- erpnext/locale/main.pot

# 3. 원본 바이트가 보존됐는지 줄 수로 확인 — 기대: <원본> + 105
git show "$NEW":erpnext/locale/main.pot | wc -l    # v16.33.0 → 63449 / v16.34.1 → 63487
wc -l erpnext/locale/main.pot                       # 위 + 105 (63554 / 63592)

# 4. 위치 주석의 줄번호가 실제 소스와 맞는지
grep -n 'setup_wizard.js:' erpnext/locale/main.pot | grep -A1 KSIC
```

**핵심은 3-way 병합에 맡기지 않고 upstream 원본을 통째로 채택한 뒤 SETIVE 블록만 다시 넣는 것입니다.** `main.pot` 은 6만 줄이고 upstream 이 매 릴리스마다 대량으로 재생성하므로, 병합 마커를 손으로 푸는 방식은 원본 바이트를 오염시킵니다.

### 6.1 이번 리베이스에서 드롭한 커밋

| 커밋 | 내용 | 처리 |
|---|---|---|
| `6f7a6b8116` 셋업 위저드 한국어 번역 보강 | 포크 `erpnext/locale/ko.po` 전용 | **드롭.** 번역 43건을 앱 `ko.po` 로 이관 |

이관 후 확인한 것:

- 앱 `ko.po` 엔트리 65 = 기존 커밋분 22 + 이관분 43(`git diff --numstat` +136/−0). 누락 0, 값 불일치 0, 중복 msgid 0
- 런타임 조회 8/8 (`Manufacturing/KSIC`→제조업, `Stores`→창고, `Your Language`→사용 언어 등)
- 포크 `erpnext/locale/ko.po` 는 v16.33.0 원본과 바이트 동일 (`git diff v16.33.0..HEAD -- erpnext/locale/ko.po` 무출력)

> **~~2026-09-07 시점 미결.~~ 2026-09-14 해소.** 이관분 43건은 앱 저장소에 커밋됐습니다(작업트리 clean). 아래는 당시 서술이며 기록으로만 남깁니다 — 이관분 43건이 작업트리에만 있어 백업 브랜치 `backup/develop-17dev-20260906` 의 드롭 커밋에서만 복원 가능한 상태였습니다.

이관분 중 5건(`Wholesale / Distribution`, `Services / Consulting`, `Construction / Real Estate`, `Technology / Software`, `Food & Beverage`)은 KSIC 교체 커밋(`2d7c4e6b33`)이 [`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js) 에서 지운 **옛 industry 옵션값**이며 포크·frappe 양쪽에 참조가 0건입니다. 살아 있는 문자열로 오인하지 않도록 앱 `ko.po` 에 그 취지의 주석을 답니다.

## 7. 중복 msgid 함정

babel 의 `read_po()` 는 동일 `(msgid, msgctxt)` 가 여러 번 나오면 **첫 항목만 채택**하며, 첫 항목의 `msgstr` 이 비어 있어도 그것을 씁니다. 실측:

| 파일 상태 | 최종 채택 |
|---|---|
| 1번째 `msgstr ""` + 2번째 `msgstr "SECOND"` | `""` (2번째 무시) |
| 1번째 `msgstr "FIRST"` + 2번째 `msgstr "SECOND"` | `"FIRST"` |
| 1번째 컨텍스트 없음 + 2번째 `msgctxt "CTX"` | 각각 별개로 유지 |

→ **한 파일 안에서 파일 끝에 덧붙이는 방식으로는 이미 존재하는 msgid 의 번역을 바꿀 수 없습니다.**

단 이것은 **파일 내부** 규칙입니다. 앱 `ko.po` 가 포크 `ko.po` 를 이기는 것은 별개 메커니즘(앱 순회 병합, §1)이라 이 함정과 무관합니다.

## 8. 검증

### 8.1 중복·정렬 검사

중복 키 검사 — 두 파일 모두 기대 0건. 앱 `ko.po` 는 형제 저장소에 있습니다.

```bash
TARGET=../setive_erpnext_kr/setive_erpnext_kr/locale/ko.po   # 또는 erpnext/locale/main.pot

python3 - "$TARGET" <<'PY'
import io, sys
from collections import defaultdict
raw = io.open(sys.argv[1], encoding="utf-8").read()
def val(lines, kw):
    for i, ln in enumerate(lines):
        if ln.startswith(kw + " "):
            parts = [ln[len(kw)+1:].strip()]; j = i + 1
            while j < len(lines) and lines[j].startswith('"'):
                parts.append(lines[j].strip()); j += 1
            return "".join(p[1:-1] for p in parts if len(p) >= 2)
occ = defaultdict(list)
for b in raw.rstrip("\n").split("\n\n")[1:]:
    L = b.split("\n"); mid = val(L, "msgid")
    if mid is not None:
        occ[(mid, val(L, "msgctxt") or "")].append(val(L, "msgstr") or "")
dups = {k: v for k, v in occ.items() if len(v) > 1}
harmful = {k: v for k, v in dups.items() if v[0] == "" and any(v[1:])}
print("항목", sum(len(v) for v in occ.values()), "| 중복", len(dups), "| 치명", len(harmful))
for k in harmful: print("  ", k)
PY
```

정렬 검사는 **babel 로만** 합니다(`main.pot` 전용). 손으로 문자열을 비교하면 이스케이프·다중행 msgid 때문에 거짓 위반이 다수 나옵니다 — 실측에서 순수 파이썬 비교는 9건, babel 은 1건을 보고했습니다.

```bash
docker compose -f docker/development/docker-compose.yml exec -T backend \
  /home/frappe/frappe-bench/env/bin/python -c "
from babel.messages.pofile import read_po
import io
cat = read_po(io.open('apps/erpnext/erpnext/locale/main.pot', encoding='utf-8'))
keys = [(m.id if isinstance(m.id, str) else m.id[0], m.context or '') for m in cat if m.id]
bad = [(a, b) for a, b in zip(keys, keys[1:]) if a > b]
print('entries', len(keys), 'sort violations', len(bad))
for a, b in bad: print(' ', a[0][:50], '->', b[0][:50])
"
```

실측(babel 2.16.0): `entries 10153 sort violations 1` — §5.1 의 알려진 1건입니다.

포크 `ko.po` 를 건드리지 않았는지 — 무출력이어야 합니다.

```bash
git diff v16.33.0..HEAD -- erpnext/locale/ko.po
```

### 8.2 반영 및 해석 확인

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"

$EXEC bench --site $SITE execute frappe.gettext.translate.compile_translations \
  --kwargs "{'target_app':'setive_erpnext_kr','locale':'ko','force':True}"
$EXEC bench --site $SITE clear-cache

# 앱 번역이 포크 번역을 이겼는지. 기대: 제조업 / 창고
$EXEC bench --site $SITE execute frappe.translate.get_all_translations \
  --kwargs "{'lang':'ko'}" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('Manufacturing:KSIC'), '/', d.get('Stores'))"
```

`Stores` 가 `백화점` 으로 나오면 앱 `ko.po` 가 로드되지 않은 것입니다 — 컴파일 대상 앱(`target_app`)과 `clear-cache` 를 먼저 확인합니다.

## 9. 이전 서술 정정

- **"포크 `ko.po` 와 `main.pot` 양쪽에 넣는다"는 초판 규약을 철회합니다** (2026-09-07). Crowdin 봇이 포크 `ko.po` 를 통째로 덮어쓰는 PR 을 최근 1년 15회 보냈고, 2026-09-06 v16.33.0 리베이스에서 포크 `ko.po` 전용 커밋(`6f7a6b8116`)이 실제로 드롭됐습니다. 번역은 앱 `setive_erpnext_kr/locale/ko.po` 에 씁니다. `main.pot` 은 Crowdin source 이므로 포크에 유지합니다(§5).
- **초판 §2.4 "frappe 코어 문자열은 포크 `ko.po` 맨 끝 비정렬 블록에 둔다"도 함께 철회합니다.** `erpnext/hooks.py` 의 `ignore_translatable_strings_from = ["frappe"]` 때문에 frappe 문자열이 erpnext `main.pot` 에 추출되지 않는다는 근거 자체는 지금도 맞지만, 결론은 "포크 파일 끝"이 아니라 "앱 `ko.po`"입니다. 앱 파일은 Crowdin·CI 재생성 대상이 아니라 위치 제약이 없습니다.
- **초판 §5 의 "`erpnext/translations/ko.csv` 로 옮기는 대안"은 더 이상 검토 대상이 아닙니다.** 앱 `ko.po` 가 같은 목적(Crowdin 비관리 경로)을 달성하면서 MO 로딩 순서 문제도 없습니다. CSV 는 로드 순서가 `csv` → `mo` 라 같은 키가 PO 에 있으면 무시됩니다(KB-LOC-002 §2).
- 초판은 이 문서를 "포크 로컬 번역" 규약으로 불렀습니다. 제목을 바꿨으나 파일명과 ID(`KB-LOC-003`)는 링크 정합을 위해 유지합니다.
- **2026-09-14: §6 step 1 의 `git checkout --theirs` 주석이 뒤집혀 있었습니다.** "rebase 중에는 `--theirs` 가 upstream 쪽" 이라고 적었으나 반대입니다 — `git help rebase` 의 `-m` 항목이 "the side reported as ours is the so-far rebased series, starting with `<upstream>`, and theirs is the working branch" 라고 명시합니다. 즉 rebase 중 `--ours` 가 upstream(새 태그) 쪽이고 `--theirs` 는 재생되는 SETIVE 커밋 쪽입니다. 그 명령은 §6 이 막으려던 '포크의 낡은 pot' 을 꺼냅니다. 다음 줄의 `git show` 가 덮어써 실해는 없었지만 **줄 자체를 삭제**했습니다 — `git show` 하나로 충분합니다.
- **2026-09-14: §6 의 명령과 기대 줄 수가 `v16.33.0` 에 하드코딩돼 있었습니다.** 다른 태그로 올리며 그대로 실행하면 `git show v16.33.0:…` 이 upstream 변경분(`v16.34.1` 기준 `+510/−472`)을 통째로 되돌리는데, **검증 3종이 전부 통과합니다** — `--numstat` 는 `105 0`, 줄 수는 63554 로 맞아떨어지기 때문입니다. `NEW` 변수로 일반화하고 태그별 기대값(v16.33.0 → 63449, v16.34.1 → 63487)을 병기했습니다. 실측으로 확인: `git show <태그>:erpnext/locale/main.pot | wc -l`.
- **2026-09-14: §3 의 "일반 단어에는 반드시 `msgctxt`" 를 무조건 규칙으로 읽으면 안 됩니다 — 폴백은 한 방향입니다.** `frappe/gettext/translate.py:371-375` 를 실측하면 MO 적재 시 `msgctxt` 가 있는 항목은 `"<msgid>:<msgctxt>"` 키 **하나만** 만들고 무맥락 키는 만들지 않습니다(같은 함수 docstring 의 "맥락 있는 번역을 무맥락으로도 쓴다"는 주장은 코드와 다릅니다). 반대로 `translate.js:12-18` 은 ctx 키 실패 시 무맥락 키로 폴백합니다. 따라서 **무맥락 엔트리 1건이 ctx 호출과 무맥락 호출을 모두 덮고, ctx 전용 엔트리는 무맥락 호출을 못 덮습니다.** §3 의 규칙은 "다른 문맥의 기존 번역과 충돌할 때"에만 적용해야 하며, 충돌이 없다면 무맥락이 커버리지가 넓어 유리합니다. 실제 적용은 §10.2.
- **2026-09-14: 앱 `ko.po` 의 `Company Abbreviation cannot have more than 5 characters` 역어가 "10자" 였습니다.** 원문도 코드도 5자입니다([`erpnext/public/js/setup_wizard.js:338`](../../erpnext/public/js/setup_wizard.js)). 사용자가 10자까지 된다고 읽고 6자를 넣었다가 다시 막히는 사실관계 오류라 "5자" 로 교정했습니다.

## frappe 코어 메시지 번역

frappe 는 한국어 번역률이 매우 낮습니다(2026-09-07 기준 사이트 전체 ko 키 5,705건 중 frappe 몫은 소수). 결과적으로 위저드·문서 저장에서 **영문 메시지와 한국어 라벨이 섞여** 나옵니다.

```
통화 기호 숨기기 cannot be "0". It should be one of "", "No", "Yes"
   └ 라벨만 번역됨          └ frappe 코어 메시지 msgid 가 미번역
```

원본은 [`frappe/model/base_document.py`](https://github.com/frappe/frappe) 의 `_('{0} {1} cannot be "{2}". It should be one of "{3}"')` 입니다. frappe 는 우리 포크가 아니므로 **앱 `locale/ko.po` 에 msgid 를 그대로 넣어 덮습니다** — 설치 앱 순회에서 나중 앱이 이기는 성질을 그대로 씁니다.

2026-09-07 에 위저드·문서 저장 경로에서 사용자가 실제로 마주치는 25건을 추가했습니다(검증 실패·필수 항목 누락·제출 후 수정 금지 등).

**주의**: 단독 `"Yes"`/`"No"` msgid 는 아직 번역하지 않았습니다. 전 UI 의 모든 Yes/No 를 바꾸는 광범위한 오버라이드이고, Select 옵션 표시와 확인 대화상자 등 영향 범위가 넓어 별도 판단이 필요합니다. 위 오류 메시지에서 옵션이 `"", "No", "Yes"` 로 영문으로 보이는 이유입니다.

## 10. 셋업 위저드 "계정 설정" 슬라이드 한글화 (2026-09-14)

`Let's set up your account` 슬라이드가 통째로 영문이라는 보고로 시작한 작업입니다. 원인은 단순합니다 — **이 슬라이드는 erpnext 가 아니라 frappe 코어가 그리고, frappe 의 `ko.po` 는 6,240 엔트리 중 27건(0.4%)만 번역돼 있습니다.** erpnext 는 55.1%(10,110 중 5,571)입니다. 그래서 erpnext 가 붙이는 앞뒤 슬라이드만 한국어로 보였습니다.

앱 `ko.po` 에 34건을 추가했습니다(124엔트리, 중복 0). 포크는 한 줄도 바뀌지 않았습니다.

### 10.1 이 슬라이드는 `developer_mode` 가 켜져 있으면 렌더되지 않는다

```javascript
// frappe/desk/page/setup_wizard/setup_wizard.js:87
if (!(s.name === "user" && frappe.boot.developer_mode)) {
	frappe.setup.add_slide(s);
}
```

[`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml) 의 configurator 가 `bench set-config -g developer_mode 1` 을 실행하므로 **로컬 개발 스택에서는 이 슬라이드가 존재하지 않습니다.** 화면으로 확인하려면 `developer_mode` 를 끄고 셋업이 끝나지 않은 신규 사이트가 필요합니다(`localhost` 는 이미 완료 상태라 `/app/desk` 로 리다이렉트됩니다).

→ 반영 검증은 화면이 아니라 **번역 사전 조회**로 합니다(§10.5).

### 10.2 위저드 버튼은 `msgctxt` 없이 등록한다

`slides.js` 는 `__("Next", null, "Go to next slide")` 처럼 컨텍스트를 넘깁니다. 그럼에도 앱 `ko.po` 에는 **무맥락으로** 넣었습니다. 근거는 폴백의 비대칭입니다(§9 정정 항목).

| 등록 방식 | 위저드 버튼(ctx 호출) | `form_tour`·`web_form`·`onboarding_tours`·`slideshow`(무맥락 호출) |
|---|---|---|
| `msgctxt` 부착 | 덮음 | **영문으로 남음** (Next 7곳 · Previous 5곳) |
| **무맥락 (채택)** | 덮음 (폴백) | 덮음 |

`erpnext/locale/ko.po` 에 두 msgid 모두 없어 회귀 위험은 0 입니다(실측).

`Complete Setup` 은 이미 무맥락 엔트리가 있어 추가하지 않았습니다. frappe 의 ctx 엔트리는 `msgstr` 이 비어 MO 에서 탈락하므로, **지금 그 버튼을 번역하고 있는 것은 앱의 무맥락 엔트리입니다.** "호출부가 없는 고아" 로 오인해 지우지 마십시오.

### 10.3 `Average` 는 의도적으로 비워 둔다

비밀번호 강도 4단계 중 `Average` 만 번역하지 않았습니다. 무맥락 `Average` 가 집계함수 Select 를 오염시키기 때문입니다.

| 오염 지점 | `msgctxt` 로 막을 수 있는가 |
|---|---|
| `ui/group_by/group_by.js:21` (리포트 Group By) | ✗ |
| `query_report.js:248` (리포트 열 Function) | ✗ |
| `widgets/widget_dialog.js:702` · `dashboard_view.js:343` · `:391` | ✗ — Dialog 인라인 options 라 `df.parent` 가 없다 |
| `www/update-password.html:287` | 형제 라벨이 `Poor!/Good/Great!` 라 집합 자체가 다르다 |

얻는 것은 강도 막대의 한 단어, 잃는 것은 회계 담당자가 상시 쓰는 리포트 집계 메뉴 5곳입니다. 채우려면 `Count`·`Sum`·`Minimum`·`Maximum`·`Poor!`·`Good`·`Great!` 까지 **한 벌로** 가야 합니다.

> ⚠ 나중에 채울 때는 반드시 **그 줄의 `msgstr` 을 직접** 고치십시오. 파일 뒤에 같은 msgid 를 추가하면 babel `read_po` 가 첫(빈) 항목만 채택하고 뒤를 **무경고로** 버립니다(§7).

### 10.4 `msgstr` 이 원문과 같은 가드 엔트리

무맥락 `Password` → `비밀번호` 는 `login.html`·`user.js`·`email_account` 에서 이득이지만, **4개 DocType 의 Fieldtype Select 옵션**에도 적중해 `Data / Select / 비밀번호 / Int` 혼종 목록을 만듭니다. `select.js:82` 가 `df.context || df.parent || doctype` 을 컨텍스트로 넘기므로 `msgctxt` 로 정확히 되돌릴 수 있습니다.

```
msgctxt "DocField"
msgid "Password"
msgstr "Password"
```

`DocField` · `Custom Field` · `Customize Form Field` · `Web Form Field` 4건입니다. **`msgstr` 이 원문과 같은 것은 오류가 아니라 의도된 복원입니다.**

같은 이유로 `Automatic` → `자동` 은 `user.json` 의 `desk_theme` Select(`Light\nDark\nAutomatic`)에도 적중하므로 형제 옵션 `Light`·`Dark` 를 함께 넣었습니다. 한쪽만 넣으면 `Light / Dark / 자동` 이 됩니다.

### 10.5 검증

컨테이너 없이 babel 라운드트립으로 MO 키 생성을 확인할 수 있습니다(스택 기동 불필요).

```bash
APP=../setive_erpnext_kr
docker run --rm -v "$(cd $APP && pwd):/app:ro" --entrypoint sh frappe/erpnext:v16.33.0 -lc '
/home/frappe/frappe-bench/env/bin/python - <<PY
from babel.messages.pofile import read_po
from babel.messages.mofile import write_mo, read_mo
import io
cat = read_po(io.open("/app/setive_erpnext_kr/locale/ko.po", encoding="utf-8"))
buf = io.BytesIO(); write_mo(buf, cat); buf.seek(0)
d = {}
for m in read_mo(buf):
    if not m.id: continue
    d[f"{m.id}:{m.context.decode()}" if m.context else m.id] = m.string
print("MO 키", len(d))
print(d["Email Address"] + " (" + d["Will be your login ID"] + ")"
      == d["Email Address (Will be your login ID)"])   # 조립 라벨 바이트 일치
PY'
```

2026-09-14 실측: PO 125 엔트리 → MO 123 키, 대상 34/34 적중, 조립 라벨 일치 `True`.
(`Average` 는 빈 `msgstr` 이라 babel 이 MO 에서 제외합니다 — 정상입니다.)

스택이 떠 있으면 런타임 사전으로도 확인합니다.

```bash
make po     # compile_translations + clear-cache + flushall
docker compose -f docker/development/docker-compose.yml exec backend \
  bench --site localhost execute frappe.translate.get_all_translations --kwargs "{'lang':'ko'}"
```

`Next` 와 `Next:Go to next slide` 를 **각각** 확인하십시오 — 전자만 있으면 정상입니다(§10.2).

### 10.6 범위 밖으로 남긴 것

이번 슬라이드 밖이라 손대지 않았습니다. 별건으로 판단이 필요합니다.

| 항목 | 내용 |
|---|---|
| 완료·실패 화면 8건 | `Setting up your system` · `Starting Frappe ...` · `starting the setup...` · `Refreshing...` · `Failed to complete setup` · `Could not start up:` · `Setup failed` · `Retry`. `Complete Setup` 을 누른 직후 화면이며 전부 영문이다 |
| 죽은 엔트리 `Setup Failed` | 앱 `ko.po` 에 대문자 판이 있으나 실제 호출은 `setup_wizard.js:265` 의 소문자 `Setup failed` 다. msgid 는 바이트 일치라 지금 이 엔트리는 아무것도 번역하지 않는다 |
| 모듈 선택 슬라이드의 `Manufacturing` → `조작` | [`erpnext/public/js/setup_wizard.js:163`](../../erpnext/public/js/setup_wizard.js) 이 `__("Manufacturing")` 을 **무맥락**으로 부르는데 `erpnext/locale/ko.po:30192` 가 `조작` 으로 번역한다. 같은 위저드의 업종 Select 는 `msgctxt "KSIC"` 로 `제조업` 이라, 한 위저드 안에서 같은 단어가 둘로 갈린다. 무맥락 엔트리를 추가하면 Manufacturing **모듈명 전역**이 함께 바뀌므로 사람 판단이 필요하다 |
| 앵커 공백 68건 | `../setive_erpnext_kr/setive_erpnext_kr/translation_overrides.py` 가 124건 중 56건만 참조한다. 이번 34건은 넣었고, 이관분 43 + frappe 코어 25 는 아직 없다. `bench update-po --app setive_erpnext_kr` 을 돌리면 그 68건이 사라진다(`make po` 는 안전) |
