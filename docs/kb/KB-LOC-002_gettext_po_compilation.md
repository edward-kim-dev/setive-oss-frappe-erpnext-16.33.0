---
id: KB-LOC-002
title: Gettext 번역 탐색 순위와 PO/MO 컴파일
domain: 한글화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02
verified_by: frappe/translate.py · gettext/translate.py 소스 확인 + babel read_po 실측
related: [KB-LOC-003, KB-DEV-001]
---

# KB-LOC-002: Gettext 번역 탐색 순위와 PO/MO 컴파일

## 1. 요약

Frappe v16의 번역은 앱별 `.po` → `.mo` 이진 컴파일 결과를 Redis에 캐시해 부팅 시 클라이언트로 내려주는 구조입니다.
이 문서는 (1) 어느 소스가 우선하는지, (2) 컨텍스트(`msgctxt`)가 어떻게 키에 반영되는지, (3) 중복 `msgid` 처리 규칙, (4) 단일 언어 컴파일 방법을 정리합니다.

## 2. 번역 탐색 및 병합 순서

`frappe.translate.get_all_translations(lang)` 의 병합 순서입니다. **뒤에 병합되는 것이 앞을 덮어씁니다.**

```
get_translations_from_apps(parent_lang)      ← 상위 언어 (예: ko-KR 의 ko)
  └─ 앱별 반복:
       1) get_translations_from_csv(lang, app)   <app>/translations/<lang>.csv
       2) get_translations_from_mo(lang, app)    assets/locale/<lang>/LC_MESSAGES/<app>.mo
get_translations_from_apps(lang)             ← 자식 언어 (상위를 덮어씀)
get_user_translations(parent_lang)           ← Translation DocType
get_user_translations(lang)
get_translated_countries()
```

즉 우선순위는 **Translation DocType > MO(.po 컴파일) > CSV** 입니다.

- `Translation` DocType: DB 레벨 사용자 정의. 최우선.
- MO 이진 파일: 운영 표준 경로. `.po` 를 컴파일한 결과.
- CSV: 레거시 경로이지만 v16에서도 여전히 로드됩니다. 포크 로컬 문자열의 대안 저장소로 쓸 수 있으나 MO에 같은 키가 있으면 무시됩니다 (KB-LOC-003 §5).

### 2.1 MO 실제 경로

```
/home/frappe/frappe-bench/sites/assets/locale/ko/LC_MESSAGES/erpnext.mo
/home/frappe/frappe-bench/sites/assets/locale/ko/LC_MESSAGES/frappe.mo
```

`<app>/locale/` 은 `.po` **소스**가 있는 곳이고, 컴파일 산출물은 `sites/assets/locale/` 아래입니다.
개발용 Docker 스택에서는 이 경로가 `locale-data` 볼륨으로 분리돼 있습니다 — `sites/assets` 가 컨테이너 레이어를 가리키는 심볼릭 링크라, 볼륨으로 빼지 않으면 컨테이너를 재생성할 때 컴파일한 MO가 이미지 원본으로 되돌아갑니다.

### 2.2 컨텍스트(msgctxt)의 키 표현

`msgctxt` 가 있는 항목은 `"<msgid>:<msgctxt>"` 키로 사전에 들어갑니다.

| 계층 | 구현 |
|---|---|
| MO 로드 | `get_translations_from_mo()`: `translations[f"{m.id}:{context}"] = m.string` |
| CSV 로드 | `get_translation_dict_from_file()`: `key = item[0] + ":" + item[2]` |
| DocType 로드 | `get_user_translations()`: `key += ":" + t.context` |
| JS 조회 | `frappe._(txt, replace, context)`: `frappe._messages[`${key}:${context}`]` → 없으면 컨텍스트 없는 키로 폴백 |

### 2.3 중복 msgid 처리 — 첫 항목이 이긴다 (실측)

babel `read_po()` 로 확인한 결과입니다.

| 파일 상태 | 최종 채택 |
|---|---|
| 1번째 `msgstr ""` + 2번째 `msgstr "SECOND"` | `""` — 2번째가 **무시됨** |
| 1번째 `msgstr "FIRST"` + 2번째 `msgstr "SECOND"` | `"FIRST"` |
| 1번째 컨텍스트 없음 + 2번째 `msgctxt "CTX"` | 각각 별개 항목으로 유지 |

→ **파일 끝에 덧붙이는 방식으로는 기존 msgid의 번역을 바꿀 수 없습니다.** 기존 위치의 `msgstr` 을 직접 수정해야 합니다.
현재 `ko.po` 의 중복 키는 0건입니다. 검사 스크립트는 KB-LOC-003 §4.1에 있습니다.

## 3. 컴파일

### 3.1 단일 언어 컴파일

`frappe.gettext.translate.compile_translations()` 를 인자 없이 부르면 설치된 전체 앱 × 전체 로케일을 컴파일합니다.
`locale` 을 지정하면 해당 언어만 처리합니다.

```bash
make po
# 내부: bench --site localhost execute frappe.gettext.translate.compile_translations \
#         --kwargs "{'locale': 'ko', 'force': True}"
#       → bench clear-cache → frappe.cache().flushall
```

`force=True` 가 필요한 이유: `_compile_translation()` 은 `.po` 의 mtime이 `.mo` 보다 오래됐으면 건너뜁니다. 볼륨 마운트 환경에서 mtime이 신뢰되지 않을 수 있어 강제 컴파일이 안전합니다.

### 3.2 캐시

컴파일만으로는 반영되지 않습니다. 병합 결과가 Redis(`MERGED_TRANSLATION_KEY`)에 캐시되므로 `clear-cache` + `flushall` 이 따라야 하고, 클라이언트도 새로고침해야 합니다 (`Cmd+Shift+R` / `Ctrl+F5`).

### 3.3 POT 재생성과 정렬

`.po` / `.pot` 은 babel `write_po(..., sort_output=True, ignore_obsolete=True, width=None)` 로 기록됩니다.
정렬키는 `(msgid, msgctxt or "")` 이고 줄바꿈 래핑은 없습니다. 손으로 항목을 넣을 때 이 순서를 지켜야 재생성 시 diff가 생기지 않습니다.

POT 재생성은 `.github/workflows/generate-pot-file.yml` 이 주간 스케줄(+수동 실행)로 수행합니다.

## 4. 검증

```bash
# 특정 키가 실제로 해석되는지
docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.translate.get_all_translations --kwargs "{\"lang\": \"ko\"}"' \
  | grep -o '"Manufacturing[^,]*'

# MO 산출물 확인
docker exec setive-backend sh -lc 'ls -la /home/frappe/frappe-bench/sites/assets/locale/ko/LC_MESSAGES/'
```

## 5. 관련 파일

| 대상 | 경로 |
|---|---|
| PO 소스 (한국어) | [`erpnext/locale/ko.po`](../../erpnext/locale/ko.po) |
| POT (추출 원본) | [`erpnext/locale/main.pot`](../../erpnext/locale/main.pot) |
| 추출기 설정 | [`babel_extractors.csv`](../../babel_extractors.csv) |
| Crowdin 연동 | [`crowdin.yml`](../../crowdin.yml) |
| 컴파일 타겟 | [`Makefile`](../../Makefile) |
| MO 산출물 | `sites/assets/locale/ko/LC_MESSAGES/erpnext.mo` (컨테이너) |

## 6. 이전 서술 정정

- §2A의 MO 경로를 `<app>/locale/<lang>/LC_MESSAGES/<app>.mo` 로 적었으나 실제 산출 경로는 `sites/assets/locale/...` 입니다. 같은 문서의 §3과 상충하던 부분을 §2.1로 통일했습니다.
- 중복 `msgid` 규칙("첫 번째 항목만 채택")은 **실측으로 참임을 확인**했습니다. 근거를 §2.3 표로 명시했습니다.
- "~0.2초", "초고속" 같은 표현 대신 컴파일 범위가 로케일 수에 비례한다는 사실과 `force` 플래그의 필요 이유를 서술했습니다.
- 절대경로 링크를 상대경로로 교체했습니다.
