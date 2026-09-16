---
id: KB-KOR-002
title: 한국 표준 계정과목표 (일반기업회계기준) 와 국세청 표준재무제표 코드 매핑
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-16
verified_by: 소스 확인 + 개발 컨테이너 실측 (321계정판·324계정판 모두 Company 생성·측정·삭제 완료. 324판은 KB-KOR-003 E2E 에서 수행) + v16.33.0 리베이스 후 코어 심볼 재대조. 2026-09-16 에 §4 계정 수·차트 md5·매핑표 블록 목록을 재계수해 정정(§12)
related: [KB-KOR-003, KB-OPS-001, KB-KOR-001, ONT-CLS-001]
---

# KB-KOR-002: 한국 표준 계정과목표 (일반기업회계기준) 와 국세청 표준재무제표 코드 매핑

## 1. 요약

| 산출물 | 위치 | 규모 |
|---|---|---|
| 계정과목표 (ERPNext verified 차트) | [`erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_standard_chart_of_accounts.json`](../../erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_standard_chart_of_accounts.json) | 324 계정 = 그룹 52 + 원장 272, 4자리 번호 |
| 국세청 표준재무제표 코드 매핑 | `setive_erpnext_kr/setive_erpnext_kr/korea/common/data/nts_standard_code_map.json` (형제 앱 저장소) | 원장 272 전부 배정: 재무상태표 137 · 손익계산서 92 · 제조원가명세서 35 · 대사전용 7 · 대상아님 1, 산식 행 34, 미검증 33 |
| 생성·검증 스크립트 | `setive_erpnext_kr/scripts/coa/` (`tree_draft.json` → `build_kr_coa.py` → 차트, `build_nts_map.py` → 매핑, `validate_coa.py`, 서식 원본 추출 `nts_codes.json`) | 재실행하면 같은 파일이 나온다 (md5 일치 확인) |

위저드 드롭다운 표시명은 **"한국 표준 계정과목표 (일반기업회계기준)"** 이며 `Company.chart_of_accounts` 에 이 문자열이 저장된다.

## 2. 왜 포크에 두는가

`get_chart()` / `get_charts_for_country()` 는 `os.path.dirname(__file__)` 아래 `verified/` 폴더만 스캔한다 ([`chart_of_accounts.py:102`](../../erpnext/accounts/doctype/account/chart_of_accounts/chart_of_accounts.py), `:135`, `:159`). 설치 앱을 순회하지 않으므로 `setive_erpnext_kr` 에서 차트를 주입할 방법이 없다. [`CLAUDE.md`](../../CLAUDE.md) 의 "포크 수정이 허용되는 확정 예외" 표가 `kr_*.json` **신규 파일 추가**를 허용하는 근거가 이것이다. 기존 파일은 건드리지 않는다.

인식 조건은 두 가지다. 파일명이 `kr` 로 시작하고(`Country` 문서 `Korea, Republic of` 의 `code` = `kr`, `:159`), 최상위 키가 `country_code` / `name` / `tree` 여야 한다(`:129-131`). 트리 키는 한글 그대로 쓴다(대만 차트가 한자 키를 쓰는 선례). 번역 파일(`erpnext/locale/ko.po`)은 건드리지 않는다.

## 3. 설계 결정 4가지

| # | 결정 | 근거 |
|---|---|---|
| 1 | **COA 1벌 — 일반기업회계기준 기반.** 중소기업회계기준은 같은 트리에서 계정을 덜 쓴다. K-IFRS 벌은 만들지 않는다 | SETIVE 타깃 테넌트(비상장 중소·중견)는 일반기업회계기준 적용 대상. 벌을 나누면 매핑·훅·리포트가 이중이 된다 |
| 2 | **4자리 계층형 번호** — `1000 자산 / 1100 유동자산 / 1110 당좌자산 / 1111 현금 … 2000 부채 / 3000 자본 / 4000 수익 / 5000 비용` | `Account.autoname` 이 `번호 - 이름 - 약어` 이므로 번호 유일성이 곧 문서명 유일성. 국세청 코드와 달리 번호대만 보고 루트를 알 수 있다 |
| 3 | **국세청 표준재무제표 코드 매핑을 COA 와 동시에 확정하되 별도 파일**로 둔다 | 트리 노드가 인식하는 메타 키는 정확히 8개(`account_name, account_number, account_type, account_category, root_type, is_group, tax_rate, account_currency`, `get_chart_metadata_fields` `:283`). **그 외 키는 자식 계정 이름으로 삽입**되므로 JSON 안에 코드를 넣을 수 없다 |
| 4 | **초기 타깃은 제조업.** 제조원가(`5200`: 재료비·노무비·제조경비, `(제)` 접미)와 판매비와관리비(`5300`)를 **이중 계정군**으로 개설 | 제조업 법인세 신고는 제조원가명세서가 필수 부속명세서. 서비스·유통 테넌트는 `5200` 을 쓰지 않으면 된다. Company 기본계정도 제조 기준(§6) |

## 4. 트리 구조 요약

전체 목록은 파일을 직접 본다. 아래는 2단계까지의 골격과 계정 수(그룹/원장)다.

| 루트 | 2단계 | 3단계 그룹 | 그룹/원장 |
|---|---|---|---|
| **1000 자산** (17/80) | 1100 유동자산 | 1110 당좌자산 · 1150 재고자산 · 1170 기타유동자산 | 9/38 |
| | 1200 비유동자산 | 1210 투자자산 · 1230 유형자산 · 1260 무형자산 · 1280 기타비유동자산 | 4/41 |
| | 1900 임시계정 | 1901 기초잔액가계정 (Temporary) | 0/1 |
| **2000 부채** (13/35) | 2100 유동부채 | 2110 매입채무 · 2120 유동차입금 · 2130 미지급채무 · 2140 선수금및선수수익 · 2150 예수금 · 2160 미청구채무 · 2170 기타유동부채 | 7/24 |
| | 2200 비유동부채 | 2210 비유동차입금 · 2220 퇴직급여부채 · 2230 기타비유동부채 | 3/11 |
| **3000 자본** (6/23) | 3100 자본금 · 3200 자본잉여금 · 3300 자본조정 · 3400 기타포괄손익누계액 · 3500 이익잉여금 | — | 5분류 그대로 |
| **4000 수익** (7/29) | 4100 매출액 | 4110 제품매출 · 4120 상품매출 · 4180 매출환입및에누리 · 4190 매출할인 | 4/12 |
| | 4200 영업외수익 | — | 0/17 |
| **5000 비용** (9/105) | 5100 매출원가 | — | 0/7 |
| | 5200 제조원가 | 5210 재료비(3) · 5220 노무비(6) · 5230 제조경비(25) | 3/34 |
| | 5300 판매비와관리비 | — | 0/44 |
| | 5400 영업외비용 | — | 0/18 |
| | 5500 법인세비용 | — | 0/2 |

차감계정은 별도 원장으로 둔다(대손충당금 5, 감가상각누계액 8, 상각누계액 4, 재고자산평가충당금 4, 매출환입·할인 4, 대손충당금환입 1). ERPNext 는 잔액 부호로만 구분하므로 재무제표(IFRS 템플릿)는 `account_category` 로 순액 집계한다.

**JSON 안의 형제 순서는 번호순이 아니며 의도된 것이다.** 이유는 §6. 정렬하거나 `frappe.as_json`(`sort_keys=True`) 으로 재직렬화하면 Company 기본계정이 조용히 바뀐다.

## 5. ERPNext 필수 `account_type` 매핑표

코어가 `account_type` 으로 찾는 계정이다. 빠지면 Company 생성이 실패하지는 않지만 해당 기능이 막힌다. 검사는 `validate_coa.py` (6).

| account_type | 계정 | 코어 사용처 |
|---|---|---|
| Cash | 1111 현금, 1112 소액현금 | `default_cash_account` |
| Bank | **그룹** 1113 예금 / 원장 1114 당좌예금, 1115 보통예금 | `default_bank_account`; Bank Account 생성 시 부모 그룹 |
| Receivable | 1131 외상매출금, 1133 받을어음, 1141 미수금 | `default_receivable_account`, 거래처 원장 |
| Payable | 2111 외상매입금, 2112 지급어음, 2131 미지급금 | `default_payable_account` |
| Stock | 그룹 1150 / 1151~1158 재고 8종 | `default_inventory_account`, 창고 계정 |
| Stock Received But Not Billed / Stock Delivered But Not Billed | 2161 재고입고미청구 / 1160 재고출고미청구 | 영구재고 입출고·청구 대체 |
| Service Received But Not Billed / Asset Received But Not Billed | 2162 용역수령미청구 / 2163 자산취득미청구 | 구매영수증 대체 |
| Expenses Included In Valuation / …In Asset Valuation | 5150 재고취득부대비용 / 5151 자산취득부대비용 | 부대비용 원가 산입 |
| Stock Adjustment | 5140 재고자산감모손실 | `stock_adjustment_account` (재고실사 차액) |
| Cost of Goods Sold | 5110 상품매출원가, 5120 제품매출원가, 5130 기타매출원가 | `default_expense_account` |
| Fixed Asset | 유형 8(1231~1244 토지·건물·구축물·기계장치·차량운반구·공구와기구·비품·시설장치), 1217 투자부동산, 무형 6(1261~1269) | Asset Category `fixed_asset_account` — 타입이 정확히 Fixed Asset 이어야 저장 ([`asset_category.py:72`](../../erpnext/assets/doctype/asset_category/asset_category.py)) |
| Accumulated Depreciation | 유형 7(1233~1245), 1218 투자부동산, 무형 4(1270~1273) | `accumulated_depreciation_account`, Asset Category |
| Depreciation | 5311 감가상각비, 5312 무형자산상각비, 5237·5238 (제) | `depreciation_expense_account` |
| Capital Work in Progress | 1246 건설중인자산 | `capital_work_in_progress_account` |
| Round Off / Round Off for Opening | 5490 단수차이 / 2174 기초잔액단수차이 | 단수차 전기; 기초잔액 전표 ([`general_ledger.py:484`](../../erpnext/accounts/general_ledger.py)) |
| Temporary | 1901 기초잔액가계정 | Opening Invoice Creation Tool |
| Tax | **그룹** 1171 부가세관련자산(자산) · 2150 예수금(부채); 원장 1172 부가세대급금(10%), 2151 부가세예수금(10%), 2152 제세예수금 | `taxes_setup.get_or_create_tax_group` 이 자산·부채 양쪽 Tax 그룹을 먼저 찾는다 — 없으면 `관세 및 세금`/`세금 자산` 그룹을 새로 만든다 |
| Income Account | 4111~4160 매출 8종 | `default_income_account` |
| Equity | 자본 원장 23 전부 | 자본 계정 필터 |
| Chargeable | 5317 운반비 | Taxes and Charges 의 'Actual' 행 |

## 6. Company 기본계정은 무엇으로 잡히는가

### 6.1 삽입 순서가 기본계정을 정한다

`Company.set_default_accounts()` ([`company.py`](../../erpnext/setup/doctype/company/company.py)) 는 `frappe.db.get_value("Account", {"account_type": T, "is_group": 0, "company": ...})` 로 찾는데 dict 필터 `get_value` 는 `ORDER BY creation DESC` 다. 즉 **같은 타입 원장이 여럿이면 트리에서 마지막에 삽입된 것**이 기본계정이다. 반대로 `default_income_account` 는 `get_all`(creation ASC) 의 **첫 번째**다(같은 함수 안). 트리 삽입 순서 = JSON 형제 순서이므로 `build_kr_coa.py` 의 `DEFAULTS_LAST` / `DEFAULTS_FIRST` 가 해당 계정을 형제 중 마지막(첫)으로 옮기고, `validate_coa.py` (11) 이 이를 검사한다.

| 타입 | 마지막(첫) 삽입 원장 | 채워지는 필드 |
|---|---|---|
| Receivable | 1131 외상매출금 | `default_receivable_account` |
| Payable | 2111 외상매입금 | `default_payable_account` |
| Cash | 1111 현금 | `default_cash_account` |
| Bank | 1115 보통예금 | `default_bank_account` |
| Stock | 1155 원재료 | `default_inventory_account` (제조 기준) |
| Cost of Goods Sold | 5120 제품매출원가 | `default_expense_account` (제조 기준) |
| Depreciation | 5311 감가상각비 | `depreciation_expense_account` |
| Accumulated Depreciation | 1243 감가상각누계액(비품) | `accumulated_depreciation_account` |
| Income Account (첫) | 4111 국내제품매출 | `default_income_account` (제조 기준) |

이 때문에 `무형자산`(1260) 블록이 `유형자산`(1230) 블록보다 **앞에** 놓여 있다 — 무형자산 상각누계액(1270~1273)이 뒤에 삽입되면 `accumulated_depreciation_account` 를 가로챈다. 같은 타입 원장을 트리 뒤쪽에 추가할 때는 이 규칙을 먼저 본다.

### 6.2 실측 (리뷰 전 296계정 판, ko 세션, 2026-09-06)

Company 기본 필드 39개 중 21개가 채워졌다: 위 9개 + `round_off_account` 5490, `stock_adjustment_account` 5140, `stock_received_but_not_billed` 2161, `stock_delivered_but_not_billed` 1160, `capital_work_in_progress_account` 1246, `asset_received_but_not_billed` 2163, `write_off_account`·`bank_charges_account`(이름 매칭, 확정본에서는 계정 삭제 → 비어 있음), 코스트센터 3(`기본 - 약어`), `default_warehouse`(`백화점 - 약어`, §9-7).

**비는 필드**: `exchange_gain_loss_account`, `exchange_gain_account`, `exchange_loss_account`, `unrealized_exchange_gain_loss_account`, `disposal_account`, `round_off_for_opening`, `default_deferred_revenue/expense_account`, `default_purchase_price_variance_account`, `default_manufacturing_variance_account`, `default_discount_account`, `default_provisional_account`, `default_advance_received/paid_account`, `default_operating_cost_account`, 창고 4종. 이 중 코어가 **번역된 이름**으로만 찾는 것은 한국 계정명으로 절대 잡히지 않는다. 앱 훅이 번호로 채운다(§11-1).

**16.33 에서는 3개다** — `_("Write Off")`, `_("Exchange Gain/Loss")`, `_("Gain/Loss on Asset Disposal")` (`Company.set_default_accounts` 말미). 초판이 적은 6개는 17-dev 기준이며 `_("Bank Charges")`·`_("Exchange Gain")`·`_("Exchange Loss")` 는 **16.33 Company 에 필드 자체가 없다**(§12). 위 실측 문단의 `bank_charges_account`·`default_warehouse` 도 17-dev 실측값이다.

## 7. 표준재무제표 코드 매핑 파일

### 7.1 근거 서식

| 키 | 서식 | 개정일 | 비고 |
|---|---|---|---|
| `bs` | 법인세법 시행규칙 별지 제3호의2서식(1) 표준재무상태표(일반법인용) | 2021-10-28 | 287행 |
| `is` | 별지 제3호의3서식(1) 표준손익계산서(일반법인용) | 2024-03-22 | 199행. 36.인적용역비(220) 신설 |
| `mfg` | 별지 제3호의3서식(3) 부속명세서 1. 제조원가명세서 | 2023-03-20 | 45행 |

법령 PDF 원본(`law.go.kr`)에서 추출한 코드표가 `scripts/coa/nts_codes.json` 이며 원본 sha256 이 `meta.source_pdf_sha256` 에 있다. 코드 체계는 **서식마다 1부터** 시작하므로 (서식, 코드) 쌍으로만 식별한다 — `is 44 ≠ mfg 44`. 적용 사업연도 2024 이후.

### 7.2 형식 (schema 3)

```
meta              서식·개정일·출처·규약(amount_convention, aggregation, conventions)·미검증 목록·건수·options
account_sets      산식에 쓰는 계정 집합 (GOODS/FG/WIP/RM 과 각 평가충당금, INV_ALL, COGS_ADJ, MFG_COST)
computed_ops      opening_balance · closing_balance · movement · formula · ref · children · constant 정의
computed          서식별 산식 행 (mfg 1·2·3·4·44~49, is 36~47·66·129·217·219 등 34행)
profile_overrides 업종 프로필별 accounts 오버레이 (현재 trading 의 5150 하나)
reconciliation    항등식 4개 (매출원가 항등식, mfg 49 = is 44, 재고 순액 대사, 결산대체 완료)
accounts          계정번호 → {bs|is|mfg, label, sign?, contra?, level?, role?, note?, unverified?}
```

핵심 규약만 적는다(전문은 파일의 `meta`).

- **amount**: 루트 정상 잔액 방향 기준(자산·비용 = 차−대, 부채·자본·수익 = 대−차). 차감계정은 자연히 음수.
- **sign**: 서식에 괄호(차감) 행이 있으면 그 행에 `sign:-1`(양수 표시), 없으면 모행에 그대로(순액). 재고자산평가충당금·상각누계액·매출환입·매출할인·대손충당금환입이 순액 반영 대상.
- **level:parent**: 자식 행이 있는 상위 행에 직접 배정한 것(1217·1218 투자부동산, 5130 기타매출원가, 5211~5219 재료비). 행 값 = 직접 배정 + 자식 합.
- **role:reconcile_only**: 서식 행에 배정하지 않는 영구재고 원장(5110·5120·5140·5141). 매출원가는 `computed` 산식(기초 + 당기 − 기말 − 타계정대체)으로 구하고, `assigned(is.35)+gl(5110)+gl(5120)+gl(5140)+gl(5141)+gl(5150)+net(MFG_COST) == is.35` 로 대사한다(`assigned(is.35)` 는 매출원가 아래 직접 배정 블록의 원장 합 — 5130 포함, 2026-09-08 §12 참조). Stock Entry 추가원가로 재공품·제품에 흡수되지 않은 제조원가(`net(MFG_COST)`)는 배부 대체분개를 하지 않으면 전액 당기 매출원가로 귀속된다.
- **movement 의 상대계정 제외**: 재고 집합 내부 이동(원재료→재공품→제품)과 제조원가 흡수(대변)는 매입·타계정대체에서 빠지도록 `except_counter` 로 지정한다. 상대계정은 **`GL Entry.against` 로 판정한다** — 코어가 재고 GL 라인의 against 에 상대계정을 직접 써 넣기 때문이다(2026-09-08 D-6, §12). 계정이 하나로 특정되지 않는 전표(Journal Entry 의 쉼표 나열 등)만 금액 비례 배분으로 폴백하고 경고를 남긴다([KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §4.3 · §6.1.1).
- **meta.options**: 세무 판단이 갈리는 지점의 전환 스위치. 현재 `rm_other_transfer`(원재료 타계정대체를 mfg 48 에 합산할지 mfg 3 에서 차감할지) 하나이며 기본값은 `mfg48`. `load_map` 이 형식·허용값을 검증하고 오타는 즉시 throw 한다. 근거와 전환 절차는 [KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §4.4.

### 7.3 미검증 코드 (세무 검토 후 확정)

서식에 직접 대응하는 행이 없어 조립자 판단으로 배정한 33건. `meta.unverified_codes` 와 각 항목 `note` 에 근거가 있다.

`1147 1160 1284 1901 2153 2161 2162 2163 2171 2174 2213 2214 3130 3520 4130 4140 4150 4261 5150 5151 5211 5212 5219 5238 5313 5321 5322 5327 5332 5333 5334 5451 5490`

`3140 인출금`은 개인사업자 전용이라 법인 서식 대상이 아니다(`bs: null`). 개인사업자는 소득세법 표준재무제표용 매핑표를 따로 만든다.

## 8. 회계 리뷰 반영 이력 (2026-09-06)

리뷰 24건(회계 17 + ERPNext 역학 7)의 처리. "회계 정합성 > ERPNext 편의" 로 판단하되 ERPNext 동작은 깨지 않았다.

| # | 심각도 | 조치 |
|---|---|---|
| 1 | blocker | 제조원가명세서·매출원가 산식 행을 `computed` 로 정의, 5110·5120·5140·5141 을 `reconcile_only` 로 강등, 항등식 3개 추가 |
| 2 | high | 4180·4190 을 그룹으로 바꾸고 4181/4182 매출환입및에누리(제품/상품), 4191/4192 매출할인(제품/상품) 신설 → is 6/3 순액 |
| 3 | high | 1159 를 그룹으로 바꾸고 1161~1164 재고자산평가충당금(상품/제품/원재료/재공품) 신설 → bs 45/46/51/48 순액. 5141 은 대사 전용 |
| 4 | high | 5338 임원상여금(is 71), 5340 임원퇴직급여(is 75), 5225 임원급여(제)(mfg 7), 5226 임원퇴직급여(제)(mfg 13) 신설. 5304 → is 76 |
| 5 | medium | 5252 기업업무추진비(제) → mfg 34 |
| 6 | medium | 5341 연구비(is 94), 5253 연구비(제)(mfg 32) 신설 |
| 7 | medium | **리뷰안(교차 매핑)과 다르게 처리** — 4270 을 Income 루트에 두고 판관비 행에 음수 배정하는 대신, 판관비 아래 5345 대손충당금환입(Expense 루트, 대변잔액) 을 신설해 is 96 순액 반영. ERPNext 자체 손익계산서에서도 영업이익이 맞는다. 4270 은 `기타대손충당금환입`(is 159) 으로 개명 |
| 8 | medium | 미수수익·선급비용·선납세금을 1170 기타유동자산 하위 1173/1174/1176 으로 이동 (서식 (3)기타유동자산 구성과 일치) |
| 9 | medium | `meta.aggregation` 규약 명시. 헤더 행 배정 15건을 리프 행으로 재배정(1262→176, 2122→254, 2172→273, 2233→319, 3130→335, 3520→374, 4140→9, 4150→15, 4260→155, 5304→76, 5312→89, 5313→82, 5322→105, 5332→122, 5450→204). 잔여 헤더 배정은 `level:parent`. 313 예외는 `aggregation_exceptions` |
| 10 | medium | **리뷰안과 다르게 처리** — 5140 을 mfg 39 에 배정하면 원재료 감모가 재료비 산식과 이중계상되므로 `reconcile_only` 로 두고 타계정대체 행의 `except_counter` 에 넣어 기말재고 감소로만 반영. 5150 → mfg 3 직접 가산 |
| 11 | low | **보류** — 1160 재고출고미청구는 원가 기준 자산이고 SDBNB 경로에서 매출원가 인식이 청구 시점이므로 채권이 아니다. 재고자산(bs 62) 유지 |
| 12 | low | 1147 가지급금 → bs 27 주주ㆍ임원ㆍ직원 단기대여금 (미검증, note 에 39 재매핑 조건) |
| 13 | low | 1171 → 부가세관련자산, 1901 → 기초잔액가계정. 5337·5482 는 결함 20 으로 삭제. 동명 5쌍은 결함 23 |
| 14 | low | 3140 인출금 `bs: null`. 합병차익·지분법자본변동 등은 테넌트 추가로 남김 |
| 15 | low | 1126 대손충당금(주주임원종업원단기대여금)(bs 28), 1218 감가상각누계액(투자부동산)(bs 97 순액), 1270~1273 상각누계액(영업권/산업재산권/개발비/소프트웨어)(bs 170/176/184/186 순액). 1217 에 Fixed Asset |
| 16 | low | 5342 인적용역비(is 220), 5343 특허권사용료(is 118), 5344 수출제비용(is 119), 5255 특허권사용료(제)(mfg 30) |
| 17 | low | 5254 보관료(제)(mfg 38), 5225 임원급여(제). 5238 무형자산상각비(제) → mfg 19 (별지 제20호 대사) |
| 18 | high | 무형자산 6원장에 `Fixed Asset`, 상각누계액 4원장 신설, 무형자산 블록을 유형자산 앞으로 이동(§6.1) |
| 19 | medium | 검증기 (11) 이 타입별 마지막/첫 원장을 단언. 이 문서 §6 에 사실 명시. **훅은 후속 과제**(§11-1) |
| 20 | medium | 5482 `손실 처리`·5337 `은행 수수료` 삭제. `write_off_account`=5480 잡손실, `bank_charges_account`=5322 지급수수료는 훅이 지정 |
| 21 | medium | 훅에서 `exchange_gain_account`=4250, `exchange_loss_account`=5420, `round_off_for_opening`=2174 지정 예정. **단일 손익 계정 2개는 사용자 결정 대기**(§9-3) |
| 22 | medium | 제조 기본 유지(결정 4). 창고 계정 매핑은 훅 후속 과제(§11-2) |
| 23 | low | 5510 → 당기법인세비용. 1179/1289/2179/2239 → `…(미분류)` |
| 24 | low | **보류** — 선급금/선수금에 Payable/Receivable 타입을 붙이면 훅 없이는 `default_receivable_account` 가 선수금으로 바뀐다. 훅 배치 후 JSON 변경(§11-5) |

## 9. 알려진 한계

1. **자본 카테고리 2종.** `Account Category` 에 자본용은 `Share Capital`·`Reserves and Surplus` 뿐이라 IFRS 재무상태표 템플릿에서 자본잉여금·자본조정·기타포괄손익누계액·이익잉여금이 한 행으로 합산된다. 트리는 5분류를 유지하므로 한국식 재무상태표 리포트는 트리 기준으로 만든다.
2. **이름 매칭 항목**(16.33 기준 3개, §6.2)은 JSON 만으로 채울 수 없다. 앱 `ko.po` 에서 msgid 번역을 덮는 방식은 Sales Invoice 의 'Write Off' 섹션 등 UI 문자열까지 바뀌므로 쓰지 않는다.
3. **단일 손익 계정 — 결정됨 (2026-09-06, 선택지 (i)).** 영업외비용에 `5422 외환차손익`·`5423 외화환산손익`·`5452 유형자산처분손익` 을 추가했다. 각각 코어의 `exchange_gain_loss_account`(16.33 의 실현 환차손익 단일 계정)·`unrealized_exchange_gain_loss_account`([`exchange_rate_revaluation.py:364`](../../erpnext/accounts/doctype/exchange_rate_revaluation/exchange_rate_revaluation.py) — 미설정 시 throw)·`disposal_account`([`sales_invoice_item.py:122`](../../erpnext/accounts/doctype/sales_invoice_item/sales_invoice_item.py)) 전용이며, 결산 시 차익은 4250/4251/4260, 차손은 5420/5421/5450 으로 대체해 잔액 0 을 만든다(매핑표 reconciliation '결산대체 완료'). ⚠️ **초판의 "실현 환차손익은 v16 이 분리 필드를 쓴다"는 서술은 16.33 에서 거짓이다**(§12). 16.33 에는 `exchange_gain_account`/`exchange_loss_account` 필드도, 그것을 쓰는 `erpnext/accounts/services/exchange_gain_loss.py` 도 없다. 실현 환차손익은 **`exchange_gain_loss_account`(5422) 하나로만 기표되므로 5422 에 잔액이 쌓인다.** 4250 외환차익 / 5420 외환차손 분리 표시는 결산 대체분개로만 만든다 — 미실현(5423)·자산처분(5452)과 같은 취급이다.
4. **세금 템플릿 0건.** `country_wise_tax.json` 의 한국 키는 `"South Korea"` 인데 `Company.country` 는 `"Korea, Republic of"` 라 `taxes_setup.py:20-22` 가 즉시 return 한다. 부가세 10% 템플릿은 앱 훅이 만든다(§11-3). 포크의 `country_wise_tax.json` 수정은 3단계 에스컬레이션 대상.
5. **IFRS 현금흐름표 무형자산 행.** `standard_cash_flow_statement_(ifrs).json:426` 은 `account_category = Intangible Assets` 만 보고 유형자산 행(`:375`)과 달리 Accumulated Depreciation 제외 조건이 없어 상각 대변이 투자활동에 순액으로 섞인다. 상위 템플릿 한계 — 한국 현금흐름표 템플릿 과제.
6. **서식 개정 대응.** `validate_coa.py` 가 `meta.*_revised` 와 `nts_codes.json` 의 `revised` 를 대조한다. 서식이 개정되면 PDF 재추출 → `nts_codes.json` 갱신 → 매핑 재검토 순서다. `is 220` 처럼 배열 끝에 코드가 붙으므로 items 는 읽기 순서이지 코드순이 아니다.
7. **`Stores` → `백화점` 오역.** 포크 `erpnext/locale/ko.po` 의 `msgid "Stores"` 항목(v16.33.0 기준 `:52640`) 때문에 위저드 기본창고가 `백화점 - 약어` 로 생긴다(`Sales` → `매상` 도 같은 유형). 포크 `ko.po` 가 아니라 앱 `ko.po` 에서 재정의한다.
8. **창고 계정 미매핑.** 위저드가 만드는 창고 5개는 `account` 가 비어 있어 창고 매핑 전에는 상품·제품 입출고도 전부 1155 원재료로 전기된다.
9. **위저드 밖에서 Company 를 만들면** `Warehouse Type "Transit"` 이 없어 `LinkValidationError` 가 난다(`install_fixtures.py:316` 이 위저드에서만 실행). 실측 재현·확인.
10. **통화.** 위저드 경로는 `account_currency` 를 무시하고 Company 기본통화(KRW)로 일괄 지정한다. 외화계좌는 테넌트가 통화를 지정해 원장을 추가한다.
11. **`computed`·`reconciliation` 은 명세다.** 표준재무제표 리포트(실행기)는 미착수(§11-6).

## 10. 검증

저장소 루트(`setive-oss-erpnext-16.33`)에서 실행한다. 형제 폴더 배치는 KB-OPS-001 §1.1.

```bash
# 정적 검사 — 기대: "-- errors 0, warnings 0"
python3 ../setive_erpnext_kr/scripts/coa/validate_coa.py \
  erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_standard_chart_of_accounts.json \
  --map ../setive_erpnext_kr/setive_erpnext_kr/korea/common/data/nts_standard_code_map.json \
  --nts ../setive_erpnext_kr/scripts/coa/nts_codes.json

# 재생성 — 결과가 현재 파일과 같아야 한다 (md5 비교)
python3 ../setive_erpnext_kr/scripts/coa/build_kr_coa.py     # → verified/kr_standard_chart_of_accounts.json
python3 ../setive_erpnext_kr/scripts/coa/build_nts_map.py    # → korea/common/data/nts_standard_code_map.json

# 컨테이너: 드롭다운 목록 노출 — 기대: ["한국 표준 계정과목표 (일반기업회계기준)", "Standard", "Standard with Numbers"]
COMPOSE=docker/development/docker-compose.yml
docker compose -f $COMPOSE exec -T backend bench --site localhost execute \
  erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts.get_charts_for_country \
  --kwargs "{'country':'Korea, Republic of','with_standard':True}"

# 컨테이너: 위저드 미리보기 트리 렌더 — 기대: nodes 324 expandable 52 dup 0
docker compose -f $COMPOSE exec -T backend bench --site localhost execute \
  erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts.build_tree_from_json \
  --kwargs "{'chart_template':'한국 표준 계정과목표 (일반기업회계기준)'}" 2>/dev/null \
  | python3 -c "import sys,json; r=sys.stdin.read(); d=json.loads(r[r.find('['):r.rfind(']')+1]); v=[x['value'] for x in d]; print('nodes',len(d),'expandable',sum(1 for x in d if x.get('expandable')),'dup',len(v)-len(set(v)))"
```

2026-09-06 실측: 321계정판으로 Company 생성·측정·삭제 완료(§12). 이후 단일 손익계정 3개를 더해 324계정이 됐고, 이 판은 정적 검사 errors 0 · warnings 0, 목록 노출, 트리 렌더 324/52/0 을 확인했다.

**324판 Company 생성 실측 (2026-09-06, [KB-KOR-003 §9](./KB-KOR-003_company_hook_tax_nts.md))**: Account 324(그룹 52 · 원장 272), 코어 자동 매핑은 §12 의 19개 + `round_off_for_opening` 2174(타입 매칭), 앱 훅이 12개(§11-1)·창고 계정 4개·세금 템플릿 12개·표준코드 272건을 추가, 1172/2151 중복 생성 0, Error Log 증가 0, 삭제 후 잔여 0.

```bash
# Company 생성 실측(트랜잭션 후 삭제). 위저드 미완료 사이트에서는 Warehouse Type 'Transit' 이 먼저 있어야 한다 (§9-9)
docker compose -f $COMPOSE exec -T backend bench --site localhost execute \
  frappe.client.get_count --kwargs "{'doctype':'Account','filters':{'company':'<회사명>'}}"   # 기대 324
```

## 11. 후속 과제

| # | 과제 | 위치 | 비고 |
|---|---|---|---|
| 1 | **Company 훅** — `hooks.doc_events["Company"]["on_update"]` 에서 `account_number` 로 기본계정 고정: `default_receivable_account`=1131, `default_payable_account`=2111, `default_cash_account`=1111, `default_bank_account`=1115, `default_inventory_account`=1155, `default_expense_account`=5120, `default_income_account`=4111, `depreciation_expense_account`=5311, `accumulated_depreciation_account`=1243, `write_off_account`=5480, `bank_charges_account`=5322, `exchange_gain_account`=4250, `exchange_loss_account`=5420, `round_off_for_opening`=2174, `default_discount_account`=4191 | `setive_erpnext_kr/korea/common/company_defaults.py` | **완료 → [KB-KOR-003 §4](./KB-KOR-003_company_hook_tax_nts.md)**. 범위가 계획과 다르다 — 코어가 타입 매칭으로 채우는 필드(1131·2111·1111·1115·1155·5120·4111·5311·1243·2174)는 훅이 건드리지 않고 **빈 12개**(5480·5322·5422·4250·5420·5423·5452·2142·1174·4191·5251·2162)만 채운다. JSON 형제 순서 의존(§6.1)은 그대로 유효하다(§12) |
| 2 | 창고 계정 매핑 — `Stores`→1155 원재료, `Work In Progress`→1154 재공품, `Finished Goods`→1152 제품, `Goods In Transit`→1158 미착품 | `korea/common/warehouses.py` | **완료 → KB-KOR-003 §5**. Company `default_wip/fg/in_transit_warehouse` 도 채운다. 결함 22 |
| 3 | 부가세 템플릿 — 매출 10%(2151 부가세예수금), 매입 10%(1172 부가세대급금), 영세·면세 | `korea/common/taxes.py` + `data/kr_tax_defaults.json` (`on_update` 훅, `after_insert` 아님) | **완료 → KB-KOR-003 §6**. 매출 3·매입 6(불공제 3 포함)·품목 3·Tax Category 2. 면세 템플릿의 세율 0 행은 승인 대기. §9-4 |
| 4 | Company Custom Field — 사업자등록번호·법인등록번호·주업종코드(KB-KOR-001 로드맵 3) | `custom/company.json` (`export_customizations`, KB-OPS-001 §4.1) | `sync_on_migrate:True` 필수 |
| 5 | 선급금 1144 `Payable`·선수금 2141 `Receivable` 타입 부여 + `default_advance_paid/received_account` 지정 | JSON + 훅 | **보류 — 사용자 결정(2026-09-06)** 으로 타입을 부여하지 않았고 훅은 `default_advance_*` 를 비워 둔다(KB-KOR-003 §4.2). 재개하려면 훅(1) 이 이미 있으므로 JSON 만 바꾸면 된다 |
| 6 | 표준재무제표 리포트 — `computed`/`reconciliation` 실행기, 전표 단위 상대계정 산출 | 앱 리포트 | 테스트 원장으로 항등식 검증 |
| 7 | 앱 `ko.po` 에 `Stores`·`Sales` 재정의 | `setive_erpnext_kr/locale/ko.po` | `Stores`→`창고` 완료(`ko.po:137`, KB-KOR-003 실측 `창고 - SHV`). `Sales` 는 미처리. KB-LOC-003 규약 |
| 8 | 외환차손익·유형자산처분손익 단일 계정 결정 | 사용자 | **결정됨(§9-3, 2026-09-06)**. 훅이 5422/5423/5452 를 지정한다(KB-KOR-003 §4.1). 분리 필드 4250/5420 은 **16.33 에 존재하지 않으므로** 훅에서 제거 대상이다(§12, KB-KOR-003 §11-14) |
| 9 | K-IFRS 적용 테넌트 대응 검토 | — | 결정 1 에 따라 별도 벌은 만들지 않음. 필요 시 카테고리 확장으로 대응 |
| 10 | 표준재무제표 코드를 Account 에 기록 — Custom Field(bs/is/mfg/role/note) + Company 매핑 개정 표식 | `korea/common/nts_codes.py` | **완료 → KB-KOR-003 §7**. 원장 272/272 채움, `force` 재적용·`report_unmapped` 점검 제공. 리포트 실행기(6)는 별개 |

## 12. 이전 서술 정정

### 2026-09-16

- **§4 트리 구조 요약 표의 `5000 비용 (9/102)` 과 `5400 영업외비용 0/15`** — 실제는 `9/105` 와 `0/18` 입니다. 2026-09-06 커밋 `eba9d6a828` 이 단일 손익계정 3종(5422·5423·5452)을 5400 에 추가했는데 §4 표에 반영되지 않았습니다. 같은 문서 §1 의 원장 272 와도 어긋났습니다(80+35+23+29+105 = 272). 재계수해 고쳤습니다.
- **§7.2 movement bullet "구현은 전표 단위로 상대계정을 구해야 한다(GL Entry `against` 필드는 다건 전표에서 부정확)"** — D-6(2026-09-08)으로 뒤집힌 문장이 남아 있었습니다. 엔진은 `against` 를 **권위로** 쓰고, 특정되지 않는 전표만 폴백합니다. 오히려 전표 단위 비례 배분이 부정확했던 것이 2026-09-08 결함의 원인이었습니다([KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §4.2).
- **§7.2 블록 목록** — 최상위 키 `profile_overrides` 가 빠져 있었고 `reconciliation` 을 "항등식 3개" 라고 적었습니다(실제 4개 — 결산대체 완료 포함). `meta` 에 `options` 가 추가되면서 목록도 함께 고쳤습니다.
- **매핑표 `meta.schema_version`** — 2 → **3** (2026-09-16, `meta.options` 신설). 값은 `nts_codes.MAP_SCHEMA_VERSION`(런타임 권위)과 `build_nts_map.py`(생성기) 두 곳에 있고, 한쪽만 올리면 `load_map` 이 throw 해 리포트 3종과 `apply` 가 전부 멈춥니다. 그래서 `validate_coa.py` 가 **엔진 소스에서 상수를 읽어**(`engine_contract()`) 매핑표와 대조합니다 — 검증기에 값을 베껴 두면 같은 함정이 하나 더 생기기 때문입니다. 허용 모드 목록(`RM_TRANSFER_MODES`)도 같은 방식으로 읽습니다.

- 초판 프런트매터는 "확정본은 목록 노출·트리 렌더만 재확인"이라고 적었으나, 이후 확정본(321계정)으로 Company 생성·측정·삭제를 재수행했다. 실측값: Account 321(그룹 52·원장 269), 전부 KRW, 접미사 ` 1` 0건, 카테고리 없는 원장 0건, NestedSet 결함 0, Error Log 증가 0, `get_or_create_tax_group` → Asset `1171 부가세관련자산` / Liability `2150 예수금`, Company `default_*` 39개 중 19개 자동 매핑(수취 1131·지급 2111·현금 1111·은행 1115·단수차이 5490·매출원가 5120·매출 4111·재고 1155·재고조정 5140·입고미청구 2161·출고미청구 1160·감가상각누계액 1243·감가상각비 5311·건설중 1246·자산취득미청구 2163 + 코스트센터 3 + 기본창고). 삭제 후 잔여 0.

- 런타임 실측 기록의 "296계정(그룹 49 + 원장 247)" 은 리뷰 반영 전 판이다. 확정본은 **321계정(그룹 52 + 원장 269)** 이며 Company 기본계정 21개 중 `write_off_account`·`bank_charges_account` 는 확정본에서 비게 된다(계정 삭제, 훅으로 이관).
- 리뷰 전 매핑 규약 "매출원가·재료비는 영구재고 원장 잔액을 소계 행에 직접 배정" 은 폐기했다. 재료비는 재고에 흡수되어 이중계상되고 노무비·경비는 손익계산서에 도달하지 못했다(결함 1). 산식 행 `computed` 와 `reconcile_only` 로 대체.
- 리뷰 전 매핑의 "차감계정은 서식의 괄호 행 코드에 대변잔액 그대로 배정" 은 `amount_convention` + `sign:-1` 로 형식화했다. 의미는 같다.
- 리뷰안 중 채택하지 않은 것: 결함 7 의 교차 매핑(Income 계정 → 판관비 행 음수), 결함 10 의 5140 → mfg 39, 결함 11 의 1160 이동, 결함 3 의 리프 번호안(1160 을 유지하고 1161~1164 사용). 근거는 §8.
- §11-1 초판은 "훅이 있으면 JSON 형제 순서 의존이 사라진다" 고 적었고 §8 결함 21 은 `round_off_for_opening`=2174 를 훅에서 지정한다고 적었다. 구현된 훅(KB-KOR-003)은 **빈 필드만 채우는 멱등 규칙**이라 코어가 타입 매칭으로 채운 필드를 재지정하지 않는다. 따라서 §6.1 의 형제 순서 규칙은 계속 유효하며, 2174 는 `Round Off for Opening` 타입으로 코어가 채운다(324판 실측). 훅이 채우는 것은 §11-1 의 12개다.
- 2026-09-06 사용자 결정으로 §9-3 을 확정했다. 초판은 실현 환차손익도 단일 계정이 필요하다고 봤다. **아래 2026-09-07 정정을 함께 읽을 것 — 결과적으로 초판이 맞았다.**

### 2026-09-07 — v16.33.0 리베이스에 따른 정정

이 문서의 코어 인용은 포크가 upstream `develop`(erpnext 17.0.0-dev) 위에 있을 때 실측한 것입니다. 2026-09-06 리베이스로 코어가 `v16.33.0` 이 되면서 아래가 사실과 달라졌습니다.

- **`Company.bank_charges_account` · `exchange_gain_account` · `exchange_loss_account` 는 16.33 에 필드가 없습니다** (17-dev 전용). §6.2 의 "이름 매칭 6개" 는 16.33 에서 3개이고, 같은 문단의 `bank_charges_account` 채워짐 기록도 17-dev 실측값입니다. 근거: `grep -c '"bank_charges_account"' erpnext/setup/doctype/company/company.json` → 0, `grep -rn "exchange_gain_account" --include='*.py' erpnext` → 0건.
- **§9-3 의 "v16 은 실현 환차손익을 분리 필드로 기표한다"는 서술을 철회합니다.** 근거로 인용한 `erpnext/accounts/services/exchange_gain_loss.py` 가 16.33 에 없습니다(워킹트리에 `__pycache__` 만 남은 고아 디렉토리라 `ls` 로는 있는 것처럼 보임). 16.33 은 `exchange_gain_loss_account` 단일 계정만 씁니다(코어 13개 파일 참조). **회계 영향: 5422 외환차손익에 실현분 잔액이 실제로 쌓이므로 결산 대체가 필수입니다.** 초판의 "실현 환차손익도 단일 계정이 필요하다"는 판단이 16.33 에서는 옳았습니다.
- **`Company.default_warehouse` 도 16.33 에 없습니다.** §6.2 실측 목록과 §12 첫 항목의 "기본창고" 는 17-dev 기준입니다. 16.33 `create_default_warehouses` 는 창고만 만들고 Company 필드를 채우지 않습니다(KB-KOR-003 §5·§12).
- **`company.py` 라인 번호가 어긋났습니다** — `set_default_accounts` 741 → 623. 이 문서의 코어 인용을 함수명 기준으로 바꿨습니다. 남은 라인 번호(`exchange_rate_revaluation.py`, `sales_invoice_item.py`, `taxes_setup.py`, `install_fixtures.py`, `chart_of_accounts.py`)는 17-dev 시점 값이며 몇 줄씩 어긋날 수 있습니다. 확인은 `grep -n` 으로 합니다.
- **§10 의 검증 명령은 리베이스 후에도 그대로 유효합니다.** 차트 파일 md5 `4a5b7e9873dc3eee93bffb046137836b`, 계정 324(그룹 52·원장 272) 재확인했습니다. **(md5 는 2026-09-07 커밋 `94dc249e28`(1160 의 17-dev 전용 account_type 제거)에서 `f6e03a38636b3ce60d028887ad41f471` 로 바뀌었습니다 — 2026-09-16 확인.)**
- **2026-09-07: `1160 재고출고미청구` 의 `account_type` 을 제거했습니다.** `Stock Delivered But Not Billed` 는 ERPNext **17-dev 전용** 옵션이며 16.33.0 의 `Account.account_type` 32종에 없습니다. 지정한 채로 회사를 만들면 `ValidationError: 계정 유형 cannot be "Stock Delivered But Not Billed"` 로 생성 자체가 실패합니다(실측). 16.33 에는 대응하는 `Company.stock_delivered_but_not_billed` 필드도 이를 쓰는 코드도 없어, 계정은 남기고 타입만 비웠습니다. v17 이행 시 타입 부여를 검토합니다. `scripts/coa/validate_coa.py` 의 옵션 집합·필수 타입 목록에서도 제외했습니다.
- **동일 사유로 `Company` 기본계정 3개가 16.33 에서 채워지지 않습니다** — `bank_charges_account`·`exchange_gain_account`·`exchange_loss_account` 는 17-dev 전용 필드입니다. 앱 `company_defaults.apply()` 가 `meta.has_field()` 로 건너뜁니다(KB-KOR-003). 따라서 §9-3 의 "v16 이 분리 필드를 우선 사용한다" 는 서술은 **17-dev 기준이었고 16.33 에는 해당하지 않습니다.** 16.33 에는 `exchange_gain_loss.py` 서비스 자체가 없고 단일 `exchange_gain_loss_account` 만 있으므로, `5422 외환차손익` 에는 실제로 잔액이 쌓이며 결산 대체가 필요합니다.
- **2026-09-07: 매핑표에 소비자가 생겼습니다.** §7 의 국세청 표준재무제표 코드 매핑을 실제로 읽어 서식을 출력하는 리포트 3종을 앱에 구현했습니다 — [KB-KOR-004](./KB-KOR-004_nts_financial_statements.md). 그 과정에서 `5110`·`5120` 의 `reconcile_only` 를 풀고 `is 36`·`is 42` 에 `level:"parent"` 로 직접 배정했습니다. ERPNext 는 영구재고라 판매 시점에 실제 매출원가를 원장에 계상하는데 서식의 실지재고 산식과 어긋나 재무상태표가 대차평균을 잃었기 때문입니다(실측: 산식 39,928 vs 원장 253,760). 근거와 한계는 KB-KOR-004 §4.
- **2026-09-08: 위 5110·5120 직접 배정을 되돌렸습니다.** 총계를 원장으로 덮자 5140·5141·5150 잔여·미흡수 제조원가가 손익계산서에서 빠져 대사가 깨졌고(제조·상품매매 fixture 각 6/9), 산식과 원장이 어긋난 진짜 원인은 엔진의 상대계정 비례 배분이었습니다. 그것을 `GL Entry.against` 판정으로 고치자 산식이 원장과 1원까지 일치해 두 계정은 §7.2 서술대로 `reconcile_only` 로 복귀했습니다(reconcile_only 7). 경위·실측은 KB-KOR-004 §4·§9.
- **2026-09-08 (오후): 매핑표에 `profile_overrides` 와 `assigned()` 대사항이 생겼습니다.** 업종 프로필(Company `setive_industry_profile`, KB-KOR-003 §5)이 `trading` 이면 `5150 재고취득부대비용` 잔액을 mfg 3 이 아니라 is 38 당기매입원가에 배정합니다(`profile_overrides.trading.5150`, `nts_codes.apply` 가 읽음). 대사식 `매출원가 항등식` 의 `gl(5130)` 은 `assigned(is.35)`(매출원가 아래 직접 배정 블록의 원장 합)로 일반화해 테넌트가 공사원가 등을 추가해도 성립합니다. 근거·실측은 KB-KOR-004 §4.6·§5. 생성기 `build_nts_map.py` 에도 같은 변경(`PROFILE_OVERRIDES`·새 `RECONCILIATION[0]`·5110/5120 `reconcile()`)을 반영해 재생성 결과가 저장된 파일과 바이트 동일함을 확인했다(§10 의 md5 절차). 5110/5120 을 손으로 되돌릴 때 `meta.counts`(is 92·reconcile_only 7)를 갱신하지 않았던 것도 재생성으로 바로잡았다.
