---
id: KB-ARCH-002
title: ERPNext·Frappe 커스터마이징 역학 — 재고 GL · against · 계정 결정 · 훅 · 운영 절차
domain: 아키텍처
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16 (근거 사본은 16.21.1 — §5 머리말)
verified_on: 2026-09-08
verified_by: 포크 소스 전수 대조(라인 확정) + 제조·상품매매 fixture 회사 런타임 실측 + 적대적 재검증 8건
related: [KB-ARCH-001, KB-KOR-003, KB-KOR-004, KB-OPS-001, ONT-ENT-001]
---

# KB-ARCH-002: ERPNext·Frappe 커스터마이징 역학

## 1. 이 문서의 자리

[`CLAUDE.md`](../../CLAUDE.md) 가 **"어디를 고칠 것인가"**(라우팅 0~3단계, 금지 사항)를 정한다면, 이 문서는 그 아래층의 **"고치면 실제로 무슨 일이 일어나는가"** 입니다. 전부 이번 작업에서 부딪혀 확인한 것이고, 각 항목은 **모르면 무증상으로 틀리는 것**만 골랐습니다.

> ⚠️ 이 문서에 실린 사실 중 셋은 **작업 중 우리가 틀리게 알고 있었다가 검증에서 뒤집힌 것**입니다(§2.1, §3.4, §4.3). 표시해 두었습니다.

라인번호는 v16.33.0 기준이며 `git describe` → `v16.33.0-19-g76b7b8613c` 시점에 실제로 열어 확인했습니다. 리베이스 후에는 함수명으로 다시 찾으십시오.

---

## 2. 재고 GL 전기

### 2.1 ⚠️ 골격은 하나가 아니다 — `StockController.get_gl_entries` 를 타는 전표는 4종뿐

작업 중 "모든 재고 전표가 이 골격을 쓰거나 확장한다"고 적었으나 **틀렸습니다.**

| 골격을 타는 전표 (4종) | 방식 |
|---|---|
| Delivery Note | 순수 상속 (`delivery_note.py` 에 `get_gl_entries` 0건) |
| Stock Entry | `super()` 호출 후 추가원가·LCV 덧붙임 (`stock_entry.py:2359`) |
| Stock Reconciliation | `super()` 에 문서레벨 `expense_account`·`cost_center` 주입 (`stock_reconciliation.py:967`) |
| Sales Invoice | `update_stock=1` **그리고** 영구재고일 때만, `make_item_gl_entries` 안에서 (`sales_invoice.py:1800-1801`) |

| 골격을 **안** 타는 전표 | 위치 |
|---|---|
| Purchase Receipt | `purchase_receipt.py:468-478` — 자체 조립 |
| Purchase Invoice | `purchase_invoice.py:939-967` — 자체 조립 |
| Subcontracting Receipt | `subcontracting_receipt.py:708-718` |
| Asset Capitalization | `asset_capitalization.py:428-454` (소비 재고는 SLE당 credit 1줄만) |

`super().get_gl_entries` 를 호출하는 곳은 소스 전체에서 **정확히 3곳**입니다(DN은 오버라이드가 없어 상속).

→ **커스터마이징 함의**: `StockController.get_gl_entries` 만 후킹하면 **매입(PR·PI·SCR)과 자산자본화 분개는 전혀 바뀌지 않습니다.**

다만 비골격 전표도 **계정 해석 헬퍼는 공유**합니다 — `get_inventory_account_dict` · `get_inventory_account_map` · `get_stock_ledger_details` · `get_debit_field_precision`, 그리고 PR은 `append_expenses_added_to_stock_pair` 까지. 그래서 훅 지점을 고를 때 먼저 나눠야 합니다:

- **계정 해석을 바꾼다** → 공유 헬퍼 후킹 (골격 밖 전표까지 함께 바뀜)
- **분개 구조를 바꾼다** → 전표별로 최소 5곳

### 2.2 골격이 만드는 줄

SLE 한 건당 두 줄 — 창고재고계정 `debit = flt(sle.stock_value_difference, precision)` (`stock_controller.py:791-807`), 상대계정 `debit = -1 × 그 값` (`:809-826`). **단 창고 계정이 해석될 때만**(`:775`); 안 되면 창고명만 모아 뒤에서 throw 합니다(`:827-828`, `:882-889`).

두 줄이 전부가 아닙니다: 내부이전 반올림차 2줄(`:830-880`), 재고자산가산비용 2줄(`:891-892` → `:906-973`). 후자는 전표 설정이 아니라 **클래스 상수** `book_expenses_added_to_stock`(Stock Entry·Stock Reconciliation만 True)이 열고, `Accounts Settings.book_stock_expense_gl_entries` 가 한 번 더 게이트합니다.

`voucher_details` 는 대개 `self.items` 지만 **Stock Reconciliation만은 `sle_map` 키로 합성한 가짜 행**입니다(`:981-997`) — 전 행이 같은 `expense_account`·`cost_center` 를 공유하므로 병합이 최대로 일어납니다(§3.4).

### 2.3 상대계정 결정은 if/else 한 줄

```python
# stock_controller.py:782-789
expense_account = (대상창고의 재고계정) if item_row.get("target_warehouse") else item_row.expense_account
```

`target_warehouse` 필드를 가진 child DocType 은 DN Item · SI Item · POS Invoice Item · Packed Item · SO Item · Job Card 뿐입니다. **Stock Entry Detail 에는 없습니다**(`s_warehouse`/`t_warehouse` 를 씀) — 그래서 창고이동에서도 상대계정은 항상 `item.expense_account` 이고, 정산은 §2.5의 병합 상쇄로 이뤄집니다.

### 2.4 창고 → 재고계정 해석 우선순위

`erpnext/stock/__init__.py:56-98`:

1. `Warehouse.account`
2. 가장 가까운 상위 창고의 `account`
3. `Company.default_inventory_account`
4. 회사 내 `account_type='Stock'`, `is_group=0` 리프가 **정확히 1개**면 그것
5. 실패 → throw (단 `raise_error` 이고 창고에 company 가 있고 그룹이 아닐 때만; 아니면 조용히 `None`)

> **4번은 한국 표준 CoA 에서 무효입니다** — 재고 계정을 상품/제품/원재료 등으로 쪼갠 순간 리프가 여러 개가 됩니다. 그래서 창고마다 `account` 를 반드시 지정해야 하고, 안 하면 **전표 제출 시점에** throw 합니다. 이것이 앱 `warehouses.py` 가 존재하는 이유입니다.

**v16.33 신규**: `Company.enable_item_wise_inventory_account` 를 켜면 창고맵 대신 품목맵(Item Default → Item Group → Brand)을 쓰고, 계정 못 찾은 품목마다 throw 합니다(`stock_controller.py:269-271`, `:281-295`, `:2642-2685`).

전환 가드(`company.py:215-230`)는 **세 조건의 AND** 라 생각보다 좁습니다: (a) 값이 실제로 바뀌고, (b) `is_cancelled=0` 인 SLE 가 있고, (c) **저장 전 문서**의 `enable_perpetual_inventory` 가 참. 게다가 `Company.validate` 안에만 있어 **`frappe.db.set_value` 로는 완전히 우회**됩니다(upstream 테스트가 실제로 그렇게 우회합니다).

### 2.5 같은 계정 창고이동은 GL 이 아예 안 생긴다

창고이동 한 행은 SLE 2건 → 4줄 → 병합. `expense_account` 가 ±상쇄되고, 출발·도착 계정이 같으면 창고계정도 상쇄되어 **0원 필터에 전부 걸립니다**. upstream 테스트가 이를 단언합니다(`test_stock_entry.py:362-371`: `assertFalse(GL Entry)`).

→ "창고이동인데 GL 이 없다"를 버그로 오인해 코어를 파는 사고가 흔합니다. 반대로 **병합 키(원가중심·프로젝트·회계차원)를 커스터마이징으로 갈라놓으면 상쇄가 깨져** `expense_account` 에 0 아닌 잔재가 남습니다 — 무증상 손익 오염입니다.

---

## 3. `GL Entry.against` — 어디까지 믿을 수 있나

이번 작업의 핵심 도구입니다(엔진 D-6). 신뢰 범위를 정확히 알아야 합니다.

### 3.1 재고 라인의 `against` 는 코어가 계정명을 직접 써 넣는다

`stock_controller.py:794-795`(창고 leg) / `:812-813`(상대 leg). 라운딩 손익 쌍(`:855`·`:871`), 재고가산비용 쌍(`:956`·`:967`)도 같습니다. **병합되지 않은 라인에 한해** 계정으로 신뢰할 수 있습니다.

### 3.2 매입 계열은 거래처명이 들어간다

`purchase_invoice.py:1150` 등이 `against = self.supplier`. `update_stock=1` 이고 `from_warehouse` 가 없으면 `set_expense_account`(`:519-546`)가 `item.expense_account` 를 **창고 재고계정으로 치환**하므로, **재고자산 차변 라인이 곧 `against=거래처명` 인 라인**이 됩니다.

Purchase Receipt 는 다릅니다 — 본선 재고 라인은 계정을 쓰고(`purchase_receipt.py:507·560·630·655·671·720`) 환율차 라인만 supplier(`:585·599`).

→ 계정으로만 파싱하면 PI(update_stock)의 재고자산 라인이 통째로 미해석이 됩니다. **거래처명 단일 토큰을 `PARTY` 로 승격하는 경로가 필수**입니다(앱 `nts_report.PARTY`).

### 3.3 Journal Entry 는 쉼표 목록이고 순서가 비결정적

`journal_entry.py:930-940` — 반대편 원소는 `d.party or d.account`(거래처명일 수 있음), 구분자는 `', '`(공백 포함), 그리고 **`list(set(...))` 를 거쳐 실행마다 순서가 달라집니다.**

> **구분자 불일치 주의**: SI/PI 의 `against_income_account`/`against_expense_account` 는 `','`(공백 없음), JE 는 `', '`. `split(",")` 후 **`strip()` 필수**.
> JE 의 against 문자열 전체를 캐시 키·스냅샷 테스트 기대값으로 쓰면 안 됩니다.

### 3.4 ⚠️ 가장 위험 — 병합이 `against` 를 소리 없이 버린다

병합 키(`general_ledger.py:331-348`)는 12개 필드 + 회계차원이고 **`against` 는 없습니다.** 병합되면 `check_if_in_list` 가 첫 일치 항목을 반환하므로 **먼저 들어온 라인의 against 만 남습니다.**

그리고 재고 GL 에는 `voucher_detail_no` 가 없어(`accounts_controller.py:1410` 은 args 에 있을 때만 채우고 StockController 는 안 넘김) 품목 행이 달라도 병합됩니다.

**구체 시나리오**: Stock Entry(Material Issue)에서 창고 W 의 품목 A → 견본비(5328), 품목 B → 재고조정(5140). 두 창고 leg 은 account·cost_center·project 가 같아 병합되고, 결과는 재고자산 한 줄에 against 하나. **유효한 계정 하나이므로 "정확 판정" 경로로 흘러 100% 가 틀린 계정에 붙습니다. 예외도 경고도 없습니다.**

> **테넌트마다 답이 다릅니다.** 병합을 막는 실질 요소는 `cost_center`/`project`/회계차원의 차이뿐입니다. 품목별 원가중심을 쓰는 테넌트는 병합이 안 일어나 against 가 살아 있고, 안 쓰는 테넌트는 유실됩니다. **한 테넌트에서 검증했다고 안심하면 안 됩니다.**

**우리 엔진의 노출도**(2026-09-08 판정): 병합된 두 상대계정이 **모두 매출원가 집합 안**이면(5110/5120) 블록 총계는 영향이 없어 안전합니다. 하나가 매출원가·하나가 타계정대체 대상(견본비 등)이면 분류가 틀리지만, 그때는 **`매출원가 항등식`이 반드시 실패해 검출됩니다**(원장 쪽 gl(5140) 등과 어긋나므로). 즉 **조용히 틀리지는 않습니다.**

### 3.5 ⚠️ `merge_entries=False` 가 주요 회계 전표의 기본이다

`process_gl_map(gl_map, merge_entries=True, ...)` 의 시그니처 기본값만 보고 "항상 병합된다"고 읽으면 **정반대**입니다.

| 전표 | merge_entries |
|---|---|
| Sales Invoice · Purchase Invoice | `False` 하드코딩 (`sales_invoice.py:1610`, `purchase_invoice.py:895`) — 대신 자기 안에서 `merge_similar_entries` 를 **직접 한 번** 부름(`:1649`, `:960`) |
| Journal Entry · Payment Entry | `Accounts Settings.merge_similar_account_heads` 값 — **DocType 기본값 `"0"`** |
| Period Closing Voucher · Process PCV · Asset Capitalization | `False` 하드코딩 |
| 재고·자산 계열 나머지 | 시그니처 기본값 `True` |

SI/PI 의 직접 병합은 POS·write-off·반올림·loyalty 라인을 붙이기 **전**이라, 그 뒤 라인들은 병합도 0원 필터도 거치지 않습니다.

### 3.6 0원 행 필터는 편의가 아니라 제출의 전제

필터는 `process_gl_map` 이 아니라 **`merge_similar_entries` 안**(`general_ledger.py:315-326`)에 있습니다. 0원 행이 남으면 `GLEntry.check_mandatory` 가 *"Either debit or credit amount is required"* 로 **제출을 막습니다**(`gl_entry.py:155-169`). 예외는 `from_repost`·Period Closing Voucher(`:88`)와 Exchange Gain Or Loss 저널.

→ 병합 뒤에 라인을 붙이는 코드는 **각자 0을 방어해야 합니다.** 코어도 그렇게 합니다(`buying_controller.py:367-369` 의 `if not amount: continue` + 주석).

### 3.7 그 밖의 `against` 주의사항

- **`against` 는 `Link` 가 아니라 `Text`** (`gl_entry.json`) — 참조 무결성이 없고 자유 문자열도 들어옵니다(예: `"Expense account - X for the Loyalty Program"`). 파서는 모르는 형태에 **예외 대신 폴백**해야 합니다.
- **자기순환**: 두 창고가 같은 재고계정이면 `{account: A, against: A}` 가 나옵니다. 상대계정 판정에서 제외해야 합니다.
- **회계차원 offsetting 분개**는 원본을 복사하며 `against` 를 그대로 가져갑니다(`general_ledger.py:82-103`) — 무관한 상대계정명을 답니다. 게다가 `process_gl_map` **이전**에 append 되어 병합 대상이 됩니다.
- **`against` 는 생성 시점에 박제**됩니다. 품목/회사 기본계정을 바꿔도 기존 GL 은 옛 계정명 그대로입니다. Repost Item Valuation 때만 갱신되고 그 경로는 `check_mandatory` 를 스킵합니다.
- 앱에서 `against` 를 교정할 방법이 사실상 없습니다 — `make_regional_gl_entries` 는 국가명 키라 한국은 못 쓰고(`frappe.scrub("Korea, Republic of")` 문제, CLAUDE.md), `update_gl_dict_with_app_based_fields` 는 `gl_dict.update(args)` **이전**에 실행되어 args 의 against 를 덮을 수 없습니다. `override_doctype_class`/`extend_doctype_class` 로 `get_gl_entries` 를 감싸는 길뿐입니다.

---

## 4. 계정 결정 경로

### 4.1 매출원가 계정 (DN / SI)

`get_item_details.py:1000-1019` — `ctx.doctype` 이 Sales Invoice 또는 Delivery Note 일 때만 COGS 분기:

```
Item Default.default_cogs_account → Item Group Default → Brand Default → Company.default_expense_account
   ↓ (넷 다 비면 조기 return 하지 않고)
Item Default.expense_account → Item Group → Brand → ctx.expense_account
```

`default_cogs_account` 는 **v16 신설**입니다(upstream `05f2b43`, 최초 포함 태그 v16.0.0).

**선행 조건 두 개가 있습니다**: 고정자산 품목 + CWIP 회계가 켜져 있으면 `expense_account` 가 `capital_work_in_progress_account` 로 **선점되어 COGS 로직이 아예 호출되지 않습니다**(`:501-522`, `:554-555`). 그리고 모든 경로가 비고 비재고 품목이면 `Company.service_expense_account` 로 마지막 보정(`:596-597`).

### 4.2 `expense_account` 는 한 번 채워지면 갱신되지 않는다

`force_item_fields`(`accounts_controller.py:97-107`)에 없어서 **값이 있는 행은 Company/Item Default 를 나중에 바꿔도 그대로**입니다. 설정 변경 후에는 반드시 **새 전표로** 검증하십시오.

### 4.3 ⚠️ `check_expense_account` 의 throw 는 무조건이 아니다

`stock_controller.py:1065-1101` 은 (a) 빈 값, (b) DN/SI 에서 손익계정이 아님, (c) 손익계정인데 원가중심 없음 을 throw 합니다. 그러나 **`get_gl_entries` 안에서 SLE 의 창고 계정이 있을 때만 호출**되고, `get_gl_entries` 자체가 영구재고를 요구합니다(SI 는 추가로 `update_stock=1`).

→ **영구재고를 끄고 매출원가 설정을 테스트하면 오류가 안 나서 통과한 것처럼 보이지만, 실제로는 매출원가 GL 이 생성되지 않는 무증상 상태입니다.** DN/SI Item 의 `expense_account` 에는 `reqd` 가 없습니다.

### 4.4 Company 기본계정 — 두 갈래로 채워진다

**account_type 매칭** (`company.py:623-646`, `_set_default_account`): 무조건 8개 — `default_cash_account`←Cash, `default_bank_account`←Bank, `round_off_account`←Round Off, `accumulated_depreciation_account`, `depreciation_expense_account`, `capital_work_in_progress_account`, `asset_received_but_not_billed`, `default_expense_account`←**Cost of Goods Sold**. 영구재고면 3개 추가 — `stock_received_but_not_billed`, `default_inventory_account`←Stock, `stock_adjustment_account`.

**영문 계정명(번역) 매칭** (`:648-689`) — `default_income_account`, `write_off_account`←`_("Write Off")`, `exchange_gain_loss_account`, `disposal_account`.

> ⚠️ **번역 의존 함정**: 한국 차트는 계정명이 한글이라 이 4개가 `ko.po` 의 msgstr 에 의존합니다. crowdin 봇이 `erpnext/locale/ko.po` 를 덮으면 **아무 오류 없이 이 4개가 빕니다.** CLAUDE.md 가 번역을 앱 locale 로 옮기라고 한 이유와 직결됩니다([KB-LOC-003](./KB-LOC-003_fork_local_translation.md)).

### 4.5 같은 account_type 이 여럿이면 — **JSON 형제 순서의 마지막**이 이긴다

`frappe.db.get_value(dict 필터)` 는 `creation DESC` 첫 행이고, 차트 JSON 트리 순회 순서가 곧 creation 순서이므로 **마지막 형제**가 선택됩니다. 한국 차트 실측: Cost of Goods Sold 리프가 5110→5130→5120 순이라 **5120 제품매출원가**가 기본값이 됩니다.

**예외 하나**: `default_income_account` 만 `frappe.get_all` 경로라 `creation ASC` **첫 계정**입니다.

> 차트 JSON 의 형제 순서를 바꾸면 회사 기본계정이 조용히 바뀝니다. UI 트리는 계정번호로 정렬해 보여주므로 **JSON 순서는 화면 어디에도 드러나지 않습니다.** 손으로 편집하지 말고 `scripts/coa/build_kr_coa.py` 로 생성하십시오.

### 4.6 `validate_default_accounts` 는 일부만 검사한다

19개 필드에 대해 리프·활성·같은 회사·통화 일치를 검사합니다(`company.py:248-298`). **빠진 것**: `default_provisional_account`, `default_operating_cost_account`, `default_advance_received/paid_account`, `capital_work_in_progress_account`, `asset_received_but_not_billed`, **`default_inventory_account`**. 그리고 `frappe.db.set_value` 는 이 validate 를 통째로 우회합니다.

---

## 5. Frappe 문서·훅 역학

> 이 절의 frappe 근거는 로컬 사본 **v16.21.1** 기준이며, 런타임 이미지의 frappe 와 패치 버전이 다릅니다. 인용한 함수들은 오래 안정적이었지만 **버전 차이를 감안**하십시오.

### 5.1 `doc_events` 훅은 코어 뒤에, 같은 인스턴스로

`document.py:1576-1592` — `compose` 의 runner 가 코어 메서드를 먼저 부르고 훅을 순회합니다. DocType 전용 훅이 먼저, `"*"` 훅이 나중(`:1598-1600`).

- 핸들러가 위치인자 2개 이상이면 `f(self, method)`, 1개면 `f(self)` (`:51-61`).
- **훅 실행 구간에서는 `frappe.db.commit()`/`rollback()` 이 경고만 내고 무시됩니다**(`_disable_transaction_control` +1, `database.py:1176-1215`).

### 5.2 ⚠️ `db.set_value` 는 메모리 doc 를 갱신하지 않는다 — 다음 저장이 되돌린다

이번 작업에서 실제로 물린 버그입니다.

```
훅이 db.set_value 로만 씀
  → 폼이 받은 메모리 doc 에는 옛 값
  → 다음 저장의 db_update 가 전 컬럼을 UPDATE (base_document.py:801-820)
  → 훅의 변경이 사라짐. 에러도 로그도 없음
```

**`update_modified=False` 일 때만 조용합니다.** True 였다면 `check_if_latest` 가 `TimestampMismatchError` 로 시끄럽게 실패합니다(`document.py:1034-1060`).

→ **`self.db_set(...)` 을 쓰거나**(코어 방식, 메모리도 갱신), `db.set_value` 뒤에 `doc.update(...)` 로 반영하십시오. 앱 `korea/common/company.py` 의 `on_update` 가 후자입니다.

### 5.3 `has_value_changed` 는 신규 insert 에서 **항상 True**

`get_doc_before_save()` 가 `None` 이면 필드 값과 무관하게 True 를 반환합니다(`document.py:684-685` `if not previous: return True`). frappe 의 기본 의미론은 "신규 생성 = 모든 필드가 변경됨" 입니다. `None → None` 도 True.

→ "값이 바뀐 저장에서만" 이라는 게이트를 이걸로 만들면 **신규 생성에서 항상 발동**합니다. 실효 변경만 잡으려면 직접 비교하십시오 (앱 `industry.profile_changed` 참고).

### 5.4 `bulk_update` 는 문서 캐시를 지우지 않는다

`db.set_value` 는 UPDATE 직전에 `clear_document_cache` 를 부르지만(`database.py:993`, dict 필터면 DocType 전체 `:996`), **`db.bulk_update` 에는 무효화가 전혀 없습니다**(`:1003-1134`). 직후 `get_cached_doc`/`get_cached_value` 로 읽으면 redis 의 옛 값이 나오고 **프로세스 재시작으로도 안 사라집니다.**

### 5.5 Custom Field

- `create_custom_fields(..., update=True)` 는 멱등 — `__dict__` 가 실제로 달라졌을 때만 save.
- **`module` 은 Module Def 링크** — `modules.txt` 의 실제 값이어야 합니다(틀리면 `LinkValidationError`). 앱 정답: `SETIVE ERPNext KR`.
- **`reqd=1` 을 걸면 회사 생성이 깨집니다** — `create_charts` 는 루트 계정에만 `ignore_mandatory` 를 줍니다. 실패 메시지가 Account 에서 나와 원인이 Custom Field 라는 게 안 보입니다.
  - 예외: 비어있지 않은 `default` 가 있거나 `fieldtype`이 `Check` 면 통과합니다.

### 5.6 ⚠️ 훅 안에서 Custom Field 를 만들면 트랜잭션이 깨진다 — 반드시

`frappe.db.sql_ddl` 은 `_disable_transaction_control` 을 **0 으로 강제 리셋하고 commit 을 실행한 뒤** DDL 을 날립니다(`database.py:451-458`, 주석: *"DDL queries that alter schema autocommit in MariaDB"*). `create_custom_fields` 는 끝에서 `updatedb` → `ALTER TABLE` 로 이어집니다.

→ 훅 실행 중이던 트랜잭션(반쯤 저장된 Company 등)이 **그 시점에 확정 커밋**되고, 이후 예외가 나도 롤백이 거기까지만 됩니다. **필드 생성은 `after_install`/`after_migrate` 에서만.** 훅 경로에서는 필드가 없으면 생성하지 말고 **throw** 하십시오(앱 `nts_codes._assert_fields_exist`).

### 5.7 영구재고 회사에서 재고 계정에 Journal Entry 를 못 쓴다 — 판정 논리가 역방향

`journal_entry.py:360-378`:

1. 영구재고가 아니거나 `voucher_type == "Periodic Accounting Entry"` 면 검사 스킵
2. 대상은 `account_type == "Stock"`, `is_group=0` 인 그 회사 계정
3. **GL 잔액 == Stock Ledger 합계 이면 throw** (`StockAccountInvalidTransaction`)

"두 잔액이 이미 일치할 때 막고, 어긋나 있을 때만 허용"하는 역방향 논리입니다(불일치 조정 전표만 허용하려는 의도).

→ **잔액이 둘 다 0 인 신규 회사에서는 `0 == 0` 이라 throw 됩니다.** 기초재고 대체 분개가 막히는 이유가 이것입니다.
→ 부수 효과: 회사의 Stock 계정이 1개뿐이면 `related_warehouses` 가 빈 리스트가 되고 `get_stock_value_on([])` 이 **창고 필터 없이 회사 전체 SLE 를 합산**합니다(`accounts/utils.py:1892-1904`, `stock/utils.py:75`).

---

## 6. 운영·검증 절차

### 6.1 앱 밖 스크립트를 실행하는 법

`bench execute <경로>` 는 **설치된 앱의 모듈 경로**만 받습니다. 앱 밖 경로는 `frappe.get_attr` 의 `AppNotInstalledError` → `eval` 폴백 → **`NameError`** 로 죽습니다(오류 메시지로 원인을 추정하지 마십시오).

`bench console` 은 IPython 이라 여러 줄 블록이 뭉개집니다. 확실한 길:

```bash
docker compose -f $COMPOSE cp <script>.py backend:/tmp/<script>.py
docker compose -f $COMPOSE exec -T -w /home/frappe/frappe-bench/sites backend \
  /home/frappe/frappe-bench/env/bin/python /tmp/<script>.py
```

스크립트는 `frappe.init(site="localhost"); frappe.connect()`. **cwd 가 `frappe-bench/sites` 여야 합니다** — `init(site, sites_path=".")` 이라 기본값이 cwd 입니다.

### 6.2 Transaction Deletion Record — 회사 거래 삭제

정확한 순서(upstream `company.py:1075-1097` 과 동일):

```python
tdr = frappe.get_doc({"doctype": "Transaction Deletion Record",
                      "company": c, "process_in_single_transaction": 1})
tdr.insert()                    # validate 가 무시 목록을 채운다
tdr.generate_to_delete_list()   # 그 목록을 excluded 로 써서 삭제 목록 생성
frappe.db.commit()              # 실패 시 레코드가 롤백되지 않게
tdr.submit()                    # on_submit 이 start_deletion_tasks 를 스스로 부른다
frappe.db.commit()
tdr.reload()
assert tdr.status == "Completed", tdr.error_log
```

함정이 많습니다:

| 함정 | 결과 |
|---|---|
| `insert` 전에 `generate_to_delete_list` | 무시 목록이 비어 Account·Warehouse·BOM·Customer·Supplier 가 삭제 목록에 들어감 |
| `submit` 뒤 `start_deletion_tasks` 재호출 | status 가 **`Running` 에 영구히 갇힘** → 이후 모든 TDR 이 막히고 redis 키가 4시간 해당 doctype 저장을 막음 |
| `process_in_single_transaction=0`(기본) | RQ 워커가 처리할 때까지 아무 일도 안 일어남 (`enqueue_after_commit=True`) |
| 예외 | `execute_task` 가 **전부 삼킵니다** — submit 은 성공한 것처럼 보임. `reload()` 후 `status` 검사 필수 |
| `doctypes_to_delete` 빈 채 submit | `before_submit` 가드가 AND 조건이라 통과 → 뒤에서 throw → rollback 으로 **TDR 레코드 자체가 사라짐** |

TDR 은 `frappe.db.delete()` 직접 호출이라 `on_trash`·docstatus 검사를 전부 우회합니다 — **제출된 전표도 취소 없이 삭제**됩니다.

**무시(ignore) 목록**(TDR 이 안 지움): Account, Cost Center, Warehouse, Budget, Party Account, Employee, 세금 템플릿 2종, POS Profile, **BOM**, Company, Bank Account, Item Tax Template, Mode of Payment(+Account), **Item Default**, **Customer**, **Supplier**, Department.

### 6.3 `Company.on_trash`

- GL Entry 가 없을 때만 Account/Cost Center/Budget/Party Account 삭제
- SLE 가 없을 때만 Warehouse 삭제
- **조건 없이** Mode of Payment Account, Item Default, Item Reorder, BOM(+자식), Employee, Department, **Transaction Deletion Record**, 세금 템플릿 3종 삭제

→ **TDR 을 회사보다 먼저 `frappe.delete_doc` 으로 지워야** 자식 행이 고아로 안 남습니다.
→ TDR 이 실패해 GL 이 남아 있으면 **회사만 지워지고 계정과목표·창고가 통째로 잔존**합니다 — 오류 없이.

### 6.4 리포트 등재

`frappe.reload_doc(module, "report", slug, force=True)` 는 migrate 와 **같은 코드 경로**(`import_file_by_path`)를 타고 **`developer_mode=0` 에서도 동작**합니다(`in_import` 플래그가 validate 를 건너뛰게 함).

**`force=True` 를 쓰십시오** — `force=False` 는 파일의 `modified` 가 DB 값보다 오래되면 **조용히 건너뜁니다.**

### 6.5 파일을 바꾼 뒤 필요한 조치

[`CLAUDE.md`](../../CLAUDE.md) 의 표가 기준이며, 이번에 확인한 보완 사항만 적습니다.

- **`.py` 재기동 뒤 `frontend` 도 재기동해야 할 수 있습니다.** backend 컨테이너를 재생성하면 nginx 가 옛 upstream IP 를 물고 있어 **502** 가 납니다. gunicorn 로그는 정상이라 원인이 안 보입니다. → `docker compose restart frontend`.
- **DocType 폴더의 `.js` → 조치 없음** 은 `developer_mode=1` 일 때만입니다. 꺼져 있으면 FormMeta 가 redis 에 캐시됩니다(`meta.py:33-47`). 이 개발 스택은 compose 가 `developer_mode 1` 을 설정합니다.
- `bench build` 불가 근거가 compose 에 명시돼 있습니다(`docker-compose.yml:180-187`) — 포크를 바인드 마운트하면 이미지의 dist 가 가려지고 **이 이미지에는 node 가 없습니다.**

---

## 7. 무증상 실패 체크리스트

커스터마이징 후 이 목록으로 자문하십시오. 전부 **에러 없이 틀리는** 것들입니다.

| # | 증상 없음 | 확인 방법 |
|---|---|---|
| 1 | `StockController` 만 후킹 → 매입 전표 분개 안 바뀜 | PR·PI 로도 전표를 만들어 GL 확인 (§2.1) |
| 2 | 병합으로 `against` 유실 → 상대계정 100% 오배분 | 원가중심 없는 테넌트에서, 한 전표에 다른 expense_account 품목 2개 (§3.4) |
| 3 | 병합 키를 갈라 놓아 창고이동 상쇄가 깨짐 | 같은 계정 창고이동 후 GL 0건인지 (§2.5) |
| 4 | 영구재고 꺼진 채 매출원가 설정 테스트 → 통과처럼 보임 | `enable_perpetual_inventory` 확인 (§4.3) |
| 5 | 차트 JSON 형제 순서 변경 → 기본계정 바뀜 | UI 에 안 드러남. 생성기로만 편집 (§4.5) |
| 6 | `ko.po` 덮어씀 → 기본계정 4개가 빔 | `write_off_account` 등 확인 (§4.4) |
| 7 | 훅이 `db.set_value` 만 씀 → 다음 저장이 되돌림 | 폼에서 두 번 저장 후 DB 확인 (§5.2) |
| 8 | `has_value_changed` 게이트가 신규 생성에서 항상 발동 | (§5.3) |
| 9 | `bulk_update` 후 캐시 오염 | `get_cached_value` 로 읽어 확인 (§5.4) |
| 10 | 훅 안 `create_custom_fields` → 부분 커밋 | (§5.6) |
| 11 | `reload_doc(force=False)` → 조용히 스킵 | (§6.4) |
| 12 | backend 재생성 후 502 | `frontend` 재기동 (§6.5) |
| 13 | TDR 실패했는데 성공처럼 보임 | `reload()` 후 `status` (§6.2) |
| 14 | `enable_item_wise_inventory_account` 를 `db.set_value` 로 우회 → 과거·신규 GL 이 다른 계정 기준 | (§2.4) |

---

## 8. 이 지식의 출처

전부 2026-09-07~08 국세청 표준재무제표 리포트 작업에서 실제로 부딪힌 것입니다.

| 발견 | 계기 | 상세 |
|---|---|---|
| `against` 의 신뢰 범위 (§3) | 전표 단위 비례 배분이 매출채권으로 새는 것을 실측 (재고 대변 253,760 → 매출채권 143,938 / 원가 109,822) | [KB-KOR-004](./KB-KOR-004_nts_financial_statements.md) §4.2 |
| SI(update_stock)가 수익·원가를 한 전표에 싣는다 | 같은 실측의 원인 | KB-KOR-004 §4.2 |
| 훅의 메모리 doc 문제 (§5.2) | 업종 프로필 전환이 폼의 다음 저장에서 되돌아감 | [KB-KOR-003](./KB-KOR-003_company_hook_tax_nts.md) §4.4 |
| 재고 계정 JE 차단의 역방향 논리 (§5.7) | fixture 의 수기 매입 분개가 막힘 | 이 문서 §5.7 |
| TDR 절차 (§6.2) | fixture teardown 이 `Running` 에 갇힘 | `scripts/nts/fixture_company.py` (형제 앱) |
| 기본계정이 JSON 마지막 형제 (§4.5) | `default_expense_account` 가 5120 인 이유 | [KB-KOR-002](./KB-KOR-002_korean_chart_of_accounts.md) §6.1 |

개념 층(재고 흐름 4분류, 매출원가 블록, 불변식)은 [ONT-ENT-001](../ontology/ONT-ENT-001_inventory_cost_flow.md) 에 따로 있습니다.

## 9. 미검증·남은 것

- **실 DB 대조 미수행**: `select account, against, count(*) from tabGL Entry group by ...` 로 §3.4 의 병합 유실이 이 테넌트에 실재하는지 확인하지 않았습니다.
- **frappe 근거의 버전 차이**: §5 는 v16.21.1 사본 기준입니다(런타임은 이미지 내장 frappe).
- **미조사 전표**: Payment Entry · Period Closing Voucher · Asset Depreciation · Landed Cost Voucher 의 `against` 규칙.
- **앱에서 `against` 를 교정하는 설계 결정**(§3.7 마지막) — `override_doctype_class` 로 갈지 미정.
