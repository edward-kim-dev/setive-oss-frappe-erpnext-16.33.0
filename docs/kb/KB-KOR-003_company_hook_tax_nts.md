---
id: KB-KOR-003
title: Company 훅 — 기본계정·창고·부가세 템플릿·국세청 표준코드 자동 설정
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-06
verified_by: 개발 컨테이너 E2E(회사 생성→GL 스모크→삭제)
related: [KB-KOR-002, KB-OPS-001, KB-ARCH-001]
---

# KB-KOR-003: Company 훅 — 기본계정·창고·부가세 템플릿·국세청 표준코드 자동 설정

## 1. 요약

한국 표준 계정과목표([KB-KOR-002](./KB-KOR-002_korean_chart_of_accounts.md))로 회사를 만들면 코어가 채우지 못하는 것이 넷 있다. 앱 `setive_erpnext_kr` 의 `Company.on_update` 훅이 회사 생성 직후 이 넷을 채운다. 포크는 건드리지 않는다.

| 단계 | 모듈 (`setive_erpnext_kr/setive_erpnext_kr/korea/common/`) | 채우는 것 | 2026-09-06 실측 |
|---|---|---|---|
| 1 | `company_defaults.py` | 코어가 비워 두는 Company 기본계정 12개 | 12/12 |
| 2 | `warehouses.py` | 기본 창고 4개의 `account` + Company 창고 필드 3개 | 4 + 3 |
| 3 | `taxes.py` + `data/kr_tax_defaults.json` | 부가세 템플릿 — 매출 3 · 매입 6 · 품목 3 · Tax Category 2 | 14 |
| 4 | `nts_codes.py` + `data/nts_standard_code_map.json` | Account Custom Field 7 + Company Custom Field 1, 원장 272개에 표준재무제표 코드 | 8 필드, 272/272 |

진입점은 세 개다.

```
hooks.py  doc_events["Company"]["on_update"]  → korea/common/company.py:on_update → apply_all()
hooks.py  after_install / after_migrate       → install.py → nts_codes.ensure_custom_fields()
company.py  backfill(company)  [whitelisted]  → apply_all() + commit   (기존 사이트용, §8)
```

모든 단계는 멱등이다 — 빈 값만 채우고 있는 값은 건드리지 않는다. 같은 회사에 `apply_all` 을 두 번 더 돌려도 변경 0 임을 실측했다(§9).

## 2. 왜 앱 훅인가

1. **경합 없는 주입점.** [`erpnext/hooks.py`](../../erpnext/hooks.py) 의 `doc_events` 에는 `"Company"` 키가 없다(grep 0건). Frappe 가 앱별 `hooks.py` 를 병합하므로 앱 훅이 코어 훅과 충돌하지 않는다. `erpnext/hooks.py` 자체는 수정 금지 대상이다([`CLAUDE.md`](../../CLAUDE.md)).
2. **실행 시점이 맞다.** 코어 `Company.on_update` ([`company.py:455-475`](../../erpnext/setup/doctype/company/company.py)) 는 `create_default_accounts` → `create_default_warehouses` → `create_default_tax_template` → `set_default_accounts` 순으로 끝낸 뒤 `doc_events` 의 `on_update` 를 호출한다. 앱 훅이 돌 때는 계정·코스트센터·창고가 모두 존재한다.
3. **이름 매칭 6항목은 번호로만 채울 수 있다.** 코어는 `_("Write Off")`, `_("Bank Charges")`, `_("Exchange Gain/Loss")` 등 번역된 영문 계정명으로 찾는다(`company.py:790-826`). 한국 계정명으로는 절대 잡히지 않는다(KB-KOR-002 §6.2).
4. **부가세 템플릿은 코어 경로가 0건이다.** [`country_wise_tax.json:4715`](../../erpnext/setup/setup_wizard/data/country_wise_tax.json) 의 키는 `"South Korea"` 인데 `Company.country` 는 `"Korea, Republic of"` 라 [`taxes_setup.py:20-23`](../../erpnext/setup/setup_wizard/operations/taxes_setup.py) 이 즉시 return 한다. 같은 파일의 `from_detailed_data(company_name, data)` (`:87`) 가 공개 함수이므로 앱이 같은 포맷의 데이터를 넘겨 호출한다. 포크의 JSON 을 고칠 이유가 없다.
5. **`erpnext/regional/korea/` 는 만들 수 없다.** `frappe.scrub("Korea, Republic of")` 가 `korea,_republic_of` 를 만들어 import 가 불가능하다(CLAUDE.md). `taxes_setup.update_regional_tax_settings` (`:120`) 도 이 경로가 없으면 즉시 반환하므로 호출하지 않는다 — 컨테이너에서 경로 부재를 확인했다.

## 3. 실행 순서와 멱등 규칙

### 3.1 한국 회사 판정

`company.is_kr_company(company)` — `Company.chart_of_accounts == "한국 표준 계정과목표 (일반기업회계기준)"` 이거나, 그 회사에 `account_number=1131`(외상매출금) 원장이 있으면 참. 위저드 경로에서 `chart_of_accounts` 가 비어 있을 수 있어 마커 계정을 함께 본다. 다른 차트의 회사에서는 훅이 아무것도 하지 않는다.

### 3.2 순서

```
apply_all(company)
  1. company_defaults.apply   → Company.default_* 12개
  2. warehouses.apply         → Warehouse.account 4개, Company 창고 필드 3개
  3. taxes.apply              → 세금 템플릿 (1172/2151 계정이 있어야 한다)
  4. nts_codes.apply          → Account 표준코드, Company 매핑 개정 표식
```

순서는 고정이다. 반환값은 `{"defaults": …, "warehouses": …, "taxes": …, "nts_codes": …}` 이며 각 항목은 `{"applied": [...], "skipped": [...]}` 를 기본으로 한다(`nts_codes` 는 `kept`·`missing`·`map_revision` 추가).

훅은 **회사를 저장할 때마다** 실행된다(`on_update`). 멱등이므로 2회째부터는 읽기 몇 번과 `skipped` 보고뿐이다.

### 3.3 네 모듈 공통 규칙

| 규칙 | 구현 | 이유 |
|---|---|---|
| 빈 값만 채운다 | 필드·계정·템플릿이 이미 있으면 `skipped` 에 `already set` 사유로 남긴다 | 테넌트가 손본 값을 훅이 되돌리지 않는다 |
| `doc.save()` 금지 | `frappe.db.set_value` / `frappe.db.bulk_update` 만, `update_modified=False` | `Company.on_update` 재귀 방지. `modified` 를 안 건드려 사용자 편집과 구분된다 |
| 예외를 삼키지 않는다 | 매핑표 손상·Custom Field 부재·계정 부적합은 throw 또는 `skipped` 사유 | 무증상 실패를 만들지 않는다 |
| commit 없음 | 훅은 Company 트랜잭션 안에서 돈다. `backfill` 만 commit | 회사 생성이 실패하면 훅 결과도 함께 롤백된다 |
| 코어 검증 재현 | `db.set_value` 는 `Company.validate_default_accounts` (`company.py:360-414`: 리프·활성·같은 회사·회사통화)를 우회하므로 같은 조건을 `_check_account` 로 검사한다 | 이후 사용자가 Company 폼을 저장할 때 실패하지 않게 한다 |

캐시: `frappe.db.set_value` 는 내부에서 `clear_document_cache` 를 부르지만 `bulk_update` 는 부르지 않는다. 그래서 `nts_codes` 는 갱신한 계정마다 `frappe.clear_document_cache("Account", name)` 을 호출하고, `warehouses` 는 창고 계정을 바꾼 뒤 요청 단위 캐시 `frappe.flags.warehouse_account_map` 을 `{}` 로 비운다(`None` 이면 [`stock/__init__.py:20`](../../erpnext/stock/__init__.py) 의 `setdefault().get()` 이 깨진다).

## 4. 기본계정 (`company_defaults.py`)

### 4.1 훅이 채우는 12개

계정번호·이름은 [`kr_standard_chart_of_accounts.json`](../../erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_standard_chart_of_accounts.json) 기준. 실측 12/12 일치.

| Company 필드 | 계정 | 근거 (코어 사용처) |
|---|---|---|
| `write_off_account` | 5480 잡손실 | Sales Invoice / Payment Entry 의 소액 write-off(단수·잔액 정리). 대손은 JE 로 5325 대손상각비에 직접 기표한다 |
| `bank_charges_account` | 5322 지급수수료 | Payment Entry / Bank Transaction 의 은행수수료 행 |
| `exchange_gain_loss_account` | 5422 외환차손익 | 단일 계정 **폴백**. [`exchange_gain_loss.py:14-18`](../../erpnext/accounts/services/exchange_gain_loss.py) 이 gain/loss 분리 필드를 우선 쓰므로 평소 잔액이 생기지 않는다 |
| `exchange_gain_account` | 4250 외환차익 | 실현 환차익 (위 함수가 우선 사용) |
| `exchange_loss_account` | 5420 외환차손 | 실현 환차손 |
| `unrealized_exchange_gain_loss_account` | 5423 외화환산손익 | Exchange Rate Revaluation 이 차익·차손을 모두 기표. 결산 시 4251/5421 대체(KB-KOR-002 §9-3) |
| `disposal_account` | 5452 유형자산처분손익 | Asset 매각 Sales Invoice 행의 income_account |
| `default_deferred_revenue_account` | 2142 선수수익 | Item Group 기본값으로 내려간다 ([`item_group.py:125`](../../erpnext/setup/doctype/item_group/item_group.py)) |
| `default_deferred_expense_account` | 1174 선급비용 | `item_group.py:124` |
| `default_discount_account` | 4191 제품매출할인 | 4190 은 그룹이라 리프 필요. 제조업 타깃이므로 제품(4192 상품 아님). Payment Entry 조기결제 할인 손실 행과 품목 `discount_account` 기본값. **매입 측 조기결제 할인(Pay)도 같은 필드**를 쓴다 |
| `default_operating_cost_account` | 5251 잡비(제) | BOM 작업(Operation) 원가·비재고 품목 원가가 제조 Stock Entry `additional_costs` 의 `expense_account`(대변, 제조경비 흡수)로 들어간다 ([`operations_cost.py:17-31`](../../erpnext/manufacturing/doctype/bom/services/operations_cost.py)). 영구재고 회사에서 이 필드가 비면 작업이 있는 Work Order 의 제조 전표가 실패한다. 워크스테이션 단가는 노무·전력·소모품 혼합이라 단일 성격 계정이 없어 제조경비 리프 중 기타(잡비)를 택했다 |
| `default_provisional_account` | 2162 용역수령미청구 | 코어 CoA 임포터가 `Service Received But Not Billed` 타입 계정을 이 필드에 넣는 선례 ([`chart_of_accounts_importer.py:515-518`](../../erpnext/accounts/doctype/chart_of_accounts_importer/chart_of_accounts_importer.py)). `enable_provisional_accounting_for_non_stock_items` 를 켤 때 비어 있으면 `Company.validate` 가 throw 하므로(`company.py:688-698`) 미리 채운다 |

### 4.2 의도적으로 비워 두는 것 (`INTENTIONALLY_EMPTY`)

| 필드 | 이유 |
|---|---|
| `default_purchase_price_variance_account` | 표준원가(Item Standard Cost) 전용. [`item_standard_cost.py:334-353`](../../erpnext/stock/doctype/item_standard_cost/item_standard_cost.py) 에서만 읽히며 비어 있으면 명확한 메시지로 throw. 한국 차트에 원가차이 계정이 없다. 표준원가 테넌트가 나올 때 `tree_draft.json` 에 추가한다 |
| `default_manufacturing_variance_account` | 위와 같음 (`item_standard_cost.py:357-376`) |
| `default_advance_received_account` / `default_advance_paid_account` | **사용자 결정** — 선수금 2141 / 선급금 1144 에 Receivable/Payable 타입을 부여하지 않았다(KB-KOR-002 §8 결함 24, §11-5). `book_advance_payments_in_separate_party_account` 를 켜지 않는다 |
| `default_scrap_warehouse` | 코어가 스크랩 창고를 만들지 않는다. `work_order.py:1122-1131` 이 None 을 허용한다 |

### 4.3 훅이 건드리지 않는 것 — 코어가 채우는 15 + 4

`account_type` 매칭으로 코어 `set_default_accounts` (`company.py:741`) 가 채우는 것: 수취 1131 · 지급 2111 · 현금 1111 · 은행 1115 · 단수차이 5490 · 매출원가 5120 · 매출 4111 · 재고 1155 · 재고조정 5140 · 입고미청구 2161 · 출고미청구 1160 · 감가상각누계액 1243 · 감가상각비 5311 · 건설중 1246 · 자산취득미청구 2163 · 기초잔액단수차이 2174, 코스트센터 3(`기본 - 약어`), `default_warehouse`. 실측 전부 기대값.

훅은 이 필드들에 개입하지 않는다. 따라서 **같은 타입 원장이 여럿일 때 JSON 형제 순서가 기본계정을 정한다는 규칙(KB-KOR-002 §6.1)은 그대로 유효하다.** KB-KOR-002 §11-1 초판은 "훅이 있으면 형제 순서 의존이 사라진다"고 적었으나 그 범위로는 구현하지 않았다 — 빈 필드만 채우는 멱등 규칙과 양립하지 않기 때문이다.

## 5. 창고 (`warehouses.py`)

코어 `create_default_warehouses` (`company.py:495-534`) 는 `All Warehouses` 그룹 아래 창고 4개를 만들고 `default_warehouse` 만 채운다. 창고 `account` 와 Company 창고 필드 3개는 비어 있다.

| role | 코어 영문명 → 표시명 | `account` | Company 필드 |
|---|---|---|---|
| stores | Stores → `창고`(앱 ko.po) / `백화점`(포크 ko.po, 앱 교정 전) | 1155 원재료 | — (`default_warehouse` 는 코어가 채움) |
| wip | Work In Progress → `작업 진행 중` | 1154 재공품 | `default_wip_warehouse` |
| fg | Finished Goods → `완제품` | 1152 제품 | `default_fg_warehouse` |
| transit | Goods In Transit → `운송 중인 상품` (`warehouse_type=Transit`) | 1158 미착품 | `default_in_transit_warehouse` |

- **왜 Stores 에도 명시하는가.** 창고 계정 우선순위([`stock/__init__.py:56-99`](../../erpnext/stock/__init__.py))는 `Warehouse.account` → 조상 창고 `account` → `Company.default_inventory_account` → 유일 Stock 리프. `Warehouse.account` 가 회사 기본값을 이기므로 기본값이 바뀌어도 Stores 는 1155 를 유지한다. 그룹 `All Warehouses` 는 비워 둔다.
- **식별은 `warehouse_name` 으로.** `Warehouse.name` 은 `"<warehouse_name> - <abbr>"` ([`warehouse.py:55-62`](../../erpnext/stock/doctype/warehouse/warehouse.py)) 라 회사마다 다르다. 후보 집합 = 영문 + 포크 번역 + 앱 번역 + 런타임 `_()` (현재 언어·ko). 생성 순서(`creation`)에는 의존하지 않는다 — 사용자가 창고를 추가하면 깨진다.
- **Transit 은 타입 우선.** 코어가 `warehouse_type="Transit"` 을 붙이는 유일한 창고이고 `default_in_transit_warehouse` 의 `link_filters` ([`company.json:771`](../../erpnext/setup/doctype/company/company.json)) 도 Transit 을 요구한다. 매칭 순서: 이름이 맞는 Transit → 유일한 Transit → 이름만. 타입이 맞지 않는 창고는 Company 필드에 넣지 않고 `skipped`.
- `Warehouse.on_update` 는 NestedSet 갱신뿐이라(`warehouse.py:96-100`) `account` 만 바꾸는 데 `doc.save()` 가 필요 없다. 계정 적합성(리프·활성·`account_type=Stock`)은 `_check_stock_account` 가 본다.
- 위저드 밖에서 만든 회사는 `Warehouse Type "Transit"` 이 없어 코어 창고 생성 자체가 실패할 수 있다(KB-KOR-002 §9-9). 이 모듈은 Transit 창고가 없으면 `skipped` 로 보고할 뿐 만들지 않는다.

## 6. 부가세 템플릿 (`taxes.py`, `data/kr_tax_defaults.json`)

### 6.1 생성 결과

템플릿 이름은 autoname 으로 `"<title> - <약어>"` 가 된다. 모든 행 `charge_type=On Net Total`, `cost_center=Company.cost_center`. 실측(약어 SHV) 그대로다.

| 종류 | title | 계정 | rate | category | 기본 |
|---|---|---|---|---|---|
| Sales | 과세매출 (부가세 10%) | 2151 부가세예수금 | 10 | Total | ✅ |
| Sales | 영세율매출 (0%) | 2151 | 0 | Total | |
| Sales | 면세매출 | 2151 | 0 | Total | |
| Purchase | 과세매입 (부가세 10%) | 1172 부가세대급금 | 10 | Total / Add | ✅ |
| Purchase | 영세율매입 (0%) | 1172 | 0 | Total / Add | |
| Purchase | 면세매입 | 1172 | 0 | Total / Add | |
| Purchase | 불공제매입 (기업업무추진비) | 5307 기업업무추진비 | 10 | **Valuation and Total** / Add | |
| Purchase | 불공제매입 (비영업용소형승용차) | 5316 차량유지비 | 10 | Valuation and Total / Add | |
| Purchase | 불공제매입 (사업무관) | 5310 세금과공과 | 10 | Valuation and Total / Add | |
| Item Tax | 과세 10% | 2151 → 10, 1172 → 10 | | | |
| Item Tax | 영세율 0% | 2151 → 0, 1172 → 0 | | | |
| Item Tax | 면세 0% | 2151 → 0, 1172 → 0, `not_applicable=1` | | | |
| Tax Category | 영세율 · 면세 | 전역 문서(회사 무관). 템플릿에는 연결하지 않는다 | | | |

데이터 포맷은 `country_wise_tax.json` 의 상세 포맷("Germany"·"Australia" 항목)과 같다. 주의할 점 두 가지.

- **`root_type` 을 반드시 명시한다.** `get_or_create_account` (`taxes_setup.py:211`) 는 `{company, root_type}` 필터 안에서 번호·이름으로 찾는데 기본값이 `Liability` 라 자산 계정 1172 는 root_type 없이는 못 찾고 **2150 예수금 아래에 같은 이름의 계정을 새로 만든다.** 실측: 계정 수 324 유지, `1172`·`2151` 각 1건, ` 1` 접미 0건.
- **계정 dict 의 `tax_rate` 와 행의 `rate` 는 다르다.** 전자는 계정을 새로 만들 때와 UI 에서 계정을 고를 때 기본값, 후자가 실제 계산값. 모든 행에 `rate` 를 적었다.

멱등 안전장치: (1) 회사에 Sales/Purchase 템플릿이 **1건이라도** 있으면 `skipped`, (2) 데이터가 참조하는 계정번호+root_type(1172 Asset · 2151 Liability · 5307/5316/5310 Expense)이 하나라도 없으면 `skipped` — 코어가 새 계정을 만드는 사고를 막는다, (3) `from_detailed_data` 가 입력 dict 를 제자리 수정하므로 `load_defaults()` 가 매번 파일을 다시 읽는다.

### 6.2 불공제 매입세액 — 처리 방식과 한계

부가세법 §39 불공제(기업업무추진비·비영업용소형승용차·사업무관)는 세액을 공제받지 못하므로 취득원가 또는 비용으로 처리한다. `category` 후보 셋 중 하나를 골라야 한다.

| category | GL | 판정 |
|---|---|---|
| Valuation | 세액이 `grand_total` 에서 빠져 Cr 외상매입금 = 공급가액만 | 공급대가를 지급하는 불공제에 틀림 — 기각 |
| Total | Dr 비용(품목) + Dr account_head / Cr 외상매입금 | 재고·자산 매입에서 취득원가에 가산되지 않음(승용차 구입) — 기각 |
| **Valuation and Total** (채택) | 재고·자산 품목: `update_valuation_rate` ([`buying_controller.py:417`](../../erpnext/controllers/buying_controller.py)) 가 세액을 `valuation_rate` 에 가산하고 account_head 는 Dr(Total 분)/Cr(Valuation 분)로 상계 → Dr 재고/자산 110 / Cr 외상매입금 110. 비재고 품목만 있는 문서: `validate_stock_or_nonstock_items` (`:251`) 가 `Total` 로 되돌려 Dr 비용 100 + Dr account_head 10 / Cr 외상매입금 110 | 두 경우 모두 불공제분의 회계처리와 맞다 |

실측(8-c): 비재고 품목 1,000,000 을 `불공제매입 (기업업무추진비)` 로 매입 → GL `5322 Dr 1,000,000 / 5307 Dr 100,000 / 2111 Cr 1,100,000`, 1172 미사용. 저장 시 코어 `msgprint("Tax Category has been changed to Total …")` 이 뜬다.

한계 (구현 담당 분석, 사람 판단 대상):

1. **비재고 문서마다 msgprint.** 동작은 정상이나 저장할 때마다 메시지가 뜬다. 번역으로 완화 가능.
2. **품목별 배분 quirk.** `get_item_tax_amount` (`buying_controller.py:520-536`) 는 품목 `item_tax_rate` 에 account_head 가 있을 때만 품목별 세액을 배분하고, 없으면 마지막 행 품목에 전액을 몰아준다(총액 보존). 재고·비재고 혼합 문서에서 품목별 정확한 취득원가가 필요하면 불공제용 Item Tax Template(5307/5316/5310 → 10)을 따로 두어야 한다. 현재 없다.
3. **picker 에 뜨지 않는다.** 5307/5316/5310 은 `account_type` 이 비어 있어 매입 문서 account_head 드롭다운 필터(Tax/Chargeable/Income Account/Expenses Included In Valuation)에 걸리지 않는다. 훅이 만든 템플릿 행은 정상 동작하고 이름을 직접 입력하면 저장된다.
4. **PR 과 PI 가 다른 기간에 걸치면** account_head 에 PR 시점 Cr, PI 시점 Dr 이 나뉘어 기간 손익에 일시 노이즈가 생긴다(코어 Valuation 처리 방식). 전용 통과계정을 쓰면 없어지지만 비재고 문서에서는 그 계정이 비용이 되어 부적절하다.
5. **신고서 불공제 명세.** `tabPurchase Taxes and Charges` 행(account_head 또는 템플릿명, 세액)과 PI `net_total` 로 산출 가능하지만 별도 리포트는 없다. 코어 itemised tax breakup 은 `Valuation and Total` 세액을 출력물에 표시한다.

### 6.3 영세율·면세 템플릿에 세율 0 행을 두는 이유 — 사양 이탈

과제 사양은 "면세 → 세액행 없음"이었으나 각 템플릿에 계정 행 1개(rate 0)를 두었다.

`Accounts Settings.add_taxes_from_item_tax_template` 기본값이 1 이다(이 사이트도 1). 문서의 `taxes` 가 비어 있으면 [`accounts/services/taxes.py:47-63`](../../erpnext/accounts/services/taxes.py) 이 품목 `item_tax_rate` 의 **모든** 계정을 행으로 추가한다. 품목 템플릿이 양방향(2151+1172)이라 빈 `taxes` 의 매출 문서에 1172 10% 행이 생겨 총액이 틀어진다. 템플릿에 행이 하나라도 있으면 이 경로가 실행되지 않는다. 세액 0 행은 GL 을 만들지 않는다(gl_composer 가 `flt(base_amount)` 로 거른다). Australia `AU Sales - GST Free` 가 같은 구성이다.

실측: 영세율매출(8-d) 은 taxes 행 1개(rate 0, `net_amount` 1,000,000 과세표준 포함), GL 은 1131/4111 만. 면세매출(8-e) 도 GL 은 같으나 `부가세 해당없음 (면세) 0` 행이 남는다 → 검증 담당이 **사양 문자 기준 low 결함**으로 기록. 빈 템플릿을 원하면 `kr_tax_defaults.json` 에서 해당 `taxes` 를 `[]` 로 바꾸면 된다(코드 변경 불필요). 승인 대기(§11).

품목 템플릿을 방향별로 나누지 않은 이유: `_get_item_tax_template` ([`get_item_details.py:872-940`](../../erpnext/stock/get_item_details.py)) 이 `tax_category` 만으로 첫 템플릿을 고르므로(문서 방향 비인식) 나누면 매입 문서에서 영세율 품목이 10% 로 계산된다. 면세는 `not_applicable=1` 로 세액 0 이고 과세표준에서도 제외, 영세율은 rate 0 으로 과세표준에 포함(부가세법상 과세거래).

### 6.4 Tax Category 와 Tax Rule

템플릿의 `tax_category` 필드는 "회사당 카테고리별 템플릿 1개" 유일성 검증에만 쓰이고 선택 로직에는 쓰이지 않는다. 실제 연결은 거래처/주소 `tax_category` → Tax Rule → 템플릿이다. 그래서 `영세율`·`면세` Tax Category 는 전역 문서로 만들되 템플릿에는 걸지 않아 사용자 템플릿 추가를 막지 않는다. **Tax Rule 은 만들지 않았다** — 수출 거래처가 자동으로 영세율매출 템플릿을 받게 하려면 회사별 Tax Rule 이 필요하다(§11).

## 7. 국세청 표준코드 (`nts_codes.py`)

### 7.1 Custom Field 8개

`ensure_custom_fields()` 가 `create_custom_fields(..., update=True)` 로 멱등 생성한다. `after_install` / `after_migrate` 에서 실행되므로 `bench migrate` 마다 보장된다. 실측: 3회 실행 후 8개 필드의 `modified` 불변.

| DocType | fieldname | 타입 | 위치 | 용도 |
|---|---|---|---|---|
| Account | `setive_nts_section` | Section Break | `include_in_gross` 뒤, `depends_on: eval:!doc.is_group` | 그룹 계정에서는 숨김 |
| Account | `setive_nts_bs_code` | Data | 섹션 첫 필드 | 표준재무상태표 행 코드 |
| Account | `setive_nts_is_code` | Data | | 표준손익계산서 행 코드 |
| Account | `setive_nts_mfg_code` | Data | | 제조원가명세서 행 코드 |
| Account | `setive_nts_column_break` | Column Break | | |
| Account | `setive_nts_role` | Select `""`/`reconcile_only`/`not_applicable` | | 서식 행 미배정 계정의 역할(KB-KOR-002 §7.2) |
| Account | `setive_nts_note` | Small Text | | `[미검증] 서식 행: <label> — <note>` |
| Company | `setive_nts_map_revision` | Data | `chart_of_accounts` 뒤 | 적용한 매핑표의 서식 개정일 `bs=…;is=…;mfg=…` |

설계 근거:

- 섹션을 `account_number` 뒤가 아니라 마지막 표준 필드 뒤에 둔 것은 Account 폼이 두 컬럼이라 중간에 끼우면 첫 컬럼이 잘리기 때문이다. 코어 선례([`erpnext/regional/italy/setup.py`](../../erpnext/regional/italy/setup.py))처럼 `insert_after` 를 연쇄한다.
- `module` 은 `modules.txt` 의 실제 값 `SETIVE ERPNext KR`. Custom Field.module 은 Module Def 링크라 다른 값이면 LinkValidationError.
- `reqd` 없음 — `chart_of_accounts.py` 가 root 계정에만 `ignore_mandatory` 를 주므로 필수 필드가 있으면 회사 생성이 깨진다. `read_only` 없음 — 테넌트 재매핑 허용. 코드는 선행 0 보존을 위해 Data.
- 코드로 생성하므로 `export_customizations` 회수 대상이 아니다. 앱 모듈 폴더에 `custom/*.json` 이 없음을 확인했다 — 같은 필드를 `custom/` 에도 두면 이중 관리가 되므로 만들지 않는다.

### 7.2 `apply(company, force=False)`

매핑표(`data/nts_standard_code_map.json`, schema 2, 272건)를 읽어 회사 원장(`is_group=0`)에 `bulk_update`(`update_modified=False`) 한 문장으로 기록한다.

| 반환 키 | 의미 |
|---|---|
| `applied` | 이번에 채운 계정번호 |
| `kept` | `force=False` 에서 bs/is/mfg/role 중 하나라도 이미 있어 보존한 계정 |
| `skipped` | 매핑표에 없는 원장(테넌트 추가 계정, 번호 없는 계정은 이름) |
| `missing` | 매핑표에는 있으나 회사에 없는 번호(테넌트가 지운 원장) |
| `map_revision` | `{"map": 매핑표 개정, "company": 회사 표식, "stale": 불일치}` |

- **미매핑 판정은 네 필드(bs/is/mfg/role)가 모두 빈 것.** `note` 는 보조 정보라 판정에서 뺐다.
- **`force=True`** 는 매핑표로 전부 덮어쓴다. 서식 개정 뒤 일괄 재적용용이며 테넌트 재매핑을 잃는다.
- **개정 표식**은 Company 필드가 비어 있을 때(또는 force)만 기록하고, 있으면 덮지 않고 `stale` 로 보고한다. 실측값 `bs=2021-10-28;is=2024-03-22;mfg=2023-03-20`.
- role 도출: 매핑표 role 이 있으면 그대로(reconcile_only 7), 코드도 role 도 없으면 `not_applicable`(3140 인출금 1건). Select 옵션 밖의 role 은 throw.
- **Custom Field 가 없으면 throw** 한다(`_assert_fields_exist`). `Company.on_update` 안에서 `create_custom_fields` → DDL 을 유발하면 암묵 커밋으로 실패한 회사 생성이 부분 커밋될 수 있어 자동 생성하지 않는다. `after_install` 이 실행되지 않은 사이트는 §8 의 1단계를 먼저 밟는다.

실측: 원장 272 중 272 채움(bs 137 · is 92 · mfg 35 · reconcile_only 7 · not_applicable 1 · `[미검증]` 33) = 매핑표 `meta.counts` 와 일치, `kept`/`skipped`/`missing` 모두 비어 있음.

### 7.3 `report_unmapped(company)` (whitelisted)

`System Manager` 또는 `Accounts Manager` 전용 읽기 점검. 코드·역할이 전부 빈 원장 목록(`unmapped`), `ledger_count`, 회사 표식과 현재 매핑표의 `stale` 여부를 돌려준다. `stale=True` 면 운영자가 `apply(company, force=True)` 를 판단한다.

## 8. 기존 사이트 백필 절차

훅은 Company 저장 시에만 돈다. 다음 경우에는 `backfill` 을 수동 실행한다.

- 앱을 설치하기 전에 만든 회사가 있다 (KB-OPS-001 §5.1 3a 단계)
- 훅이 실패한 채 회사가 만들어졌다 / 사용자가 기본계정·창고 계정·표준코드를 지웠다
- 매핑표가 개정되어 `report_unmapped` 가 `stale=True` 를 보고한다 (이 경우는 `nts_codes.apply(force=True)`)

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"
COMPANY='<회사명>'

# 1. Custom Field 보장 — install-app(after_install) 또는 migrate(after_migrate) 가 이미 했으면 생략 가능. 기대 8
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.ensure_custom_fields
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':['like','setive_nts_%']}}"

# 2. 백필 (멱등, System Manager. bench execute 는 Administrator 로 실행되어 통과). 한국 차트 회사가 아니면 throw
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.company.backfill \
  --kwargs "{'company':'$COMPANY'}"

# 3. 표준코드 점검 — 기대: unmapped_count 0, stale False
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.report_unmapped \
  --kwargs "{'company':'$COMPANY'}"

# 4. (서식 개정 시에만) 매핑표로 전부 덮어쓰기 — 테넌트 재매핑이 사라진다
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.apply \
  --kwargs "{'company':'$COMPANY','force':True}"
```

결과 해석: `applied` 가 비어 있고 `skipped` 사유가 전부 `already set` / `tax templates already exist` / `kept` 면 이미 적용된 회사다. 세금 템플릿은 회사에 템플릿이 하나라도 있으면 생성하지 않으므로, 템플릿을 일부만 지운 회사는 `kr_tax_defaults.json` 을 참고해 손으로 보충한다.

실측(7): Company `write_off_account`·`exchange_gain_account`, 창고 `완제품`.account, 원장 1131/4111/5120 의 표준코드 5필드를 비운 뒤 `backfill` → defaults 2 · warehouses 1 · nts_codes 3 복원, 원 스냅샷과 diff 0.

`.py` 를 바꾼 뒤 웹(gunicorn) 반영은 재기동이 필요하다(KB-OPS-001 §5.3). `bench execute` 는 새 프로세스라 즉시 반영된다.

## 9. 검증

### 9.1 재현 명령

저장소 루트(`setive-oss-erpnext-16.33`)에서 실행한다. `<회사명>` 은 한국 차트로 만든 회사.

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"
COMPANY='<회사명>'

# 훅 등록 — 기대: {'Company': {'on_update': ['setive_erpnext_kr.korea.common.company.on_update']}}
$EXEC bench --site $SITE execute frappe.get_hooks \
  --kwargs "{'hook':'doc_events','app_name':'setive_erpnext_kr'}"

# 앱 import (env 파이썬이어야 한다, KB-OPS-001 §1.4)
$EXEC /home/frappe/frappe-bench/env/bin/python -c \
  "from setive_erpnext_kr.korea.common import company, company_defaults, warehouses, taxes, nts_codes; print('OK')"

# 계정 수 — 기대 324 (포크 차트 md5 4a5b7e9873dc3eee93bffb046137836b, HEAD 1b9e100)
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Account','filters':{'company':'$COMPANY'}}"

# 기본계정 — 기대: 5480 잡손실 / 4250 외환차익 / 5251 잡비(제) / 완제품 - <약어> / bs=2021-10-28;is=2024-03-22;mfg=2023-03-20
$EXEC bench --site $SITE execute frappe.client.get_value \
  --kwargs "{'doctype':'Company','filters':{'name':'$COMPANY'},'fieldname':['write_off_account','exchange_gain_account','default_operating_cost_account','default_fg_warehouse','setive_nts_map_revision']}"

# 창고 계정 — 기대: 창고 1155 · 작업 진행 중 1154 · 완제품 1152 · 운송 중인 상품(Transit) 1158 · 모든 창고 없음
$EXEC bench --site $SITE execute frappe.client.get_list \
  --kwargs "{'doctype':'Warehouse','filters':{'company':'$COMPANY'},'fields':['name','warehouse_type','account']}"

# 세금 템플릿 — 기대: Sales 3, Purchase 6, Item Tax 3
for DT in 'Sales Taxes and Charges Template' 'Purchase Taxes and Charges Template' 'Item Tax Template'; do
  $EXEC bench --site $SITE execute frappe.client.get_count \
    --kwargs "{'doctype':'$DT','filters':{'company':'$COMPANY'}}"
done

# 세액 계정 중복 없음 — 기대 1 / 1
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Account','filters':{'company':'$COMPANY','account_number':'1172'}}"
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Account','filters':{'company':'$COMPANY','account_number':'2151'}}"

# 표준코드 — 기대: ledger_count 272, unmapped_count 0, stale False
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.report_unmapped \
  --kwargs "{'company':'$COMPANY'}"

# 멱등 — 두 번 실행해 두 번째의 applied 가 전부 [] 인지
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.company.backfill \
  --kwargs "{'company':'$COMPANY'}"
```

회사 생성 자체는 셋업 위저드(KB-ARCH-001) 또는 Company 폼으로 한다. 위저드 미완료 사이트에서 코드로 만들 때는 `Fiscal Year` 와 `Warehouse Type "Transit"` 이 먼저 있어야 한다(KB-KOR-002 §9-9). 이번 E2E 스크립트는 세션 스크래치패드에 있어 저장소에 없다(§10-9).

### 9.2 2026-09-06 실측 요약

회사 `SETIVE 훅검증`(약어 SHV, KRW, `Korea, Republic of`, 한국 차트)을 `bench execute` 안에서 `lang='ko'` 로 insert → 측정 → GL 스모크 → 역순 삭제. Error Log 4 → 4.

| # | 항목 | 결과 |
|---|---|---|
| 1 | 회사 생성(훅 트리거) | 예외 없음 |
| 2 | 계정 324(그룹 52) · Company 기본계정 39개 덤프 | 훅 대상 12/12, 코어 대상 전부 기대값, 비어야 하는 5개(선급/선수 2 · 원가차이 2 · scrap 창고)만 비어 있음 |
| 3 | 창고 `account` + Company 창고 필드 3 | 표 §5 그대로. `get_warehouse_account_map` 도 같은 계정 해석 |
| 4 | 세금 템플릿 | Sales 3 · Purchase 6 · Item Tax 3 · Tax Category 2, 행 계정·세율·category 전부 §6.1. 1172/2151 각 1건, 계정 수 324 유지, Tax Rule 0 |
| 5 | Custom Field 8 · 원장 272 코드 | §7.2 |
| 6 | 멱등 — `apply_all` 2회 추가 | applied 모두 `[]`, 전후 스냅샷(Company 39필드+표식, 창고 account, 계정 5필드+modified, 템플릿 행, 카운트) diff 0 |
| 7 | 백필 | §8 |
| 8-a | SI 과세매출 1,000,000 | GL 1131 Dr 1,100,000 / 4111 Cr 1,000,000 / 2151 Cr 100,000 |
| 8-b | PI 과세매입(비재고, 5322) | GL 5322 Dr 1,000,000 / 1172 Dr 100,000 / 2111 Cr 1,100,000 |
| 8-c | PI 불공제매입(기업업무추진비, 비재고) | category `Total` 로 환원(msgprint), GL 5322 Dr 1,000,000 / 5307 Dr 100,000 / 2111 Cr 1,100,000 |
| 8-d | SI 영세율매출 | taxes 행 1(rate 0, 과세표준 포함), GL 1131/4111 만 |
| 8-e | SI 면세매출 | GL 은 8-d 와 같음. `부가세 해당없음 (면세) 0` 행 존재 — **사양 문자 기준 low 결함**(§6.3) |
| 추가 | `Company.save()` · `Account.save()` | 훅이 `db.set_value` 로 채운 값이 코어 `validate_default_accounts`·`validate_warehouses` 통과, 훅 재실행 후 diff 없음 (§10-1 shim 적용 후) |
| 9 | 정리 | 회사 스코프 잔여 0, 전역 Company/GL/Fiscal Year/Item/Customer/Supplier 0, 시리즈 카운터 삭제. 남긴 것: Tax Category 2(전역), Custom Field 8(앱 자산) |
| 10 | 재기동 후 `/login` · `/api/method/ping` | 200 |

## 10. 알려진 한계·후속 과제

1. **환경 불일치 — 포크와 이미지 frappe 버전.** 이 체크아웃의 `erpnext/__init__.py` 는 `__version__ = "17.0.0-dev"` 이고 컨테이너 frappe 는 16.31.0 이다. 포크가 30개 파일 65곳에서 호출하는 `Meta.get_translated_label` 이 컨테이너 frappe 에 없어(`grep -c` 0) `Company.validate_warehouses` ([`company.py:326`](../../erpnext/setup/doctype/company/company.py) — 창고 필드가 채워지면 무조건 호출)와 `get_item_details.validate_conversion_rate` (`:1445`) 에서 AttributeError 가 난다. **훅이 창고 필드를 채운 뒤 웹 UI 에서 Company 를 저장하거나 전표 품목을 입력하면 500 이 예상된다.** E2E 는 프로세스 내 shim 으로 우회했다. 훅 결함이 아니라 이미지 태그(frappe)와 포크 브랜치의 정합 문제이며 사람 결정이 필요하다. 같은 사이트에서 `Contact.is_billing_contact` Custom Field 미적용(SQL 1054), `tabSales Invoice.po_no` 컬럼 타입 불일치(1366), 셋업 위저드 미완료도 확인됐다 — `bench migrate`(이번 작업에서 금지) 또는 위저드 완료가 해결책이다.
2. **Transit 창고 타입.** 위저드 밖에서 만든 회사는 `Warehouse Type "Transit"` 이 없어 코어 창고 생성이 실패할 수 있다. 앱 fixtures 또는 `after_migrate` 로 보장할지 결정 필요.
3. **v16 신규 Company 필드는 비워 두었다** (과제 범위 20개 밖). `purchase_expense_account` / `purchase_expense_contra_account`, `expenses_added_to_stock_account` / `…_contra_account` 는 `Accounts Settings.book_stock_expense_gl_entries` 를 켜면 재고 품목 매입에서 throw 한다(`buying_controller.py:325-344`). `service_expense_account`(외주가공, 5248 후보), `unrealized_profit_loss_account`(내부거래)도 후속 결정.
4. **Tax Rule 미생성** (§6.4).
5. **불공제 한계 5건** (§6.2).
6. **훅 값이 `doc.save()` 로 덮일 가능성.** 훅은 `db.set_value` 로 쓰므로 같은 in-memory Company 문서를 훅 뒤에 다시 `save()` 하는 호출자가 있으면 None 으로 덮인다. 위저드 경로(`install_fixtures`)는 `db.set_value` 만 쓰는 것을 확인했지만, 그런 호출자가 생기면 `company.py` 골격이 `doc` 에도 값을 반영하도록 바꿔야 한다.
7. **5307/5316/5310 `account_type` 비어 있음** — picker 미노출(§6.2-3). 타입 부여는 계정과목표 결정 사항.
8. **표준재무제표 리포트 미착수** (KB-KOR-002 §11-6). 코드는 채워졌으나 실행기가 없다.
9. **E2E 스크립트가 저장소 밖.** 회사 생성·측정·삭제 스크립트는 세션 스크래치패드에만 있다. `setive_erpnext_kr/scripts/` 로 편입해 §9.1 의 회사 생성 단계를 재현 가능하게 만드는 것이 후속 과제다.
10. **`report_unmapped` 허용 역할**(System Manager · Accounts Manager)이 적절한지. 읽기 전용이라 Accounts User 까지 열어도 무방하다.

## 11. 사용자 결정 필요 항목

| # | 항목 | 현재 구현 | 대안 |
|---|---|---|---|
| 1 | 면세·영세율 템플릿의 세율 0 행 (§6.3) | 행 1개 유지 (교차 방향 행 자동추가 차단) | `kr_tax_defaults.json` 의 `taxes` 를 `[]` 로 — `add_taxes_from_item_tax_template` 을 끄지 않으면 총액이 틀어진다 |
| 2 | `write_off_account` | 5480 잡손실 (과제 지시) | `tree_draft.json` 메모의 5325 대손상각비 — ERPNext write-off 로 대손을 처리할 계획이면 |
| 3 | `default_operating_cost_account` | 5251 잡비(제) — 제조 흡수액(대변)이 잡비 원장에 섞여 잔액이 음수가 될 수 있다 | `tree_draft.json` 에 `5256 제조경비배부(제)`(mfg 39, contra) 1건 추가 후 COA/매핑표 재생성(md5 변경) |
| 4 | `default_discount_account` 4191 | 매입 측 조기결제 할인(Pay)도 같은 계정 | 매입할인 계정(원재료 차감 등)을 차트에 둘지 |
| 5 | `Warehouse Type "Transit"` 보장 | 없으면 `skipped` | 앱 fixtures / `after_migrate` |
| 6 | 불공제 품목별 배분 | 불공제용 Item Tax Template 없음 | 5307/5316/5310 → 10 템플릿 3개 추가 |
| 7 | 불공제 통과계정 | 비용계정(5307/5316/5310)을 상계용으로 겸용 | `Expenses Included In Valuation` 타입 전용 계정 — 비재고 문서에서는 부적절 |
| 8 | Tax Rule | 없음 | 회사별 Tax Rule(Sales, `영세율` → `영세율매출 (0%) - <약어>`)을 훅에 추가할지, 테넌트 설정으로 둘지 |
| 9 | `Company.setive_nts_map_revision` | 편집 가능 | `read_only` — 테넌트가 손으로 재매핑한 뒤 표식을 갱신할 길이 막힌다 |
| 10 | `setive_nts_note` 에 서식 행 label 포함 | 포함 (`서식 행: <label> — <note>`) | 과제문은 '매핑 비고'만 명시. `values_for` 한 곳만 고치면 된다 |
| 11 | v16 신규 Company 필드 (§10-3) | 비움 | `purchase_expense_*` 4개 · `service_expense_account` · `unrealized_profit_loss_account` 지정 여부 |
| 12 | 이미지 frappe 태그 ↔ 포크 브랜치 정합 (§10-1) | 불일치 | 이미지 태그 상향 또는 포크를 v16.33 태그로 고정 |
