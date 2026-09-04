---
id: ONT-CLS-001
title: 국내 업종 코드체계 (KSIC · 국세청 업종코드 · 산재보험 사업종류)
domain: 분류체계
status: active
applies_to:
  - KSIC 제11차 개정 (2024-07-01 시행)
  - 국세청 업종코드 2023년 귀속
verified_on: 2026-09-02
verified_by: 홈택스 공식 연계표(xlsx) 실측 + 공표 항목수 교차확인
related: [KB-KOR-001]
---

# ONT-CLS-001: 국내 업종 코드체계

## 요약

국내에서 사업체의 "업종"을 식별하는 코드체계는 **하나가 아니라 셋**이며, 셋 다 「통계법」상 한국표준산업분류(KSIC)를 뿌리로 삼되 용도와 소관 기관이 다릅니다.
온톨로지에서 "업종"을 단일 속성으로 모델링하면 안 되고, **분류체계(scheme)와 그 안의 코드(concept)를 분리**해야 합니다.

```
                    ┌──────────────────────────────────────┐
                    │  한국표준산업분류 (KSIC)             │  ← 뿌리. 「통계법」 근거
                    │  국가데이터처 · 제11차 · 5단계       │
                    └──────────────────────────────────────┘
                       │                    │
        ┌──────────────┘                    └──────────────┐
        ▼ (홈택스 공식 연계표)                              ▼ (사업종류 결정 시 준용)
┌───────────────────────────┐              ┌───────────────────────────────┐
│ 국세청 업종코드 (6자리)   │              │ 산재·고용보험 사업종류         │
│ 국세청 · 세금 신고 근거   │              │ 고용노동부 고시 / 근로복지공단 │
│ 사업자등록 · 경비율       │              │ 보험료율 산정                  │
└───────────────────────────┘              └───────────────────────────────┘
        │
        ▼ (사업자등록 정보 연계)
┌───────────────────────────┐
│ 건강보험·국민연금 사업장  │   ※ 자체 업종분류 체계 없음
└───────────────────────────┘
```

---

## 1. 코드체계 (Code System)

| 체계 | 발행/소관 기관 | 코드 형식 | 현행 판 | 시행일 | 갱신 주기 | 주 용도 |
|---|---|---|---|---|---|---|
| 한국표준산업분류 (KSIC) | **국가데이터처** (2025-10-01 통계청에서 승격 개편) | 5단계 계층, 최하위 5자리 | 제11차 개정 | 2024-07-01 | 부정기 (약 5~7년) | 국가통계 분류, 각종 법령의 업종 판정 기준 |
| 국세청 업종코드 | **국세청** (홈택스) | 6자리 숫자 | 2023년 귀속 | 귀속연도별 | 매년 | 사업자등록 업태/종목, 종합소득세 기준·단순경비율, 조세 감면 판정 |
| 사업종류별 산재보험료율 | **고용노동부** 고시 / 근로복지공단 집행 | 사업종류(대분류) + 세목 | 연도별 고시 | 매년 01-01 | 매년 | 산재보험료율 산정 |

### 1.1 건강보험은 별도 체계가 없다 (부정적 사실)

건강보험공단은 사업장 업종에 대한 **자체 분류 체계를 보유하지 않습니다.** 사업장 적용 시 국세청 사업자등록 정보의 업태/종목을 그대로 받아 씁니다.
4대보험 중 독립된 업종 코드가 실재하는 것은 **산재·고용보험**뿐이며, 그 분류 근거도 「통계법」상 KSIC입니다.

→ **모델링 함의**: "건강보험 업종"이라는 개념을 만들지 않습니다. 건강보험 사업장은 국세청 업종코드를 경유해 업종과 간접 연결됩니다.

---

## 2. 개념 (Concept)

| 개념 | 식별자 형식 | 정의 | 권위 출처 |
|---|---|---|---|
| KSIC 대분류 | 영문 대문자 1자 (`A`~`U`) | KSIC 최상위 21개 산업 부문 | 국가데이터처 |
| KSIC 중분류 | 숫자 2자리 | 대분류 하위 77개 | 국가데이터처 |
| KSIC 소분류 | 숫자 3자리 | 중분류 하위 234개 | 국가데이터처 |
| KSIC 세분류 | 숫자 4자리 | 소분류 하위 501개 | 국가데이터처 |
| KSIC 세세분류 | 숫자 5자리 | 최하위 1,205개. 실질적 분류 단위 | 국가데이터처 |
| 국세청 업종코드 | 숫자 6자리 | 세무 신고용 업종 식별자 | 국세청 |
| 기준경비율 / 단순경비율 | 백분율 | 업종코드별 추계신고 경비 산정률 | 국세청 |
| 업태 / 종목 | 문자열 | 사업자등록증에 기재되는 업종 표기 | 국세청 |
| 주업종코드 | 업종코드 1건 | 복수 업종 사업자의 대표 업종. 확인서 발급 대상 | 국세청 |
| 사업종류(산재) | 고시상 분류 + 세목 | 산재보험료율이 적용되는 사업 단위 | 고용노동부 |

### 2.1 KSIC 제11차 대분류 21개 (개별자 전량)

| 코드 | 국문 명칭 (공식) | 영문 명칭 |
|---|---|---|
| A | 농업, 임업 및 어업 | Agriculture, forestry and fishing |
| B | 광업 | Mining and quarrying |
| C | 제조업 | Manufacturing |
| D | 전기, 가스, 증기 및 공기 조절 공급업 | Electricity, gas, steam and air conditioning supply |
| E | 수도, 하수 및 폐기물 처리, 원료 재생업 | Water supply; sewage, waste management and materials recovery |
| F | 건설업 | Construction |
| G | 도매 및 소매업 | Wholesale and retail trade |
| H | 운수 및 창고업 | Transportation and storage |
| I | 숙박 및 음식점업 | Accommodation and food service activities |
| J | 정보통신업 | Information and communication |
| K | 금융 및 보험업 | Financial and insurance activities |
| L | 부동산업 | Real estate activities |
| M | 전문, 과학 및 기술 서비스업 | Professional, scientific and technical activities |
| N | 사업시설 관리, 사업 지원 및 임대 서비스업 | Business facilities management and business support services; rental and leasing activities |
| O | 공공 행정, 국방 및 사회보장 행정 | Public administration and defence; compulsory social security |
| P | 교육 서비스업 | Education |
| Q | 보건업 및 사회복지 서비스업 | Human health and social work activities |
| R | 예술, 스포츠 및 여가관련 서비스업 | Arts, sports and recreation related services |
| S | 협회 및 단체, 수리 및 기타 개인 서비스업 | Membership organizations, repair and other personal services |
| T | 가구내 고용활동 및 달리 분류되지 않은 자가소비 생산활동 | Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use |
| U | 국제 및 외국기관 | Activities of extraterritorial organizations and bodies |

국문 명칭은 홈택스 연계표에서 직접 추출한 값이며, 21개 전량이 공표 대분류와 일치합니다 (§7 참조).

---

## 3. 관계 (Relation)

카디널리티는 홈택스 연계표 원본에서 실측한 값입니다.

| 주체 | 술어 | 대상 | 카디널리티 | 근거 |
|---|---|---|---|---|
| KSIC 세세분류 | `broader` (상위) | KSIC 세분류 | N:1 | 계층 구조 (코드 접두 일치 100%, 실측) |
| KSIC 세분류 | `broader` | KSIC 소분류 | N:1 | 계층 구조 |
| KSIC 소분류 | `broader` | KSIC 중분류 | N:1 | 계층 구조 |
| KSIC 중분류 | `broader` | KSIC 대분류 | N:1 | 계층 구조 |
| 국세청 업종코드 | `mapsTo` | KSIC 세세분류 | **N:M** | 연계표 1,787행 / 업종코드 1,610건 / 세세분류 1,205건 |
| 국세청 업종코드 | `hasExpenseRate` | 기준·단순경비율 | 1:1 (귀속연도별) | 국세청 경비율 고시 |
| 사업자 | `hasBusinessCode` | 국세청 업종코드 | 1:N | 복수 업종 등록 가능 |
| 사업자 | `hasPrimaryBusinessCode` | 국세청 업종코드 | **1:1** | 주업종코드확인서 |
| 사업장 | `hasInsuranceBusinessType` | 사업종류(산재) | 1:1 | 주된 사업활동으로 단일 결정 |
| 건강보험 사업장 | `hasIndustry` | — | **없음** | 자체 분류 체계 부재 (§1.1) |

### 3.1 N:M 인 이유와 부분 대응 표기

업종코드와 KSIC 세세분류는 1:1이 아닙니다.

- 하나의 업종코드가 여러 KSIC 세세분류에 걸치는 경우가 있고, 반대도 있습니다 (연계표 1,787행 > 업종코드 1,610건).
- 연계표에서 **95개 행**은 KSIC 코드에 `+` 접미가 붙어 있습니다 (예: `03111+`, `45110+`). 해당 KSIC 분류의 **일부만** 그 업종코드에 대응한다는 표기입니다.

→ **모델링 함의**: 매핑을 단순 외래키가 아니라 **관계 엔티티(reified relation)** 로 두고 `partial: bool` 속성을 갖게 해야 손실이 없습니다.

---

## 4. 시스템 매핑 (현재 ERPNext 기준)

| 개념 | 현재 구현 | 상태 |
|---|---|---|
| KSIC 대분류 | `erpnext.setup.ksic_sections` (JS 상수, 위저드 옵션) — [KB-KOR-001](../kb/KB-KOR-001_ksic_wizard_industry.md) | 구현됨 (UI 한정, DB 미저장) |
| KSIC 세세분류 | — | **미구현** |
| 국세청 업종코드 | — | **미구현** |
| 기준·단순경비율 | — | **미구현** |
| 업태 / 종목 | — | **미구현** |
| 주업종코드 | — | **미구현** (Company에 필드 없음) |
| 업종 (범용) | `Industry Type` DocType (`erpnext/selling/doctype/industry_type/`), 영문 51건 프리셋 | 구현됨. KSIC과 무관한 자체 목록 |
| 사업자등록번호 | `Company.tax_id` (Data) | 구현됨. 검증 없음 |
| 사업종류(산재) | — | **미구현** |

`Company.domain` (Data) 필드가 존재하지만 위저드 업종 값과 연결되지 않습니다. 위저드의 `persona_industry` 는 모듈 프리셀렉트와 텔레메트리에만 쓰이고 DB에 저장되지 않습니다.

---

## 5. 그래프 투영 (안)

HugeGraph 스키마 초안입니다. **확정안이 아닙니다.**

### Vertex label 후보

| label | primary key | property | 비고 |
|---|---|---|---|
| `ClassificationScheme` | `scheme_id` | `name`, `authority`, `edition`, `effective_from` | KSIC / NTS / WCI |
| `KsicClass` | `ksic_code` | `level`(1~5), `name_ko`, `name_en` | 대분류~세세분류를 한 label로 (level 속성으로 구분) |
| `NtsBusinessCode` | `nts_code` | `name`, `assessment_year`, `standard_rate`, `simplified_rate` | |
| `Company` | `company_id` | `name`, `tax_id` | ERPNext `Company` 대응 |

### Edge label 후보

| label | out → in | property | 카디널리티 |
|---|---|---|---|
| `belongsToScheme` | `KsicClass` → `ClassificationScheme` | | N:1 |
| `broader` | `KsicClass` → `KsicClass` | | N:1 |
| `mapsToKsic` | `NtsBusinessCode` → `KsicClass` | `partial`(bool), `source_edition` | **N:M** |
| `hasPrimaryBusinessCode` | `Company` → `NtsBusinessCode` | `since` | 1:1 |
| `hasBusinessCode` | `Company` → `NtsBusinessCode` | | 1:N |

`KsicClass` 를 level별로 쪼개지 않고 하나의 label + `level` 속성으로 둔 이유: `broader` 를 단일 edge label로 재귀 순회할 수 있어 "이 업종코드의 대분류는?" 같은 질의가 한 traversal로 끝납니다.

---

## 6. 시계열·개정 취급 주의

1. **개정 간 연결은 자동이 아닙니다.** KSIC 제10차 → 제11차 사이에 신설·폐지·분할된 분류가 있습니다. 국가데이터처가 개정별 연계표를 제공하므로, 서로 다른 판의 코드를 같은 계열로 이어 붙이려면 그 연계표를 근거로 명시적 매핑 엣지를 둬야 합니다.
2. **업종코드는 귀속연도 단위로 갱신됩니다.** 경비율이 매년 바뀌므로 `NtsBusinessCode` 는 코드 단독이 아니라 `(코드, 귀속연도)` 로 식별해야 정확합니다. 위 투영안은 `assessment_year` 를 속성으로 뒀으나, 연도별 이력이 필요하면 별도 vertex로 분리해야 합니다.
3. **연계표 미포함 분류가 있습니다.** 업종코드가 매핑되지 않는 KSIC 분류(공공행정 일부 등)는 연계표에 나타나지 않습니다. KSIC 전량을 적재하려면 국가데이터처 원본을 별도로 받아야 합니다.

---

## 7. 데이터 출처 및 실측

### 7.1 홈택스 「업종코드-11차 표준산업분류 연계표」

- 형식: xlsx, 시트 `연계표`, 헤더 5행 + 데이터 1,787행, 28열
- 좌측: 국세청 업종코드 + 그 시점 분류 / 우측: KSIC 제11차 분류 (대·중·소·세·세세)

실측 결과 (KSIC-11 측 컬럼 기준):

| 분류 단계 | 연계표 실측 | 공표 항목수 | 일치 |
|---|---|---|---|
| 대분류 (1자) | 21 | 21 | ✅ |
| 중분류 (2자리) | 77 | 77 | ✅ |
| 소분류 (3자리) | 234 | 234 | ✅ |
| 세분류 (4자리) | 501 | 501 | ✅ |
| 세세분류 (5자리) | 1,205 (`+` 접미 정규화 후) | 1,205 | ✅ |
| 국세청 업종코드 (6자리) | 1,610 | — | — |

다섯 단계 전부가 공표 항목수와 정확히 일치하므로, 이 파일 하나로 **KSIC 제11차 전체 계층 + 업종코드 매핑을 동시에 적재**할 수 있습니다. 2단계 DocType 구축 시 이 파일을 단일 소스로 삼는 것을 권합니다.

### 7.2 재현 방법

```bash
curl -sk -A "Mozilla/5.0" -o linkage.xlsx \
  "https://teht.hometax.go.kr/doc/rn/a/a/업종코드-표준산업분류%20연계표_홈택스%20게시.xlsx"
```

URL은 퍼센트 인코딩된 한글 파일명이므로 홈택스 게시 페이지에서 링크를 다시 확인하는 편이 안전합니다.
컬럼 인덱스(0-base): `2`=업종코드, `13`=KSIC-11 세세분류코드, `14/16/18/20`=KSIC-11 대/중/소/세분류 코드, `15`=대분류 명칭.

---

## 8. 권위 출처

| 대상 | 출처 |
|---|---|
| KSIC 분류 내용·개정 이력 | 국가데이터처 통계분류포털 (`kssc.kostat.go.kr` → 2025-12-02부터 도메인 변경) |
| KSIC 법령 근거 | 국가법령정보센터 「한국표준산업분류」 행정규칙 |
| 업종코드 ↔ KSIC 연계표 | 홈택스 조회/발급 › 기타조회 › 기준·단순경비율(업종코드) |
| 업종코드·경비율 조회 | 홈택스 / 손택스 업종코드 목록조회 |
| 주업종코드확인서 | 홈택스 발급 메뉴 |
| 사업종류별 산재보험료율 | 고용노동부 고시 (공공데이터포털 개방) |
