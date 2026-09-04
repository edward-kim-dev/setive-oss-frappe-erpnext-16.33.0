---
id: KB-KOR-001
title: 셋업 위저드 업종 분류를 KSIC 대분류로 교체
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02
verified_by: 소스 확인 + MO 컴파일 검증 + Node 하네스 런타임 검증
related: [ONT-CLS-001, KB-LOC-002, KB-LOC-003, KB-ARCH-001]
---

# KB-KOR-001: 셋업 위저드 업종 분류를 KSIC 대분류로 교체

## 1. 요약

셋업 위저드 페르소나 슬라이드의 업종 선택("어떤 업종 / 분야의 일을 하시나요?")을 ERPNext 기본 영문 13항목에서 **한국표준산업분류(KSIC) 제11차 개정 대분류 21개**로 교체했습니다.
옵션 값은 명칭이 아니라 **대분류 코드(`A`~`U`)** 이며, 표시 라벨은 `msgctxt "KSIC"` 컨텍스트로 번역합니다.

분류 체계 자체에 대한 도메인 지식(다른 코드체계와의 관계, 카디널리티, 권위 출처)은 [ONT-CLS-001](../ontology/ONT-CLS-001_korean_industry_code_systems.md)에 있습니다. 이 문서는 구현 기록입니다.

## 2. 변경 대상

| 파일 | 위치 | 변경 |
|---|---|---|
| [`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js) | `:62`~`:103` | `erpnext.setup.ksic_sections` 신설 (21개 `{value, label}`) |
| 〃 | `:133` | `persona_industry.options` 를 `[빈 옵션] + ksic_sections` 로 교체 |
| 〃 | `:409`~`:434` | `erpnext.setup.industry_modules` 키를 `A`~`U` 로 재매핑 |
| [`erpnext/locale/ko.po`](../../erpnext/locale/ko.po) | 정렬 위치 삽입 | `msgctxt "KSIC"` 항목 21건 추가, 사장된 옛 옵션 번역 5건 제거 |
| [`erpnext/locale/main.pot`](../../erpnext/locale/main.pot) | 정렬 위치 삽입 | 동일 21건 추가 |
| [`erpnext/setup/setup_wizard/setup_wizard.py`](../../erpnext/setup/setup_wizard/setup_wizard.py) | `:64` | 텔레메트리 `industry` 값이 KSIC 대분류 코드임을 주석 명시 |

## 3. 메커니즘

```
erpnext.setup.ksic_sections                       ← 대분류 21개 데이터 (JS 상수)
   │  [{ value: "C", label: __("Manufacturing", null, "KSIC") }, ...]
   │
   ├──▶ persona_industry.options = [{value:"",label:""}] + ksic_sections
   │        │
   │        ▼  frappe.ui.form.add_options() → parse_option()
   │     <option value="C">제조업</option>          ← 라벨만 번역, value 는 원본 유지
   │        │
   │        ▼  slide.get_field("persona_industry").get_value() === "C"
   │
   ├──▶ erpnext.setup.industry_modules["C"] = ["accounting","stock","manufacturing"]
   │        └─▶ apply_industry_modules() → module_* 체크박스 프리셀렉트
   │
   └──▶ capture_user_persona() → 텔레메트리 properties.industry = "C"
```

`ksic_sections` 는 `erpnext.setup.slides_settings` **선언보다 앞에** 두어야 합니다. `slides_settings` 는 모듈 평가 시점의 배열 리터럴이므로, 뒤에 선언하면 `options` 가 `undefined` 가 됩니다.

## 4. 결정 근거

### 4.1 옵션 값을 명칭이 아니라 대분류 코드로 둔 이유

| 대안 | 기각 사유 |
|---|---|
| 국문 명칭을 값으로 | KSIC 개정 시 명칭이 바뀌면 저장된 값과 `industry_modules` 키가 동시에 깨짐 |
| 영문 명칭을 값으로 | 위와 동일. 추가로 텔레메트리와 UI 간 표기가 이원화됨 |
| **대분류 코드 `A`~`U`** ✅ | 개정에 안정적이고, 세세분류·국세청 업종코드로 내려갈 때 그대로 조인 키가 됨 (ONT-CLS-001 §5 참조) |

### 4.2 `msgctxt "KSIC"` 를 붙인 이유 — 붙이지 않으면 오역이 나온다

컨텍스트 없는 msgid는 이미 다른 문맥으로 번역돼 있어 그대로 충돌합니다. 교체 전 `ko.po` 실측:

| msgid | 기존 ko 번역 (다른 문맥) | KSIC 대분류로서 필요한 값 |
|---|---|---|
| `Manufacturing` | **조작** | 제조업 |
| `Education` | 교육 | 교육 서비스업 |
| `Real estate activities` → `Real Estate` | 부동산 | 부동산업 |

`Manufacturing` 은 ERPNext 모듈명 문맥에서 "조작"으로 번역돼 있어, 컨텍스트 없이 쓰면 드롭다운에 **"조작"** 이 표시됩니다.
`msgctxt` 는 babel 카탈로그에서 별개 항목으로 취급되므로(실측: KB-LOC-002 §2.3) 충돌이 원천 차단됩니다.

### 4.3 "기타" 옵션을 두지 않은 이유

KSIC 대분류 21개는 모든 산업활동을 망라하므로 잔여 항목이 불필요합니다. 미지의 값이 들어와도 `apply_industry_modules()` 가 `["accounting"]` 로 폴백합니다.

### 4.4 세세분류를 위저드에 넣지 않은 이유

`persona_industry` 는 모듈 프리셀렉트와 텔레메트리 전용이며 **Company 레코드에 저장되지 않습니다.**
여기에 세세분류 1,205건이나 업종코드 1,610건을 Select로 넣으면 (1) 셋업 첫 화면이 감당 불가, (2) `industry_modules` 키 매칭 불가, (3) 정작 회계·세무에는 미사용입니다.
세무 근거가 되는 업종은 사업자등록증 기준으로 별도 입력·검증해야 하므로 Company 커스텀 필드로 분리합니다 (§7 로드맵).

## 5. 업종 → 모듈 프리셀렉트 매핑

회계는 항상 ON입니다. 매핑 근거는 해당 대분류의 지배적 업무 형태입니다.

| 코드 | 대분류 | stock | manufacturing | projects |
|---|---|---|---|---|
| A | 농업, 임업 및 어업 | ✅ | | |
| B | 광업 | ✅ | | |
| C | 제조업 | ✅ | ✅ | |
| D | 전기, 가스, 증기 및 공기 조절 공급업 | ✅ | | |
| E | 수도, 하수 및 폐기물 처리, 원료 재생업 | ✅ | | |
| F | 건설업 | ✅ | | ✅ |
| G | 도매 및 소매업 | ✅ | | |
| H | 운수 및 창고업 | ✅ | | |
| I | 숙박 및 음식점업 | ✅ | | |
| J | 정보통신업 | | | ✅ |
| K | 금융 및 보험업 | | | |
| L | 부동산업 | | | ✅ |
| M | 전문, 과학 및 기술 서비스업 | | | ✅ |
| N | 사업시설 관리, 사업 지원 및 임대 서비스업 | | | ✅ |
| O | 공공 행정, 국방 및 사회보장 행정 | | | ✅ |
| P | 교육 서비스업 | | | ✅ |
| Q | 보건업 및 사회복지 서비스업 | ✅ | | |
| R | 예술, 스포츠 및 여가관련 서비스업 | | | ✅ |
| S | 협회 및 단체, 수리 및 기타 개인 서비스업 | ✅ | | |
| T | 가구내 고용활동 및 달리 분류되지 않은 자가소비 생산활동 | | | |
| U | 국제 및 외국기관 | | | ✅ |

## 6. 검증

### 6.1 번역 해석 확인

```bash
make po      # ko.po → MO 컴파일 + 캐시 초기화
docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.translate.get_all_translations --kwargs "{\"lang\": \"ko\"}"' \
  | grep -o '"[^"]*:KSIC": "[^"]*"'
```

기대: `"<영문명>:KSIC"` 키 21건이 국문 대분류 명칭으로 해석됨. **실측 21/21 통과.**

### 6.2 런타임 동작 확인 (Node 하네스)

브라우저 없이 검증하려면 Frappe의 `__()`(`frappe/public/js/frappe/translate.js`)와 `parse_option()`(`frappe/public/js/frappe/form/controls/select.js`)을 그대로 재현한 뒤 `setup_wizard.js` 를 `vm.runInContext` 로 평가합니다. 실측 결과:

- 렌더 옵션 22개 (플레이스홀더 1 + 대분류 21)
- 라벨 21/21 국문 일치
- `industry_modules` 키 21개, 전부 `accounting` 포함, 미지 모듈명 0
- `apply_industry_modules()` 가 `C`/`J`/`K`/`F` 에서 매핑대로 체크박스 토글
- 빈 선택 시 회계만 ON

### 6.3 정적 검사

```bash
npx prettier@2.7.1 --check erpnext/public/js/setup_wizard.js
npx eslint@8.44.0 --quiet erpnext/public/js/setup_wizard.js
```

`ko.po` / `main.pot` 은 babel 정렬키(`msgid`, `msgctxt`) 순서를 유지해야 합니다. 삽입 후 정렬 위반 0 · 중복 키 0 확인.

## 7. 남은 일 (로드맵)

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 위저드 업종을 KSIC 대분류 21개로 교체 | **완료** (이 문서) |
| 2 | `KSIC Code` DocType (5단계 1,205건) + `NTS Business Code` DocType (업종코드 + 경비율). 홈택스 연계표 단일 소스 | 미착수 |
| 3 | `Company` 에 `주업종코드` Link 필드. 위저드 대분류 코드로 후보 필터링 | 미착수 |
| 4 | `Industry Type` 마스터(영문 51건)를 KSIC 기준으로 교체 검토. Lead/Customer/Opportunity 참조 | 미착수 |

2~4단계는 셋업 위저드가 아니라 한국화 Custom App(세무/회계 파트)에 넣습니다.

## 8. 알려진 제약

1. **위저드 값은 세무 근거가 아닙니다.** 사업자등록증의 업태/종목은 국세청이 부여하며, 사용자가 위저드에서 고른 대분류와 불일치할 수 있습니다. 1단계 값을 세무 판정에 승격시키지 마십시오.
2. **DB에 저장되지 않습니다.** `persona_industry` 는 텔레메트리로만 나가고 `Company` 에 남지 않습니다. 값을 재사용해야 하면 3단계가 선행돼야 합니다.
3. **텔레메트리 값 의미가 바뀌었습니다.** 기존 `"Manufacturing"` 등 영문 명칭에서 `"C"` 등 KSIC 코드로 변경. 과거 수집분과 직접 비교할 수 없습니다.
4. **`ko.po` 잔여 항목.** 옛 옵션 전용이던 5건은 제거했으나, `Retail`·`Healthcare`·`Other`·`E-commerce` 는 다른 앱/문맥에서 참조될 가능성이 있어 남겨 뒀습니다. 전역 번역 사전이므로 무해하지만 사장된 항목입니다.
