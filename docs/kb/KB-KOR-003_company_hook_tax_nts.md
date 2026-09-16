---
id: KB-KOR-003
title: Company 훅과 한국 세무 신원 필드 — 기본계정·창고·부가세 템플릿·국세청 표준코드·거래처 신원
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-16
verified_by: 개발 컨테이너 E2E(회사 생성→GL 스모크→삭제, 2026-09-06) + v16.33.0 리베이스 후 코어 심볼 재대조(2026-09-07) + 차트 md5·백필 점검 기대값 재실측(2026-09-16, §12) + 신원 필드는 코어 JSON 실측(company/customer/supplier field_order)·Custom Field 정의 정적 검산만 수행, 런타임 미검증(2026-09-16, §9.3) + 식별번호 체크섬은 scripts/identifiers/selftest.py 호스트 실행으로 검증 완료(2026-09-16)
related: [KB-KOR-002, KB-OPS-001, KB-ARCH-001, KB-KOR-008, KB-KOR-005, ONT-ENT-002]
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

### 4.1 훅이 채우는 12개 (16.33 에서 유효한 것은 9개)

계정번호·이름은 [`kr_standard_chart_of_accounts.json`](../../erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_standard_chart_of_accounts.json) 기준.

> ⚠️ **12개 중 3개는 ERPNext 16.33 의 Company DocType 에 필드가 없다 (미해결, 2026-09-07).** 아래 표에서 ✗ 표시된 `bank_charges_account` · `exchange_gain_account` · `exchange_loss_account` 는 17-dev 전용 필드였다. 실측: `grep -c '"bank_charges_account"' erpnext/setup/doctype/company/company.json` → 0.
> `company_defaults.apply()` 는 첫 문장에서 `frappe.db.get_value("Company", company, [*DEFAULTS.keys(), ...])` 로 12개를 한 번에 읽으므로, **컬럼이 없는 신규 16.33 사이트에서는 `OperationalError(1054) Unknown column` 이 나고 `Company.on_update` 훅 전체가 실패해 회사 생성이 롤백된다.**
> 현재 개발 사이트에서 통과하는 것은 리베이스 후 `bench migrate` 를 하지 않아 `tabCompany` 컬럼과 `tabDocField` 가 17-dev 상태로 남아 있기 때문이며 정합성 증거가 아니다.
> → 앱 `company_defaults.py` 의 `DEFAULTS` 에서 세 항목을 빼고, `apply()` 를 `frappe.get_meta("Company").has_field(f)` 로 걸러 버전 차이가 예외가 아니라 `skipped` 로 기록되게 한다. 사람 승인 사항이다.

아래 "16.33" 열: ✅ = Company 필드 실재, ✗ = 필드 없음(위 경고).

| Company 필드 | 16.33 | 계정 | 근거 (코어 사용처) |
|---|---|---|---|
| `write_off_account` | ✅ | 5480 잡손실 | Sales Invoice / Payment Entry 의 소액 write-off(단수·잔액 정리). 대손은 JE 로 5325 대손상각비에 직접 기표한다 |
| `bank_charges_account` | ✗ | 5322 지급수수료 | **16.33 Company 에 필드 없음.** 같은 이름이 Invoice Discounting 자체 필드로 존재할 뿐이고 `Company.bank_charges_account` 참조는 코어에 0건이다 |
| `exchange_gain_loss_account` | ✅ | 5422 외환차손익 | **16.33 이 실현 환차손익에 쓰는 유일한 계정.** 코어 13개 파일이 참조한다. 폴백이 아니다 |
| `exchange_gain_account` | ✗ | 4250 외환차익 | **16.33 Company 에 필드 없음** (코어 참조 0건). 4250/5420 분리 표시는 자동으로 되지 않으며 결산 대체분개가 필요하다 |
| `exchange_loss_account` | ✗ | 5420 외환차손 | 위와 같음 |
| `unrealized_exchange_gain_loss_account` | ✅ | 5423 외화환산손익 | Exchange Rate Revaluation 이 차익·차손을 모두 기표. 결산 시 4251/5421 대체(KB-KOR-002 §9-3) |
| `disposal_account` | ✅ | 5452 유형자산처분손익 | Asset 매각 Sales Invoice 행의 income_account |
| `default_deferred_revenue_account` | ✅ | 2142 선수수익 | [`stock/get_item_details.py`](../../erpnext/stock/get_item_details.py) `get_default_deferred_account` 가 Item Default → 문서 → `Company.default_<fieldname>` 순으로 읽는다 |
| `default_deferred_expense_account` | ✅ | 1174 선급비용 | 위와 같음 |
| `default_discount_account` | ✅ | 4191 제품매출할인 | 4190 은 그룹이라 리프 필요. 제조업 타깃이므로 제품(4192 상품 아님). Payment Entry 조기결제 할인 손실 행과 품목 `discount_account` 기본값. **매입 측 조기결제 할인(Pay)도 같은 필드**를 쓴다 |
| `default_operating_cost_account` | ✅ | 5251 잡비(제) | BOM 작업(Operation) 원가가 이 계정으로 흡수된다 ([`bom.py:1615`](../../erpnext/manufacturing/doctype/bom/bom.py)). 영구재고 회사에서 이 필드가 비면 작업이 있는 Work Order 의 제조 전표가 실패한다. 워크스테이션 단가는 노무·전력·소모품 혼합이라 단일 성격 계정이 없어 제조경비 리프 중 기타(잡비)를 택했다 |
| `default_provisional_account` | ✅ | 2162 용역수령미청구 | 코어 CoA 임포터가 `Service Received But Not Billed` 타입 계정을 이 필드에 넣는 선례 ([`chart_of_accounts_importer.py:513`](../../erpnext/accounts/doctype/chart_of_accounts_importer/chart_of_accounts_importer.py)). 소비처는 [`purchase_invoice.py:1343`](../../erpnext/accounts/doctype/purchase_invoice/purchase_invoice.py). `enable_provisional_accounting_for_non_stock_items` 를 켤 때 비어 있으면 `Company.validate_provisional_account_for_non_stock_items` 가 throw 하므로 미리 채운다 |

### 4.2 의도적으로 비워 두는 것 (`INTENTIONALLY_EMPTY`)

| 필드 | 이유 |
|---|---|
| `default_purchase_price_variance_account` | **16.33 에는 Company 필드도 `Item Standard Cost` DocType 도 없다 — 17-dev 전용 기능이다.** 쓰기 없음. 표준원가 도입 절차는 17 로 올라간 뒤로 유보한다(한국 차트에 원가차이 계정도 없다) |
| `default_manufacturing_variance_account` | 위와 같음 |
| `default_advance_received_account` / `default_advance_paid_account` | **사용자 결정** — 선수금 2141 / 선급금 1144 에 Receivable/Payable 타입을 부여하지 않았다(KB-KOR-002 §8 결함 24, §11-5). `book_advance_payments_in_separate_party_account` 를 켜지 않는다 |
| `default_scrap_warehouse` | 코어가 스크랩 창고를 만들지 않는다. `work_order.py:1122-1131` 이 None 을 허용한다 |

### 4.3 훅이 건드리지 않는 것 — 코어가 채우는 것

`account_type` 매칭으로 코어 `Company.set_default_accounts`([`company.py`](../../erpnext/setup/doctype/company/company.py)) 가 채우는 것: 수취 1131 · 지급 2111 · 현금 1111 · 은행 1115 · 단수차이 5490 · 매출원가 5120 · 매출 4111 · 재고 1155 · 재고조정 5140 · 입고미청구 2161 · 출고미청구 1160 · 감가상각누계액 1243 · 감가상각비 5311 · 건설중 1246 · 자산취득미청구 2163 · 기초잔액단수차이 2174, 그리고 코스트센터 3(`기본 - 약어`). 17-dev 에서 실측한 값이며 `default_warehouse` 는 16.33 Company 에 필드가 없어 목록에서 뺐다(§12).

훅은 이 필드들에 개입하지 않는다 — **단 하나의 예외**가 2026-09-08 에 생겼다: 업종 프로필(§4.4)이 방금 바뀐 저장에서는 재고·매출원가·매출·매출할인 4개 필드를 프로필 표준값으로 바꾼다(코어가 채운 표준값일 때만). 그 밖의 저장에서는 이전과 같이 개입하지 않는다. 따라서 **같은 타입 원장이 여럿일 때 JSON 형제 순서가 기본계정을 정한다는 규칙(KB-KOR-002 §6.1)은 그대로 유효하다.** KB-KOR-002 §11-1 초판은 "훅이 있으면 형제 순서 의존이 사라진다"고 적었으나 그 범위로는 구현하지 않았다 — 빈 필드만 채우는 멱등 규칙과 양립하지 않기 때문이다.

### 4.4 업종 프로필 필드 (`industry.py`)

Company Custom Field `setive_industry_profile`(Select `manufacturing` 기본 / `trading`, §7.1)이 아래 4개 필드와 창고 계정(§5)을 정한다.

| 필드 | manufacturing | trading |
|---|---|---|
| `default_inventory_account` | 1155 원재료 | 1151 상품 |
| `default_expense_account` | 5120 제품매출원가 | 5110 상품매출원가 |
| `default_income_account` | 4111 국내제품매출 | 4121 국내상품매출 |
| `default_discount_account` | 4191 제품매출할인 (DEFAULTS 가 채움) | 4192 상품매출할인 |

코어 `set_default_accounts` 가 회사 생성 시 앞의 셋을 먼저 채우므로 §3.3 의 '빈 값만' 규칙으로는 못 바꾼다. `industry.decide` 의 **전환 규칙**이 그 틈을 메운다: 값이 비어 있으면 채우고, 현재 값이 다른 프로필의 표준값이면 `switch=True` 일 때만 바꾸며(코어·이전 프로필이 자동으로 채운 값), 그 밖의 값은 사용자가 고른 것으로 보고 `skipped` 로 남긴다. `switch` 는 `Company.on_update` 에서 `doc.has_value_changed("setive_industry_profile")` 가 참일 때(신규 생성 포함)와 `backfill` 에서만 참이다 — 제조 회사가 매출원가를 5110 으로 골라 둔 것을 훅이 무관한 저장마다 되돌리면 안 되기 때문이다. 프로필이 바뀐 저장에서는 `nts_codes.apply(reseed_overlay=True)` 도 함께 돌아 매핑표 `profile_overrides`(trading: 5150 → is 38)가 계정에 반영된다 — 오버레이 대상 번호도 현재 값이 어느 프로필의 표준값일 때만 다시 쓰고, 테넌트가 손으로 고친 값은 `kept` 로 남긴다(§7.2). 전환 결과 중 건너뛴 항목(창고 미발견·재고 원장 보호·사용자 계정 유지)은 폼에 주황색 알림으로 보인다.

## 5. 창고 (`warehouses.py`)

코어 `Company.create_default_warehouses`([`company.py`](../../erpnext/setup/doctype/company/company.py)) 는 `All Warehouses` 그룹 아래 창고 4개를 만들 뿐 **어떤 Company 필드도 채우지 않는다.** 창고 `account` 와 Company 창고 필드 3개는 비어 있다.

| role | 코어 영문명 → 표시명 | `account` (manufacturing) | `account` (trading) | Company 필드 |
|---|---|---|---|---|
| stores | Stores → `창고`(앱 ko.po) / `백화점`(포크 ko.po, 앱 교정 전) | 1155 원재료 | 1151 상품 | — (16.33 Company 에 `default_warehouse` 필드가 없다. §12) |
| wip | Work In Progress → `작업 진행 중` | 1154 재공품 | 1151 상품 | `default_wip_warehouse` |
| fg | Finished Goods → `완제품` | 1152 제품 | 1151 상품 | `default_fg_warehouse` |
| transit | Goods In Transit → `운송 중인 상품` (`warehouse_type=Transit`) | 1158 미착품 | 1151 상품 | `default_in_transit_warehouse` |

- **계정은 업종 프로필(§4.4, `industry.WAREHOUSE_ACCOUNTS`)이 정한다** (2026-09-08). `apply(company, switch)` 는 창고마다 `industry.decide` 로 채움/전환/유지/사용자값을 판정하고, 전환은 그 창고에 재고 원장(`Stock Ledger Entry`, 취소분 제외)이 **없을 때만** 한다 — 이미 전기된 GL 과 어긋나면 안 된다. 원장이 있으면 `skipped` 에 `has stock ledger entries` 와 목표 계정을 남긴다. trading 의 운송 중 창고를 1158 이 아니라 1151 에 두는 이유는 KB-KOR-004 §4.6.

- **Stores 는 회사 단위 기본 창고로 지정되지 않는다.** 16.33 Company 에는 `default_warehouse` 필드가 없다(17-dev 전용). 회사와 무관한 전역 기본값은 `Stock Settings.default_warehouse` 뿐이고, 품목 단위로는 Item Default 경로가 있다. 기본 입고 창고가 필요하면 둘 중 무엇을 쓸지 결정해야 한다(§11-13). `ROLES['stores']['company_field']` 는 `None` 이 맞다.
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

`Accounts Settings.add_taxes_from_item_tax_template` 기본값이 1 이다(이 사이트도 1). 문서의 `taxes` 가 비어 있으면 [`controllers/accounts_controller.py`](../../erpnext/controllers/accounts_controller.py) 의 `AccountsController.append_taxes_from_item_tax_template` 이 품목 `item_tax_rate` 의 **모든** 계정을 행으로 추가한다. 품목 템플릿이 양방향(2151+1172)이라 빈 `taxes` 의 매출 문서에 1172 10% 행이 생겨 총액이 틀어진다. 템플릿에 행이 하나라도 있으면 이 경로가 실행되지 않는다. 세액 0 행은 GL 을 만들지 않는다([`sales_invoice.py:1710`](../../erpnext/accounts/doctype/sales_invoice/sales_invoice.py) 의 `if flt(tax.base_tax_amount_after_discount_amount):` 가 거른다). Australia `AU Sales - GST Free` 가 같은 구성이다.

실측: 영세율매출(8-d) 은 taxes 행 1개(rate 0, `net_amount` 1,000,000 과세표준 포함), GL 은 1131/4111 만. 면세매출(8-e) 도 GL 은 같으나 `부가세 해당없음 (면세) 0` 행이 남는다 → 검증 담당이 **사양 문자 기준 low 결함**으로 기록. 빈 템플릿을 원하면 `kr_tax_defaults.json` 에서 해당 `taxes` 를 `[]` 로 바꾸면 된다(코드 변경 불필요). 승인 대기(§11).

품목 템플릿을 방향별로 나누지 않은 이유: `_get_item_tax_template` ([`get_item_details.py:872-940`](../../erpnext/stock/get_item_details.py)) 이 `tax_category` 만으로 첫 템플릿을 고르므로(문서 방향 비인식) 나누면 매입 문서에서 영세율 품목이 10% 로 계산된다. 면세는 `not_applicable=1` 로 세액 0 이고 과세표준에서도 제외, 영세율은 rate 0 으로 과세표준에 포함(부가세법상 과세거래).

### 6.4 Tax Category 와 Tax Rule

템플릿의 `tax_category` 필드는 "회사당 카테고리별 템플릿 1개" 유일성 검증에만 쓰이고 선택 로직에는 쓰이지 않는다. 실제 연결은 거래처/주소 `tax_category` → Tax Rule → 템플릿이다. 그래서 `영세율`·`면세` Tax Category 는 전역 문서로 만들되 템플릿에는 걸지 않아 사용자 템플릿 추가를 막지 않는다. **Tax Rule 은 만들지 않았다** — 수출 거래처가 자동으로 영세율매출 템플릿을 받게 하려면 회사별 Tax Rule 이 필요하다(§11).

## 7. 국세청 표준코드 (`nts_codes.py`)

### 7.1 Custom Field 9개 (국세청 표준코드·업종)

> 이 절의 9개는 **`nts_codes.py` 가 소유한 것**이다. 2026-09-16 에 신원 필드 35개가 `party_identity.py` 로 추가되어 **앱 전체 Custom Field 는 44개**다 — §7.4 참조. `fieldname like 'setive\_nts\_%'` 는 그대로 8 이다.

`ensure_custom_fields()` 가 `create_custom_fields(..., update=True)` 로 멱등 생성한다. `after_install` / `after_migrate` 에서 실행되므로 `bench migrate` 마다 보장된다. 실측: 3회 실행 후 8개 필드의 `modified` 불변(2026-09-06). 2026-09-08 에 Company `setive_industry_profile` 이 추가돼 9개다 — 국세청 코드와 무관한 필드지만 Company Custom Field 는 이 한 곳에서 관리한다.

| DocType | fieldname | 타입 | 위치 | 용도 |
|---|---|---|---|---|
| Account | `setive_nts_section` | Section Break | `include_in_gross` 뒤, `depends_on: eval:!doc.is_group` | 그룹 계정에서는 숨김 |
| Account | `setive_nts_bs_code` | Data | 섹션 첫 필드 | 표준재무상태표 행 코드 |
| Account | `setive_nts_is_code` | Data | | 표준손익계산서 행 코드 |
| Account | `setive_nts_mfg_code` | Data | | 제조원가명세서 행 코드 |
| Account | `setive_nts_column_break` | Column Break | | |
| Account | `setive_nts_role` | Select `""`/`reconcile_only`/`not_applicable` | | 서식 행 미배정 계정의 역할(KB-KOR-002 §7.2) |
| Account | `setive_nts_note` | Small Text | | `[미검증] 서식 행: <label> — <note>` |
| Company | `setive_industry_profile` | Select `manufacturing`(기본)/`trading` | `chart_of_accounts` 뒤 | 업종 프로필 — 창고 재고계정·기본계정 4개·표준코드 오버레이(§4.4·§5, KB-KOR-004 §4.6) |
| Company | `setive_nts_map_revision` | Data | `setive_industry_profile` 뒤 | 적용한 매핑표의 서식 개정일 `bs=…;is=…;mfg=…` |

설계 근거:

- 섹션을 `account_number` 뒤가 아니라 마지막 표준 필드 뒤에 둔 것은 Account 폼이 두 컬럼이라 중간에 끼우면 첫 컬럼이 잘리기 때문이다. 코어 선례([`erpnext/regional/italy/setup.py`](../../erpnext/regional/italy/setup.py))처럼 `insert_after` 를 연쇄한다.
- `module` 은 `modules.txt` 의 실제 값 `SETIVE ERPNext KR`. Custom Field.module 은 Module Def 링크라 다른 값이면 LinkValidationError.
- `reqd` 없음 — `chart_of_accounts.py` 가 root 계정에만 `ignore_mandatory` 를 주므로 필수 필드가 있으면 회사 생성이 깨진다. `read_only` 없음 — 테넌트 재매핑 허용. 코드는 선행 0 보존을 위해 Data.
- 코드로 생성하므로 `export_customizations` 회수 대상이 아니다. 앱 모듈 폴더에 `custom/*.json` 이 없음을 확인했다 — 같은 필드를 `custom/` 에도 두면 이중 관리가 되므로 만들지 않는다.

### 7.2 `apply(company, force=False, reseed_overlay=False)`

매핑표(`data/nts_standard_code_map.json`, schema 2, 272건)에 업종 프로필 오버레이(`profile_overrides[<profile>]`, `nts_codes.effective_accounts`)를 얹어 회사 원장(`is_group=0`)에 `bulk_update`(`update_modified=False`) 한 문장으로 기록한다. 리포트 엔진의 미검증 판정(`nts_report._collect_unverified`)도 같은 함수로 기대값을 만든다 — 한쪽만 오버레이를 알면 trading 회사의 5150 이 '테넌트가 고친 것' 으로 오판돼 미검증 표식이 사라진다(2026-09-08 리뷰에서 잡아 고침).

| 반환 키 | 의미 |
|---|---|
| `profile` | 적용한 업종 프로필(§4.4) |
| `overridden` | 그 프로필의 오버레이로 채운 계정번호(trading: `5150`) |
| `applied` | 이번에 채운 계정번호 |
| `kept` | `force=False` 에서 bs/is/mfg/role 중 하나라도 이미 있어 보존한 계정 |
| `skipped` | 매핑표에 없는 원장(테넌트 추가 계정, 번호 없는 계정은 이름) |
| `missing` | 매핑표에는 있으나 회사에 없는 번호(테넌트가 지운 원장) |
| `map_revision` | `{"map": 매핑표 개정, "company": 회사 표식, "stale": 불일치}` |

- **미매핑 판정은 네 필드(bs/is/mfg/role)가 모두 빈 것.** `note` 는 보조 정보라 판정에서 뺐다.
- **`force=True`** 는 매핑표로 전부 덮어쓴다. 서식 개정 뒤 일괄 재적용용이며 테넌트 재매핑을 잃는다.
- **`reseed_overlay=True`** 는 오버레이 대상 번호(`overlay_numbers` — 어느 프로필에서든 오버라이드되는 번호)만 `kept` 규칙을 무시하고 다시 쓴다. 프로필이 바뀐 저장과 `backfill` 이 쓰며, 그 밖의 테넌트 재매핑은 보존된다. `load_map` 은 `profile_overrides` 의 프로필·번호·키를 검사해 오타를 즉시 throw 한다.
- **개정 표식**은 Company 필드가 비어 있을 때(또는 force)만 기록하고, 있으면 덮지 않고 `stale` 로 보고한다. 실측값 `bs=2021-10-28;is=2024-03-22;mfg=2023-03-20`.
- role 도출: 매핑표 role 이 있으면 그대로(reconcile_only 7), 코드도 role 도 없으면 `not_applicable`(3140 인출금 1건). Select 옵션 밖의 role 은 throw.
- **Custom Field 가 없으면 throw** 한다(`_assert_fields_exist`). `Company.on_update` 안에서 `create_custom_fields` → DDL 을 유발하면 암묵 커밋으로 실패한 회사 생성이 부분 커밋될 수 있어 자동 생성하지 않는다. `after_install` 이 실행되지 않은 사이트는 §8 의 1단계를 먼저 밟는다.

실측: 원장 272 중 272 채움(bs 137 · is 92 · mfg 35 · reconcile_only 7 · not_applicable 1 · `[미검증]` 33) = 매핑표 `meta.counts` 와 일치, `kept`/`skipped`/`missing` 모두 비어 있음.

### 7.3 `report_unmapped(company)` (whitelisted)

`System Manager` 또는 `Accounts Manager` 전용 읽기 점검. 코드·역할이 전부 빈 원장 목록(`unmapped`), `ledger_count`, 회사 표식과 현재 매핑표의 `stale` 여부를 돌려준다. `stale=True` 면 운영자가 `apply(company, force=True)` 를 판단한다.

### 7.4 한국 세무 신원 Custom Field 35개 (`party_identity.py`)

전자세금계산서가 요구하는 신원 기재사항은 ERPNext 코어에 **하나도 없다**. 실측: `company.json` 에 `ceo`·`biz_type`·`biz_class` 부재, `customer.json`·`supplier.json` 도 `tax_id` 뿐(`grep -cE '"ceo"|"biz_type"|"biz_class"' … ` → 세 파일 전부 0). 소급 수집 비용이 기하급수라 거래처가 쌓이기 전에 심는다.

> ⚠ **법적 근거를 정확히 쓴다.** 부가가치세법 제32조① 은 공급받는자 측에 **등록번호만**
> 필요적 기재사항으로 요구하고, 상호·대표자성명·업태·종목은 **임의적** 기재사항이다(시행령 제67조②).
> 전자세금계산서 XML 이 이 중 상호·대표자성명을 `1..1` 로 요구하는 것은 **별개 층위**다
> ([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md) §2.5).
> 이 구분을 명시하지 않으면 **"대표자명 결측 = 매입세액 불공제"** 라는 잘못된 검증이 코드에 박힌다.
> 아래 필드와 §7.5 리포트는 결측을 **발급 가능 여부**로만 판정하고 공제 여부는 판정하지 않는다.

필드 집합은 세 출처의 **합집합**이다 — 팝빌 `joinMember` 필수 11 · 볼타 발급자 등록 3 · 전자세금계산서 XML 필수기재([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md) §2.5). **코어에 이미 있는 것은 신설하지 않는다**: 사업자등록번호 → `tax_id`, 상호 → `company_name`/`customer_name`/`supplier_name`, Company 담당자 이메일·전화 → 코어 `email`·`phone_no`.

| fieldname | 타입 | Company | Customer | Supplier | 비고 |
|---|---|:-:|:-:|:-:|---|
| `setive_kr_tax_section` | Section Break | ✅ | ✅ | ✅ | 「한국 세무 신원」 |
| `setive_ceo_name` | Data(100) | ✅ | ✅ | ✅ | 대표자성명. 팝빌 `CEOName` · 볼타 `representativeName` |
| `setive_biz_type` | Data(100) | ✅ | ✅ | ✅ | 업태. 팝빌 `BizType` |
| `setive_biz_class` | Data(100) | ✅ | ✅ | ✅ | 종목. 팝빌 `BizClass` |
| `setive_biz_open_date` | Date | ✅ | ✅ | ✅ | 개업일자. 국세청 진위확인의 `start_dt` |
| `setive_kr_tax_column_break` | Column Break | ✅ | ✅ | ✅ | |
| `setive_corp_reg_no` | Data | ✅ | ✅ | ✅ | 법인등록번호 13자리 |
| `setive_branch_code` | Data | ✅ | ✅ | ✅ | 종사업장번호 4자리 |
| `setive_tax_payer_type` | Select | ✅ | ✅ | ✅ | 과세유형. **신고값**이며 관측값은 로그로 간다 |
| `setive_etax_contact_name` | Data(100) | ✅ | | | 팝빌 `ContactName`. 코어에 없다 |
| `setive_etax_email` | Data/Email | | ✅ | ✅ | 세금계산서 수신처. 코어 `email_id` 는 대표 연락처 파생 Read Only 라 지정 불가 |
| `setive_tax_status` | Data (read_only) | | ✅ | ✅ | 관측 상태의 **파생 표시**. 권위 아님 |
| `setive_tax_status_checked_on` | Datetime (read_only) | | ✅ | ✅ | 조회 시각. 이 값 없이는 상태가 의미 없다 |
| `setive_kr_tax_section_end` | Section Break | ✅ | | | 섹션 닫기 — 아래 참조 |
| **소계** | | **11** | **12** | **12** | **신규 35** |

> Company 에만 섹션 닫기 필드가 있다. `company.json` field_order 는 `date_of_establishment`(11) 뒤에
> `parent_company`(12) · `reporting_currency`(13) 가 오므로, 닫지 않으면 이 둘이 「한국 세무 신원」
> 섹션 안으로 끌려 들어간다. Customer/Supplier 는 섹션이 Tax 탭 **마지막**이고 바로 뒤가
> `settings_tab`(Tab Break)이라 자동으로 닫힌다. (italy 도 Company 섹션을 닫지 않지만 선례가 곧 정상은 아니다.)

**산술 — Custom Field 레코드는 (dt, fieldname) 쌍이다.** 같은 `fieldname` 이 3개 DocType 에 있으면 레코드는 **3개**다. 레코드 이름이 `{dt}-{fieldname}` 임은 코어가 전제한다 — [`erpnext/patches/v16_0/rename_italy_customer_name_fields.py`](../../erpnext/patches/v16_0/rename_italy_customer_name_fields.py):17·40 이 `f"Customer-{fieldname}"` 과 `"Company-fiscal_regime"` 를 따로 지목한다. 같은 이름 `fiscal_code` 가 Company·Customer·Supplier 3곳에 각각 만들어지는 것도 코어 선례다([`erpnext/regional/italy/setup.py`](../../erpnext/regional/italy/setup.py):120·207·448).

```
기존 9 (§7.1: Account 7 + Company 2) + 신규 35 (11 + 12 + 12) = 44
DocType 별 최종 — Account 7 · Company 13 · Customer 12 · Supplier 12
```

기대값은 코드에서 유도한다 — `party_identity.app_field_counts()` 가 `nts_codes` 와 `party_identity`
두 소유자를 합산해 `{DocType: n, "_total": n}` 을 돌려주고, fixture 가 그 값으로 DB 를 대조한다.
**손으로 센 숫자를 기대값으로 쓰지 않는다** — (f)가 경고하는 "기대값이 틀리면 검증이 성공으로
잘못 통과한다"가 바로 여기서 일어난다. 별도로 전역 카운트 44 를 고정 기준선으로 함께 단언해
정의와 DB 가 **같이** 틀리는 경우도 잡는다.

`insert_after` 앵커는 DocType 마다 다르며 실측값이다. Customer 와 Supplier 가 다른 것은 오타가 아니라 **코어가 두 DocType 에서 `tax_withholding_group`/`category` 순서를 반대로 두었기** 때문이다.

| DocType | 앵커 | 근거 |
|---|---|---|
| Company | `date_of_establishment` | `field_order` idx 11. italy 가 `sb_e_invoicing` 을 거는 자리와 같다 |
| Customer | `tax_withholding_category` | idx 53. Tax 탭의 **마지막** 필드 |
| Supplier | `tax_withholding_group` | idx 42. Tax 탭의 **마지막** 필드 |

설계 규칙:

- **`reqd` 를 절대 걸지 않는다.** §7.1 의 근거(`chart_of_accounts` 의 `ignore_mandatory`)는 Account 전용이라 여기 적용되지 않고, **더 나쁜 근거가 따로 있다** — [`erpnext/selling/doctype/quotation/quotation.py`](../../erpnext/selling/doctype/quotation/quotation.py):611-642 의 `create_customer_from_lead` 가 `frappe.MandatoryError` 를 잡아 `frappe.throw("Mandatory Missing")` 으로 바꾼다. Lead 에는 `setive_*` 가 없으므로 reqd 필드 하나가 **견적 → 수주/송장 전환 전체를 100% 막는다.**
- **`default` 를 걸지 않는다.** 특히 `setive_tax_payer_type` 은 선행 빈 옵션(`"\n일반과세자\n…"`)을 둔다. 없으면 DB 는 `""` 인데 폼은 첫 옵션을 보여주고, 사용자가 **아무 필드나** 고쳐 저장하는 순간 과세유형이 조용히 확정된다. 과세유형은 발행 판정에 직결되므로 조용한 확정이 곧 오발행이다.
- **주소 필드를 만들지 않는다.** ERPNext 는 주소를 `Address` DocType 으로 모델링하고 `customer_primary_address`/`supplier_primary_address` Link 가 있다. 팝빌 `Addr`(300자)는 발행·등록 시점에 그 Address 를 평탄화해 만든다. 필드로 복제하면 두 번째 진실이 생긴다.
- **`read_only` 는 서버에서 강제되지 않는다.** `setive_tax_status` 2필드는 캐시이고 권위는 `Korea Party Tax Status` 로그의 최신 행이다. 읽기는 `party_identity.tax_status()` 하나로 통일하고, 쓸 때는 반드시 `frappe.db.set_value(..., update_modified=False)` — 기본값 `True` 면 `modified` 가 올라가 폼을 열어 둔 사용자의 다음 저장이 `TimestampMismatchError` 로 죽는다.

#### 검증 정책 — `warn` 기본, 거처는 `site_config`

```bash
bench --site $SITE set-config setive_brn_validation_policy block   # 기본은 warn
```

- 국세청 상태조회 결과로 저장을 **hard block 하지 않는다.** 신규 개업자는 국세청 반영에 1~2일 걸려 정상 거래처 등록을 막는 오탐이 난다([KB-KOR-005](./KB-KOR-005_localization_roadmap.md) §4.2).
- **`tax_id` 는 어떤 판정으로도 막지 않는다.** 코어의 국가중립 필드이며 description 이 "e.g. PAN, VAT, GST" 다([`erpnext/buying/doctype/supplier/supplier.json`](../../erpnext/buying/doctype/supplier/supplier.json):130). 자릿수가 다르면 해외 식별자로 보고 판정 자체를 하지 않고, **자릿수가 같아도 막지 않는다** — 폴란드 NIP · 터키 vergi kimlik no · 러시아 법인 INN 이 전부 숫자 10자리라 길이만 보고 한국 체크섬을 태우면 거의 전부 실패한다. 막는 순간 수출·해외매입 테넌트가 거래처를 하나도 저장하지 못한다. 체크섬 불일치는 **경고로만** 알리고 §7.5 리포트가 목록으로 낸다.
- `block` 이 실제로 막는 것은 **우리가 만든 한국 전용 필드의 오류뿐**이다 — `setive_corp_reg_no`(형식·체크섬), `setive_branch_code`(형식). 이 둘은 해외 식별자가 들어올 자리가 아니라 모호함이 없다. 필드별 정책은 `party_identity.BLOCKING_VERDICTS_BY_FIELD` 에 있다.
- 차단 예외는 전용 타입 `party_identity.BrnValidationError` 다. `frappe.ValidationError` 를 그대로 쓰면 하위 30여 종(`MandatoryError`·`LinkValidationError`·TDR 실행 중 차단 …)이 전부 같은 것으로 잡혀 **정책이 망가져 있어도 검증이 통과한다.**
- Single DocType 이 아니라 `site_config` 인 이유: 거래처는 Company 에 속하지 않으므로(Customer/Supplier 에 `company` 필드가 없다) 회사별 정책은 적용 대상이 없고, Single 로 두면 그 DocType 이 DB 에 없는 동안 `get_single` 이 `DoesNotExistError` 를 내는데 그게 `validate` 훅 안이면 **사이트의 모든 거래처 저장이 죽는다.** KB-KOR-009 에서 `Korea Integration Settings` 가 실재하면 정책을 옮기고 `site_config` 는 상한으로 남긴다([KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md) §5.1 과 같은 fail-safe).

#### 체크섬은 `identifiers.py` 가 소유한다 (M1 — 2026-09-16 완료)

체크섬·정규화는 [`korea/common/identifiers.py`](../../../setive_erpnext_kr/setive_erpnext_kr/korea/common/identifiers.py) 소관이며 [KB-KOR-005](./KB-KOR-005_localization_roadmap.md) §4 의 **M1 산출물**이다. `party_identity` 는 그 판정을 **정책**으로 옮기는 층이다 — 무엇을 막고 무엇을 경고할지, 어떤 값을 한국 식별번호로 볼지는 여기서 정한다.

**frappe 비의존이 설계 제약이다.** `identifiers.py` 는 `import frappe` 를 하지 않고 앞으로도 하지 않는다. §4.1 이 M1 을 떼어낸 이유가 이것이다 — 체크섬은 컨테이너·bench 없이 호스트에서 검산 가능해야 하고, 그 제약이 유지보수 비용을 가른다. **이 저장소에서 사이트 없이 실행되는 유일한 검증이다.**

```bash
python3 scripts/identifiers/selftest.py     # 앱 저장소 루트에서. exit 0 이면 통과
```

공개 API:

| 함수 | 반환 |
|---|---|
| `validate_brn(value)` | `bool`. **체크섬 + 구분코드 실재 여부**. 하이픈 허용 |
| `validate_crn(value)` | `bool`. 체크섬만 — CRN 구조 표는 ONT 에 없다 |
| `brn_check_digit(value)` · `crn_check_digit(value)` | `int \| None`. 앞자리로 검증번호를 계산 |
| `brn_quotient_term(d)` | `int`. 산식의 독립 항 `(d × 5) // 10`. 따로 검산 가능해야 해서 노출한다 |
| `normalize_brn` · `normalize_crn` · `normalize_branch_code` | 정규형 또는 **원본 그대로** |
| `digits_only(value)` | **ASCII** 숫자만 남긴 문자열 |

> ⚠ **정규화 함수는 정규화할 수 없는 값을 `None` 이 아니라 원본 그대로 돌려준다.** `doc.tax_id = normalize_brn(doc.tax_id)` 가 자연스러운 호출인데 여기서 `None` 을 돌려주면 해외 거래처의 VAT 번호가 **저장 시점에 소실된다.** 보존이 기본값이어야 그 사고가 안 난다.

두 가지는 산식 밖의 판단이며 둘 다 실무 사고에서 나왔다.

- **`digits_only` 는 `str.isdigit()` 를 쓰지 않는다.** 그 함수는 유니코드 전각 숫자(`１`)와 위첨자(`²`)까지 `True` 다. 전각은 체크섬을 통과해 **전각 그대로 저장**되어 이후 조회·조인·세금계산서 XML 이 모두 어긋나고 §7.5 리포트도 잡지 못한다. 위첨자는 `int()` 에서 `ValueError` 를 던져 **거래처 저장이 500 으로 죽는다** — `validate` 훅 안이라 사용자에게는 원인 없는 서버 오류로 보인다. ASCII 숫자만 남기면 둘 다 `숫자 10자리 아님` 으로 떨어져 해외 식별자와 같은 취급을 받는다.
- **구분코드(4~5번째 자리) `00` 을 거부한다.** [ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md) §1.1 의 구분코드 표는 **01~99 를 남김없이** 덮으므로 `00` 은 발급되지 않는다. 그런데 `0000000000` 과 `000-00-00000` 은 **체크섬이 맞고**(S=0 → check=0) 한국 ERP 이관에서 가장 흔한 placeholder 다. 거르지 않으면 §7.5 리포트에서 그 행이 **사라져 안전망이 거꾸로 작동한다.**
  단 구조 검증은 구분코드까지만이다 — 세무서 일련번호(앞 3자리)는 ONT 에 유효 코드 표가 없어 검증하지 않는다. **없는 표를 지어내지 않는다.** 완전한 실재 확인은 국세청 상태조회(M4) 몫이다.

**임포트를 `try/except` 로 감싸지 않는다.** 같은 앱·같은 패키지 안의 우리 모듈이므로 부재는 런타임 조건이 아니라 **빌드 오류**다. 감싸면 모듈 내부의 오타·순환참조까지 함께 삼켜 체크섬이 조용히 꺼진 채 배포된다 — 이 앱의 관례도 "예외를 삼키지 않는다" 이다(`nts_codes` 모듈 docstring).

산식은 [ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md) §1.1·§1.2 를 따른다. 두 지점이 Luhn 과 달라 옮겨 적을 때 틀리기 쉽다.

- **사업자등록번호**: 9번째 자리가 **두 번** 쓰인다 — 가중합의 `w[8]=5` 로 한 번, `(d[8] × 5) // 10` 몫 항으로 또 한 번. 이 항을 빠뜨리면 검증번호가 10개 중 약 절반에서만 우연히 맞는다.
- **법인등록번호**: 곱이 10 을 넘어도 **자릿수를 분해하지 않는다.**

selftest 는 순환 검증을 피하려고 다섯 갈래로 나눴다 — ① 손계산 벡터(가중합·몫 항·검증번호를 중간값까지 단언) ② 구조 속성(앞자리마다 검증번호 10개 중 정확히 1개만 통과, `validate` 와 `check_digit` 교차검증) ③ 독립 작성한 참조 구현과의 차분 대조 **144,900건** ④ 정규화·경계값(비-ASCII·구분코드 00 포함) ⑤ `fixture_company.py` 의 BRN/CRN 상수를 **파일에서 읽어** 검산.

> ⚠ **차분 코퍼스는 자릿수 커버리지를 스스로 점검한다.** 초판은 일련번호 4자리를 `range(10)` 으로 돌면서 `:04d` 로 찍어 앞 3자리가 전 케이스에서 `0` 으로 고정됐고, 그 결과 `BRN_WEIGHTS[5]·[6]·[7]` 이 **한 번도 발현하지 않았다** — 실번호의 50% 를 오판하는 가중치 변조가 selftest 를 통과했다(뮤테이션으로 실증). 지금은 순회 보폭을 실측으로 고르고 10자리 전부에서 0~9 가 나오는지 단언한다. 건수가 아니라 **커버리지**가 이 절의 유일한 실패 모드다.
>
> fixture 파일이 없으면 **건너뛰지 않고 실패**한다. 일부 가중치 변조를 ⑤ 만 잡는 구간이 있어, 파일을 옮기면 커버리지가 말없이 사라지는데 exit 는 0 이 되기 때문이다.

뮤테이션 9종(가중치 변조 3 · 몫 항 `//10`→`%10` · 바깥 `%10` 제거 · CRN 가중치 순서 · `digits_only` 유니코드 · 구분코드 게이트 제거 · 정규화 `None` 반환)을 사본에 가해 **전부 exit≠0 으로 죽는 것**을 확인했다(2026-09-16).

주민등록번호는 `identifiers.py` 에 넣지 않았다 — 아래 참조.

#### 주민등록번호를 1차에 만들지 않는다 — 사람 승인 대상

**전제**: "개인(비사업자) 공급받는자 대상 발급을 1차 범위에서 제외한다." **이 전제 자체가 사람 승인 사항이며 에이전트가 판정하지 않는다.**

전제가 유지될 때의 영향:

| 잃는 것 | 근거 |
|---|---|
| `BusinessType.Code` **02 발급 불가** | 코드 02 는 ID 칸에 RRN 13자리를 실제로 요구한다([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):81·132-142) |
| 매출처별 세금계산서합계표의 **주민등록번호 발급분 행 집계 불가** | 합계표는 사업자등록번호 발급분과 주민등록번호 발급분을 **별도 행**으로 집계한다(:81) |
| B2C 매출 테넌트는 1차에서 발급 기능을 쓸 수 없다 | 〃 |

나중에 넣을 때 필요한 것 — **필드 신설과 같은 시점에** 갖춰야 한다. 나중에 얹을 수 없다.

- 암호화 저장 · 접근통제(permlevel) · **파기 정책** · 개인정보 처리방침 고지
- 검증은 **경고만** 가능하다 — 2020-10 이후 발급분은 뒤 7자리 중 성별 1자리를 제외한 6자리가 임의번호로 바뀌어 **종전 체크섬이 성립하지 않는다**(:77). 규칙을 무조건으로 기술하면 구현이 hard block 을 만든다.

### 7.5 「발급 불가 거래처」 리포트

`Korea Etax Ineligible Parties` — 세금계산서 XML 이 요구하는 상호·대표자성명·업태·종목이 결측인 거래처와 사업자등록번호 오류를 목록으로 낸다. 폴더는 `setive_erpnext_kr/setive_erpnext_kr/report/korea_etax_ineligible_parties/`, 파일 4개(`__init__.py`·`.json`·`.py`·`.js`)이며 `.json` 의 키 집합·`is_standard`·`roles`(`Accounts User`·`Accounts Manager`·`Auditor`)는 기존 3종과 동일하다.

**리포트가 내부 함수보다 중요한 이유** — `validate` 훅은 무결성 보장 수단이 못 된다. `flags.ignore_validate=True` 로 저장하는 코어 경로가 실재하고([`erpnext/buying/doctype/request_for_quotation/request_for_quotation.py`](../../erpnext/buying/doctype/request_for_quotation/request_for_quotation.py):279-283), Data Import·REST·스케줄러 경로에서는 `msgprint` 를 아무도 보지 않는다. **실무자가 직접 보고 채우는 화면이 유일한 안전망이다.**

| 필터 | 타입 | 기본 | 비고 |
|---|---|---|---|
| `company` | Link(Company) | 사용자 기본 회사 | **reqd 아님** — 아래 참조 |
| `party_type` | Select | 둘 다 | 둘 다 / 고객 / 공급업체 |
| `missing_field` | Select | 전체 | 전체 / 상호 / 대표자성명 / 업태 / 종목 / **사업자등록번호 결측** / **사업자등록번호 체크섬 오류** — 결측과 체크섬을 한 값으로 합치면 구분 요구가 필터에서 무너진다 |
| `only_active` | Check | 1 | 끄면 비활성 포함. "끈 상태"와 "미지정"이 같은 뜻이라 뒤집지 않았다 |

> ⚠ **거래처는 회사에 귀속되지 않는다.** Customer/Supplier 에 `company` 필드가 없다(실측: 두 JSON 전수. `represents_company` 는 "이 거래처가 대표하는 회사"로 뜻이 다르다). 회사를 지정하면 **그 회사의 `Party Account` 설정이 있거나 전표에 등장한** 거래처로만 좁히므로 **거래 이력이 없는 신규 거래처가 빠진다.** 발급 전에 마스터 결함을 잡는 것이 목적이므로 빠짐없이 보려면 회사를 비운다. 이 사실을 리포트 머리말로 화면에 고지한다.

**`report_type` 은 `Script Report` 다.** 진성 Query Report(정적 SQL 1개)로도 만들 수는 있으나 셋을 포기해야 한다.

1. **체크섬 규칙이 SQL 로 복제된다.** [KB-KOR-005](./KB-KOR-005_localization_roadmap.md) §4 M1 이 체크섬을 frappe 비의존 순수 모듈 **1곳**에 두기로 이미 결정했는데, SQL 사본은 `scripts/identifiers/selftest.py` 가 검산하지 못한다. 단일 권위가 깨진다.
2. **머리말(`message`)을 낼 수 없다.** `execute_query_report` 는 `[columns, result]` 2개 고정 반환이라 회사 필터의 의미나 체크섬 엔진 부재를 고지할 자리가 없다.
3. **15초 초과 시 Prepared Report 자동 승격이 없다**(Script Report 전용).

두 타입 모두 Desk 의 같은 `/app/query-report/<name>` 화면에서 렌더되므로 실무자가 보는 화면은 동일하다 — 이건 선택 근거가 아니라 확인 사항이다. 근거: [`erpnext/change_log/v15/v15_64_0.md`](../../erpnext/change_log/v15/v15_64_0.md):7 이 Script Report 인 `Calculated Discount Mismatch` 를 그 라우트로 링크한다.

권한은 두 층으로 건다.
- **역할**: `ref_doctype` 이 `Customer` 하나뿐이므로 `execute()` 첫머리에서 `frappe.only_for(...)` 와 대상 DocType 별 `frappe.has_permission` 을 직접 확인한다. 같은 관례가 `nts_codes.report_unmapped` 에 이미 있다(§7.3).
- **User Permission**: 거래처 조회를 `frappe.get_all` 이 아니라 **`frappe.get_list`** 로 한다. `get_all` 은 `ignore_permissions=True` 를 강제하고, 이 리포트의 거래처 컬럼이 `Dynamic Link` 라 frappe 의 사후 방어(`get_filtered_data` → `get_linked_doctypes`)도 못 막는다 — 그 함수는 `fieldtype == "Link"` 만 수집한다. `get_all` 을 쓰면 **담당 거래처가 제한된 사용자가 전 거래처의 상호·사업자등록번호를 본다.**

사업자 상태 컬럼은 캐시 필드가 아니라 **로그에서 읽는다.** `party_identity.tax_status_bulk()` 가 `Korea Party Tax Status` 최신 행을 1회 조회로 가져온다. 캐시(`setive_tax_status`)를 직접 SELECT 하면 `stale_days` 규칙이 우회되어 **오래된 관측이 현재 상태처럼 표시된다.** 폐업일(`end_dt`)도 함께 컬럼으로 낸다 — 폐업자 수취분도 폐업일 **이전** 공급분은 정상 공제되므로 현재 상태만 보는 판정은 틀린다.

이 리포트만 `disable_prepared_report_automation` 을 **0** 으로 둔다(기존 3종은 1). 거래처 전건 + `GL Entry` DISTINCT 를 훑어 앱에서 유일하게 15초를 넘길 수 있고, 위 선택 근거 3번이 그 자동 승격을 이점으로 들었기 때문이다. 끄면 근거와 설정이 반대가 된다.

등재는 `install_reports()` 가 처리한다. 단 `REPORT_FORMS` 는 **이름 → 서식** 의미 사전이라 서식 없는 리포트를 넣으면 오염되므로, 등재 목록을 `INSTALLABLE_REPORTS` 로 분리했다.

## 8. 기존 사이트 백필 절차

훅은 Company 저장 시에만 돈다. 다음 경우에는 `backfill` 을 수동 실행한다.

- 앱을 설치하기 전에 만든 회사가 있다 (KB-OPS-001 §5.1 3a 단계)
- 훅이 실패한 채 회사가 만들어졌다 / 사용자가 기본계정·창고 계정·표준코드를 지웠다
- 매핑표가 개정되어 `report_unmapped` 가 `stale=True` 를 보고한다 (이 경우는 `nts_codes.apply(force=True)`)
- `report_unmapped` 가 `missing_count > 0` 을 보고한다 — 계정과목표에 계정이 추가됐는데 이 회사에는 없다. **`backfill` 은 계정을 만들지 않는다**(현재 이 앱에 계정 소급 생성 경로가 없다). 판단·설계는 [KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §8-4
- 업종 프로필(§4.4)을 바꾼 뒤 훅이 돌지 않았다 — `backfill(company, switch=True)` 로 전환 규칙을 켠다(`--kwargs "{'company':'<회사명>','switch':True}"`). 기본(`switch=False`)은 빈 값만 채우는 비파괴 실행이라 사용자가 고른 다른 프로필 표준계정을 되돌리지 않는다. 표준코드는 어느 경우든 오버레이 대상(5150)만, 그것도 표준값일 때만 다시 쓴다(`reseed_overlay`, §7.2). `force=True` 로 전부 덮지 않는다(2026-09-08 리뷰).

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"
COMPANY='<회사명>'

# 1. Custom Field 보장 — install-app(after_install) 또는 migrate(after_migrate) 가 이미 했으면 생략 가능. 기대 9(setive_nts_% 8 + setive_industry_profile)
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.ensure_custom_fields
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':['like','setive_nts_%']}}"

# 2. 백필 (멱등, System Manager. bench execute 는 Administrator 로 실행되어 통과). 한국 차트 회사가 아니면 throw
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.company.backfill \
  --kwargs "{'company':'$COMPANY'}"

# 3. 표준코드 점검 — 기대: unmapped_count 0, missing_count 0, stale False
#    missing 은 '매핑표에는 있는데 이 회사에는 없는 계정번호' 다. 계정과목표에 계정이 추가된 뒤
#    만들어진 회사에는 있지만 그 전에 만들어진 회사에는 없다(코어 create_charts 는 회사 생성 시점에만
#    돈다). 0 이 아니면 소급 생성 여부를 사람이 판단한다 — KB-KOR-004 §8-4
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

**전제:** 포크가 이미지 태그와 같은 `v16.33.0` 위에 있고(KB-OPS-001 §1.7), 리베이스 후 `bench migrate` 가 끝난 상태여야 한다. 스키마가 17-dev 에 머물러 있으면 아래 값들이 17-dev 정합성을 검증하게 된다(§10-1).

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"
COMPANY='<회사명>'

# 0. 버전 전제 — 기대: 16.33.0 16.31.0
$EXEC /home/frappe/frappe-bench/env/bin/python -c \
  "import frappe, erpnext; print(erpnext.__version__, frappe.__version__)"

# 훅 등록 — 기대: {'Company': {'on_update': ['setive_erpnext_kr.korea.common.company.on_update']}}
$EXEC bench --site $SITE execute frappe.get_hooks \
  --kwargs "{'hook':'doc_events','app_name':'setive_erpnext_kr'}"

# 앱 import (env 파이썬이어야 한다, KB-OPS-001 §1.4)
$EXEC /home/frappe/frappe-bench/env/bin/python -c \
  "from setive_erpnext_kr.korea.common import company, company_defaults, warehouses, taxes, nts_codes; print('OK')"

# 계정 수 — 기대 324 (포크 차트 md5 f6e03a38636b3ce60d028887ad41f471, 차트 커밋 94dc249e — 2026-09-16 재확인)
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Account','filters':{'company':'$COMPANY'}}"

# 기본계정 — 기대: 5480 잡손실 / 5422 외환차손익 / 5251 잡비(제) / 완제품 - <약어> / bs=2021-10-28;is=2024-03-22;mfg=2023-03-20
#   ※ exchange_gain_account 는 16.33 Company 에 없는 필드다. 조회하면 실패한다 (§4.1)
$EXEC bench --site $SITE execute frappe.client.get_value \
  --kwargs "{'doctype':'Company','filters':{'name':'$COMPANY'},'fieldname':['write_off_account','exchange_gain_loss_account','default_operating_cost_account','default_fg_warehouse','setive_nts_map_revision']}"

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

> **이 실측은 17-dev 코어·17-dev DB 스키마 위에서 수행됐습니다** (리베이스 이전). Company 필드 39개·기본계정 12/12 같은 숫자는 16.33 기준이 아닙니다 — §4.1 경고와 §12 를 함께 읽으십시오. 16.33 재실측은 `bench migrate` 후로 미뤄져 있습니다(§10-1).
>
> 2026-09-07 리베이스 후 재확인된 것: 계정 324(그룹 52·원장 272), 차트 목록 노출, 트리 렌더 324/52/0, 훅 등록, 표준코드 272/unmapped 0, 세금 템플릿 Sales 3·Purchase 6·Item 3, 그리고 매입 PI·매입 PR·매출 SI 의 GL 이 §9.2 8-a/8-b 와 동일. **단 전표 3종은 17-dev 스키마 결손 5건을 하네스에서 우회한 뒤에야 통과했습니다.**

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

### 9.3 신원 필드·리포트 검증 (2026-09-16 추가)

> ⚠ **아래는 아직 실행되지 않았다.** 2026-09-16 기준 개발 스택에 컨테이너가 하나도 없고
> (`docker compose -f $COMPOSE ps` → 0행), 사이트 DB 스키마의 17-dev 잔류(§10-1)도 미해소다.
> 명령은 재현 가능하게 적어 두되 **"검증 통과"로 보고하지 않는다.**

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"
PY=/home/frappe/frappe-bench/env/bin/python

# ── 사이트 없이 지금 돌아가는 유일한 검증 ──────────────────────────────
# 체크섬 산식. frappe 비의존이라 호스트에서 그대로 실행된다. exit 0 이면 통과.
cd ../setive_erpnext_kr && python3 scripts/identifiers/selftest.py; echo "exit=$?"
# 2026-09-16 실행 결과: 손계산 벡터 · 구조 속성 10종 · 차분 145,001건(10자리 전부 0~9 발현) ·
#   정규화/경계 (비-ASCII·구분코드 00 포함) · fixture 상수 5건 → 전부 통과, exit 0

# ── 아래부터는 사이트가 필요하다 ──────────────────────────────────────
# 0. 선행 — 스택 기동 + 스키마 정합. 사람 승인 사항이다(§10-1)
make up-dev
$EXEC bench --site $SITE migrate

# 1. Custom Field 개수. LIKE 의 `_` 는 단일문자 와일드카드이므로 반드시 이스케이프한다.
#    setive_nts_% 만 세면 신원 필드를 전혀 못 센다 — M2 이후에도 8 로 고정이다.
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':['like','setive\\_nts\\_%']}}"   # → 8
$EXEC bench --site $SITE execute frappe.client.get_count \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':['like','setive\\_%']}}"         # → 44

# 2. DocType 별 분해 — 이게 진짜 검산이다 (레코드는 (dt, fieldname) 쌍이다)
#    기대: Account 7 · Company 13 · Customer 12 · Supplier 12
for DT in Account Company Customer Supplier; do
  $EXEC bench --site $SITE execute frappe.client.get_count \
    --kwargs "{'doctype':'Custom Field','filters':{'dt':'$DT','fieldname':['like','setive\\_%']}}"
done

# 3. 같은 fieldname 이 3 레코드인지 — §7.4 산술의 직접 확인. 기대 3
$EXEC bench --site $SITE execute frappe.client.get_list \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':'setive_ceo_name'},'fields':['name','dt'],'limit_page_length':0}"
# → Company-setive_ceo_name · Customer-setive_ceo_name · Supplier-setive_ceo_name

# 4. DocType 등재 — Korea Party Tax Status 테이블이 실재하는가
$EXEC bench --site $SITE execute frappe.db.table_exists --kwargs "{'doctype':'Korea Party Tax Status'}"   # → True

# 5. 리포트 등재
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_report.install_reports
# → {'NTS Standard Balance Sheet': True, ..., 'Korea Etax Ineligible Parties': True}
#    ⚠ .json 을 고쳤는데 `modified` 를 올리지 않으면 import_file_by_path 가 조용히 스킵한다.
#      반영 여부는 아래로 확인한다.
$EXEC bench --site $SITE execute frappe.client.get_value \
  --kwargs "{'doctype':'Report','filters':{'name':'Korea Etax Ineligible Parties'},'fieldname':['modified','report_type','module']}"

# 7. 정규화 — 하이픈 입력이 숫자만 남는가 (컨테이너·bench 없이도 확인 가능한 순수 함수)
$EXEC $PY -c "from setive_erpnext_kr.korea.common import party_identity as p; \
print(p.normalize_brn('124-81-00998'), p.normalize_crn('110111-1234569'), p.normalize_brn('GB123456789'))"
# → 1248100998 1101111234569 GB123456789   (마지막은 해외 식별자라 원본 보존)

# 8. 검증 정책 — block 으로 바꾸면 형식 오류가 거부되는가
$EXEC bench --site $SITE set-config setive_brn_validation_policy block
# ⚠ site_config 반영은 워커 프로세스당 최대 60초 지연된다
$EXEC bench --site $SITE set-config setive_brn_validation_policy warn

# 9. fixture — 신원 거래처 생성 · 개수 · 정규화 · block 정책 · 리포트 적중까지 한 번에
docker compose -f $COMPOSE cp ../setive_erpnext_kr/scripts/nts/fixture_company.py backend:/tmp/fixture_company.py
for KEY in mfg trd; do
  docker compose -f $COMPOSE exec -T -w /home/frappe/frappe-bench/sites backend \
    $PY /tmp/fixture_company.py $SITE setup $KEY
done
# setup 안에서 assert_custom_field_counts · assert_normalized · assert_block_policy ·
# assert_report 가 차례로 돈다. 실패하면 AssertionError 로 멈춘다.

# 10. 정리 — 잔여 0 이어야 한다
for KEY in mfg trd; do
  docker compose -f $COMPOSE exec -T -w /home/frappe/frappe-bench/sites backend \
    $PY /tmp/fixture_company.py $SITE teardown $KEY
done
# → "Company exists: False | residue rows: 0"

# 11. 리포트를 Desk 에서 직접 — 실무자가 보는 화면
#    /app/query-report/Korea%20Etax%20Ineligible%20Parties
```

## 10. 알려진 한계·후속 과제

1. ~~**환경 불일치 — 포크와 이미지 frappe 버전.**~~ **해소됨 (2026-09-06 리베이스).** 포크를 `develop`(17.0.0-dev) 에서 태그 `v16.33.0` 위로 리베이스해 `Meta.get_translated_label` 호출이 0건이 됐다. 재실측: `erpnext 16.33.0 / frappe 16.31.0`, `hasattr(Meta,'get_translated_label')` → `False`, 구 크래시 지점 `buying_controller.validate_from_warehouse` 직접 호출 시 `AttributeError` 가 아니라 정상 `ValidationError`. E2E 의 shim 은 더 이상 필요 없다. 사고 경위·재발 방지는 [KB-OPS-001 §1.7](./KB-OPS-001_tenant_provisioning_deployment.md) 로 옮겼다.
   **다만 리베이스 직후 사이트에 `bench migrate` 를 돌리지 않아 DB 스키마가 17-dev 에 머물러 있다** — `Contact.is_billing_contact` 부재(1054)로 매입·매출 전표가 전부 막히고, 고아 DocType `Company Restriction` 과 `Supplier`/`Customer`/`Item` 의 `allowed_companies` 필드가 남아 `ImportError` 를 낸다. 사람 승인 시점에 `bench --site $SITE migrate` 를 실행한 뒤 §9.1 을 우회 없이 재실행해야 한다. 결손 목록과 복구 근거는 KB-OPS-001 §1.7.
   **새 미해결 항목이 하나 생겼다:** `company_defaults.DEFAULTS` 의 세 필드가 16.33 Company 에 없다 (§4.1 경고).
2. **Transit 창고 타입.** 위저드 밖에서 만든 회사는 `Warehouse Type "Transit"` 이 없어 코어 창고 생성이 실패할 수 있다. 앱 fixtures 또는 `after_migrate` 로 보장할지 결정 필요.
3. **v16 신규 Company 필드는 비워 두었다** (과제 범위 20개 밖). `purchase_expense_account` / `purchase_expense_contra_account`, `expenses_added_to_stock_account` / `…_contra_account` 는 `Accounts Settings.book_stock_expense_gl_entries` 를 켜면 재고 품목 매입에서 throw 한다(`buying_controller.py:325-344`). `service_expense_account`(외주가공, 5248 후보), `unrealized_profit_loss_account`(내부거래)도 후속 결정.
4. **Tax Rule 미생성** (§6.4).
5. **불공제 한계 5건** (§6.2).
6. **훅 값이 `doc.save()` 로 덮일 가능성.** 훅은 `db.set_value` 로 쓰므로 같은 in-memory Company 문서를 훅 뒤에 다시 `save()` 하는 호출자가 있으면 None 으로 덮인다. 위저드 경로(`install_fixtures`)는 `db.set_value` 만 쓰는 것을 확인했지만, 그런 호출자가 생기면 `company.py` 골격이 `doc` 에도 값을 반영하도록 바꿔야 한다.
7. **5307/5316/5310 `account_type` 비어 있음** — picker 미노출(§6.2-3). 타입 부여는 계정과목표 결정 사항.
8. **표준재무제표 리포트 미착수** (KB-KOR-002 §11-6). 코드는 채워졌으나 실행기가 없다.
9. ~~**E2E 스크립트가 저장소 밖.**~~ **해소됨 (2026-09-08).** `scripts/nts/fixture_company.py` 가 제조·상품매매 회사를 만들고(Company 훅 경로로 프로필 전환까지) Transaction Deletion Record 로 지운다. 절차는 KB-KOR-004 §7.
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
| 12 | ~~이미지 frappe 태그 ↔ 포크 브랜치 정합 (§10-1)~~ | **결정됨** — 포크를 이미지와 같은 `v16.33.0` 태그에 고정(2026-09-06 리베이스). 규약은 [`CLAUDE.md`](../../CLAUDE.md) "개발 환경 · 브랜치 규약" | — |
| 13 | 기본 입고 창고 (§5) | 없음 — 16.33 에 `Company.default_warehouse` 필드가 없다 | `Stock Settings.default_warehouse` 전역 지정 / Item Default 경로 / 지정하지 않음 |
| 14 | `company_defaults.DEFAULTS` 의 16.33 부재 필드 3개 (§4.1) | 그대로 씀 — 신규 16.33 사이트에서 1054 로 회사 생성 실패 | 세 항목 제거 + `meta.has_field` 필터로 `skipped` 처리 |
| 15 | ~~창고→계정 매핑의 업종 분기 (§5)~~ | **결정·구현됨 (2026-09-08)** — Company `setive_industry_profile` 로 분기(§4.4·§5). 겸업 테넌트용 코어 `enable_item_wise_inventory_account` 검토는 KB-KOR-004 §8-6 | — |

---

## 12. 이전 서술 정정

### 2026-09-16 (3) — M1 완료에 따른 정정

- **"체크섬은 `identifiers.py` 소관이며 미착수다" 는 해소됐습니다.** 같은 날 M1 을 착수해
  `korea/common/identifiers.py` 와 `scripts/identifiers/selftest.py` 를 만들었고 selftest 는
  호스트에서 exit 0 입니다. 이에 따라 `party_identity` 의 `importlib.util.find_spec` seam,
  `checksum_engine_available()`, 판정값 `BRN_UNVERIFIED`("미검증") 를 **전부 제거**하고
  하드 임포트로 바꿨습니다. seam 은 모듈 부재를 관측 가능하게 드러내려던 장치였는데,
  모듈이 실재하는 지금은 **도달 불가능한 분기**로 남아 오히려 오해를 만듭니다.
  리포트의 "미검증" 머리말·색상 분기와 fixture 의 조건부 기대도 함께 걷어냈습니다.
- **fixture 의 "체크섬 오류 거래처 1건" 이 이제 실제로 검증됩니다.** 엔진이 없던 동안에는
  판정이 전부 `미검증` 이라 BADBRN 거래처가 리포트에 잡히지 않았고, 그래서 착수 지시의
  "체크섬 오류도 결측과 구분해 표시" 요구가 미검증 상태였습니다. `assert_report` 에
  체크섬 오류 필터 단언을 추가했습니다.

### 2026-09-16 (2) — 신원 필드 추가에 따른 정정

- **"Company Custom Field 는 이 한 곳에서 관리한다" 는 더 이상 사실이 아닙니다.** §7.1 과 [`korea/common/nts_codes.py`](../../../setive_erpnext_kr/setive_erpnext_kr/korea/common/nts_codes.py):129 주석이 그렇게 적었는데, 2026-09-16 에 신원 필드가 `party_identity.py` 로 들어오면서 **Company Custom Field 의 소유자가 둘**이 됐습니다(회계·업종 → `nts_codes`, 세무 신원 → `party_identity`). 그대로 두면 다음 사람이 `nts_codes.get_custom_fields()` 만 보고 "Company 필드는 2개"라고 판단합니다. 소스 주석을 고쳤고 `install.py` 의 `_ensure_custom_fields` 가 **둘 다** 부릅니다 — 한쪽만 부르면 무증상으로 필드가 빠집니다.
- **"Custom Field 9개" 는 이제 앱 전체 총계가 아닙니다.** 9 는 `nts_codes` 소유분(Account 7 + Company 2)이고 전체는 **44**(§7.4)입니다. §8 백필 절차의 점검 명령이 `fieldname like 'setive\_nts\_%'` 로 **8** 을 기대하는 것은 그대로 맞지만, 그 명령만으로는 신원 필드를 **전혀 세지 못합니다** — M2 이후에도 8 로 고정입니다. §9.3 에 DocType 별 분해 명령을 추가했습니다.

### 2026-09-16

- **§9 검증 명령의 차트 md5 `4a5b7e9873dc3eee93bffb046137836b`** — 낡은 값이었습니다. 2026-09-07 커밋 `94dc249e28`(1160 의 17-dev 전용 `account_type` 제거)에서 `f6e03a38636b3ce60d028887ad41f471` 로 바뀌었는데 기대값이 그대로 남아, 이 명령을 그대로 돌리면 정상인 차트가 불일치로 보였습니다. 현재 값으로 고쳤습니다(계정 수 324 는 그대로).
- **§8 백필 절차의 표준코드 점검 기대값** — `unmapped_count 0, stale False` 만 적었습니다. `report_unmapped` 가 `missing`(매핑표에는 있으나 회사에 없는 계정번호)을 함께 돌려주도록 바뀌어 기대값에 `missing_count 0` 을 추가했습니다. 계정과목표에 계정이 추가된 뒤 만들어진 회사와 그 전에 만들어진 회사의 격차를 잡는 값입니다([KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §8-4).

초판(2026-09-06)은 포크가 upstream `develop`(erpnext 17.0.0-dev) 위에 있는 상태에서 작성·실측됐습니다. 2026-09-06 리베이스로 코어가 `v16.33.0` 이 되면서 아래 서술이 사실과 달라졌습니다. **어느 것도 앱 코드의 동작 변경 때문이 아니라 코어 버전이 바뀌었기 때문입니다.**

- **§4.1 — `bank_charges_account` · `exchange_gain_account` · `exchange_loss_account` 는 16.33 Company 에 필드가 없습니다.** 초판은 12개 전부를 "훅이 채우는" 것으로 적고 실측 12/12 로 보고했으나, 그 실측은 17-dev 스키마 위에서 이뤄진 것입니다. 신규 16.33 사이트에서는 `OperationalError(1054)` 로 훅 전체가 실패합니다. 근거: `grep -c '"bank_charges_account"' erpnext/setup/doctype/company/company.json` → 0.
- **§4.1 — `exchange_gain_loss_account`(5422) 는 폴백이 아니라 16.33 의 유일한 실현 환차손익 계정입니다.** 초판은 `erpnext/accounts/services/exchange_gain_loss.py` 가 gain/loss 를 분리 기표하므로 5422 에는 잔액이 안 생긴다고 적었으나, **16.33 에는 그 파일이 없습니다.** 4250 외환차익 / 5420 외환차손 분리 표시는 자동으로 되지 않으며 결산 대체분개가 필요합니다. 근거: `grep -rn "exchange_gain_account" --include='*.py' erpnext` → 0건, `grep -rln "exchange_gain_loss_account" --include='*.py' --include='*.js' erpnext | grep -v test` → 13건.
- **§4.1 — 선수수익/선급비용의 근거를 `item_group.py:124-125` 에서 `stock/get_item_details.py` 의 `get_default_deferred_account` 로 바꿨습니다.** 16.33 `item_group.py` 에는 deferred 계정 캐스케이드가 없습니다(17-dev 전용). 기능 효과는 유지됩니다 — 16.33 은 `frappe.get_cached_value("Company", company, "default_" + fieldname)` 로 Company 값을 직접 읽습니다.
- **§4.1 이 인용한 `bom/services/operations_cost.py` 와 §4.2 의 `item_standard_cost.py` 는 16.33 에 없는 파일입니다.** 5251 의 실제 소비처는 `bom.py:1615`, 2162 는 `purchase_invoice.py:1343` 이며 기능은 유지됩니다. 같은 이유로 §6.2 가 인용한 `accounts/services/taxes.py` 도 없어 `AccountsController.append_taxes_from_item_tax_template` 로, `gl_composer` 는 `sales_invoice.py:1710` 으로 바꿨습니다. 앱 소스 주석에도 같은 17-dev 경로(`purchase_receipt/services/provisional_accounting.py` 등)가 남아 있으니 함께 정리해야 합니다. 워킹트리에 `__pycache__` 만 남은 고아 디렉토리가 있어 `ls` 로는 존재하는 것처럼 보입니다 — `find erpnext -type d -name __pycache__ -prune -exec rm -rf {} +` 로 지웁니다.
- **§4.2 — `Item Standard Cost` DocType 자체가 16.33 에 없습니다.** 초판의 "표준원가 테넌트가 나올 때 이 필드에 지정한다"는 안내를 따라가면 존재하지 않는 필드를 찾게 됩니다. 17 로 올라간 뒤로 유보합니다.
- **§4.3 · §5 — `Company.default_warehouse` 는 16.33 에 없습니다.** 초판은 "`default_warehouse` 는 코어가 채운다"고 적었으나 16.33 `create_default_warehouses` 는 창고와 그룹만 만들고 Company 필드를 채우지 않습니다. 결과적으로 Stores 창고는 계정 1155 만 붙고 회사 단위 기본 창고로 지정되는 경로가 없습니다(§11-13). §4.3 제목의 "15 + 4" 숫자는 17-dev 실측 기준이라 뺐습니다 — 16.33 에서 재실측하기 전까지 숫자를 쓰지 않습니다.
- **§4.1 · §4.3 · §5 의 `company.py` 라인 번호가 전부 어긋났습니다.** `set_default_accounts` 741 → 623, `validate_default_accounts` 360 → 248, `create_default_warehouses` 495 → 383, `validate_provisional_account_for_non_stock_items` 688 → 570. 다음 upstream 이동에도 견디도록 **함수명 기준 인용으로 바꿨습니다.** 이 문서의 남은 라인 번호(`stock/__init__.py`, `warehouse.py`, `work_order.py` 등)는 17-dev 시점 값이며 몇 줄씩 어긋날 수 있습니다. 확인은 `grep -n "def <함수명>" <파일>` 로 합니다.
- **§10-1 의 환경 불일치는 해소됐습니다** (2026-09-06 리베이스). 대신 `bench migrate` 미실행 상태가 새 미해결 항목입니다.
- **2026-09-08 — §4.3 "훅은 이 필드들에 개입하지 않는다" 와 §5 "창고 계정은 1155/1154/1152/1158 고정".** 업종 프로필(§4.4)이 생기면서 프로필이 바뀐 저장에서는 재고·매출원가·매출·매출할인 4개 필드와 창고 계정을 전환한다. 그 밖의 저장에서는 이전 서술대로다. `warehouses.ROLES` 의 `account_number` 키는 없어졌고 계정은 `industry.WAREHOUSE_ACCOUNTS` 가 정한다. 같은 이유로 §3.3 의 "빈 값만 채운다" 는 전환 규칙(`industry.decide`)으로 확장됐다.
