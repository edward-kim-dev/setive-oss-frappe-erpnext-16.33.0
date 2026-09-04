---
id: KB-LOC-003
title: 포크 로컬 번역 문자열 추가 규약 (msgctxt)
domain: 한글화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02
verified_by: babel read_po 실측 + 번역 사전 로드 확인
related: [KB-LOC-002, KB-KOR-001]
---

# KB-LOC-003: 포크 로컬 번역 문자열 추가 규약

## 1. 요약

이 저장소는 upstream ERPNext의 포크이며 `ko.po` 는 **Crowdin이 관리하는 파일**입니다.
포크에서 새 UI 문자열을 추가할 때 아무 위치에나 넣으면 (1) 다른 문맥의 오역이 끼어들거나 (2) upstream 동기화로 유실됩니다.
이 문서는 두 사고를 막는 규약입니다.

## 2. 규약

### 2.1 한글을 코드에 하드코딩하지 않는다

소스는 영문 msgid, 번역은 `ko.po` 에 둡니다. 기존 커밋들이 이 방식을 따르며, 영문 로케일도 지원 대상(`en, ko, ja, zh, zh-TW`)이기 때문입니다.

### 2.2 일반 단어 msgid에는 반드시 `msgctxt` 를 붙인다

```javascript
__("Manufacturing", null, "KSIC")     // ✅ "제조업"
__("Manufacturing")                   // ❌ "조작"  ← 모듈명 문맥의 기존 번역
```

Frappe의 `__(txt, replace, context)` 는 `frappe._messages["<msgid>:<msgctxt>"]` 를 먼저 찾고, 없으면 컨텍스트 없는 키로 폴백합니다 (`frappe/public/js/frappe/translate.js`).
`msgctxt` 가 있으면 babel 카탈로그에서 **별개 항목**이 되므로 기존 번역과 충돌하지 않습니다.

컨텍스트가 필요한 신호: msgid가 한 단어이거나, ERPNext의 모듈명·DocType명·상태값과 겹치는 흔한 명사일 때.

### 2.3 `ko.po` 와 `main.pot` **양쪽에**, 정렬 위치로 넣는다

`__()` 로 호출되는 문자열은 babel 추출 대상이므로 두 파일 모두에 넣습니다.

- 위치: babel 정렬키 `(msgid, msgctxt)` 기준 정렬 위치
- `#: <경로>:<라인>` 위치 주석 포함
- `main.pot` 은 `msgstr ""`, `ko.po` 는 번역 채움

이렇게 두면 주간 `generate-pot-file` 워크플로와 Crowdin 왕복이 **no-op** 이 되어 충돌이 최소화됩니다. 정렬을 어기거나 pot을 빠뜨리면 다음 재생성에서 diff가 발생합니다.

```
#: erpnext/public/js/setup_wizard.js:70
msgctxt "KSIC"
msgid "Manufacturing"
msgstr "제조업"
```

### 2.4 예외 — frappe 코어 문자열은 파일 끝 비정렬 블록

`erpnext/hooks.py` 의 `ignore_translatable_strings_from = ["frappe"]` 때문에 frappe 코어 문자열은 erpnext의 `main.pot` 에 추출되지 않습니다.
따라서 코어 위저드 문자열(`"Your Language"`, `"Complete Setup"`, `"Select Country"` 등)의 번역은 `ko.po` **맨 끝 블록**에 위치 주석 없이 추가돼 있습니다.

이 영역은 정렬 위반이 **정상**입니다. 정렬 검사 스크립트를 돌릴 때 파일 말미의 위반을 오류로 보지 마십시오.

## 3. 중복 msgid 함정

babel의 `read_po()` 는 동일 `(msgid, msgctxt)` 가 여러 번 나오면 **첫 항목만 채택**하며, 첫 항목의 `msgstr` 이 비어 있어도 그것을 씁니다. 실측:

| 파일 상태 | 최종 채택 |
|---|---|
| 1번째 `msgstr ""` + 2번째 `msgstr "SECOND"` | `""` (2번째 무시) |
| 1번째 `msgstr "FIRST"` + 2번째 `msgstr "SECOND"` | `"FIRST"` |
| 1번째 컨텍스트 없음 + 2번째 `msgctxt "CTX"` | 각각 별개로 유지 |

→ **파일 끝에 덧붙이는 방식으로는 이미 존재하는 msgid의 번역을 바꿀 수 없습니다.** 기존 위치의 `msgstr` 을 직접 수정하십시오.

현재 `ko.po` 는 중복 키 0건입니다. 추가 작업 후 아래로 재확인할 수 있습니다.

## 4. 검증

### 4.1 중복·정렬 검사

```bash
# 중복 (msgid, msgctxt) 및 첫 항목이 빈 번역인 치명 케이스 탐지
python3 - <<'PY'
import io
from collections import defaultdict
raw = io.open("erpnext/locale/ko.po", encoding="utf-8").read()
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
        occ[(mid, val(L, "msgctxt"))].append(val(L, "msgstr") or "")
dups = {k: v for k, v in occ.items() if len(v) > 1}
harmful = {k: v for k, v in dups.items() if v[0] == "" and any(v[1:])}
print("항목", sum(len(v) for v in occ.values()), "| 중복", len(dups), "| 치명(뒤 번역 무시)", len(harmful))
for k in harmful: print("  ", k)
PY
```

### 4.2 반영 및 해석 확인

```bash
make po    # ko.po → MO 컴파일 + 캐시 초기화

docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.translate.get_all_translations --kwargs "{\"lang\": \"ko\"}"' \
  | grep -o '"<msgid>:<msgctxt>": "[^"]*"'
```

## 5. Crowdin 유실 위험과 대안

`main.pot` 에 정렬 위치로 넣어 두면 재생성이 no-op이 되지만, **upstream develop을 병합하면 `ko.po` 에서 충돌이 날 수 있습니다.**

완전 차단이 필요하면 `erpnext/translations/ko.csv` 로 옮기는 방법이 있습니다.

- Crowdin이 건드리지 않는 경로 (`crowdin.yml` 은 `locale/main.pot` 과 `locale/*.po` 만 다룸)
- 3번째 컬럼으로 컨텍스트 지원 (`frappe/translate.py` `get_translation_dict_from_file`: `item[0] + ":" + item[2]`)
- 단, 로드 순서가 `csv` → `mo` 이므로 **MO가 CSV를 덮어씁니다.** 같은 키가 `ko.po` 에도 있으면 CSV 값은 무시됩니다.

현재는 `ko.po` + `main.pot` 방식을 씁니다. 병합 충돌이 반복되면 CSV로 전환을 검토하십시오.
