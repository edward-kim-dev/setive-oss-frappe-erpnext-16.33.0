---
id: KB-KOR-004
title: 국세청 표준재무제표 리포트 (표준재무상태표·표준손익계산서·제조원가명세서)
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@16.31.0
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-08
verified_by: 개발 컨테이너 E2E — 제조·상품매매 fixture 회사(scripts/nts/fixture_company.py) 각 16·13 전표로 리포트 3종 실행, 대사식 9/9 통과(차이 0원)
related: [KB-KOR-002, KB-KOR-003, KB-OPS-001]
---

# KB-KOR-004: 국세청 표준재무제표 리포트

## 1. 요약

법인세법 §60② 는 **모든 법인**이 법인세 신고 시 표준재무상태표·표준손익계산서(제조업은 제조원가명세서 포함)를 제출하도록 합니다. [KB-KOR-002](./KB-KOR-002_korean_chart_of_accounts.md) 가 만든 계정↔서식코드 매핑을 실제로 소비해 서식 형태로 출력하는 것이 이 리포트입니다.

| 산출물 | 위치 (형제 앱 저장소) |
|---|---|
| 엔진 | `setive_erpnext_kr/korea/common/nts_report.py` |
| 서식 행 정의 | `setive_erpnext_kr/korea/common/data/nts_form_rows.json` (bs 287 · is 199 · mfg 45행) |
| 리포트 3종 | `setive_erpnext_kr/setive_erpnext_kr/report/nts_standard_{balance_sheet,income_statement}/`, `.../nts_manufacturing_cost_statement/` |
| 검증 fixture | `scripts/nts/fixture_company.py` — 제조·상품매매 회사를 만들고 지운다 (§7) |

포크는 수정하지 않았습니다.

## 2. 자료 흐름

```
계정과목표 (포크 verified/kr_*.json)
   └→ 회사 생성 시 Account 324개
        └→ nts_codes.apply()  ─── 매핑표(nts_standard_code_map.json)를 읽어
             Account Custom Field(setive_nts_{bs,is,mfg}_code / role) 에 기록
                  └→ nts_report 엔진이 **Custom Field 를 권위로** 읽음
                       + 행 구조는 nts_form_rows.json
                       + 집합·산식·대사는 nts_standard_code_map.json
                            └→ Script Report 3종
```

**권위가 3분할**된 것이 핵심입니다. 계정 배정은 Custom Field 라서 테넌트가 손으로 재매핑한 것이 보존되고(`apply(force=False)` 가 빈 계정만 채움), 행 구조와 산식은 파일이 권위입니다.

> ⚠️ **매핑표(JSON)를 고쳐도 리포트는 바뀌지 않습니다.** 엔진은 Custom Field 를 읽습니다. 매핑을 바꿨으면 `nts_codes.apply(company, force=True)` 로 계정에 다시 밀어넣어야 합니다. 실측에서 이걸 빠뜨려 매출원가가 0 으로 나왔습니다.

## 3. 계산 규격

`computed_ops` 7종으로 서식 행을 계산합니다.

| op | 뜻 |
|---|---|
| `opening_balance` / `closing_balance` | 기초·기말 잔액 합 |
| `movement` | 기간 발생액. 라인마다 **상대계정**을 구해 `except_counter` 집합이면 제외(재고 내부이동·원가대체 배제). 상대계정 판정은 §4 |
| `formula` | 같은 서식 행 코드와 `direct`(그 행에 직접 배정된 계정 잔액) 의 사칙연산 |
| `ref` | 다른 서식 행 참조 (is 44 → mfg 49) |
| `children` | 자식 행 합계 |
| `constant` | 대응 계정이 없는 행 |

행 속성 `contra`(괄호 항목)는 상위 합계에 음수로 들어갑니다. `level:"parent"` 는 하위 내역 행을 쓰지 않고 **총계 행에 원장을 직접 배정**한다는 뜻입니다.

`role` 은 배정에서 제외합니다 — `reconcile_only`(대사에만 사용), `not_applicable`.

매핑표를 고치지 않고 엔진 상수로 얹는 보정은 `nts_report.py` 모듈 docstring의 **D-1 ~ D-6** 입니다. 적용 사실은 매 실행 `spec_patch` 등급 info 경고에 남습니다.

## 4. 영구재고와 실지재고 산식 — 상대계정은 `against` 로 판정한다

### 4.1 문제

ERPNext 는 **영구재고**라 판매 시점에 실제 매출원가를 원장(`5110` 상품매출원가 · `5120` 제품매출원가)에 계상합니다. 서식의 매출원가 블록은 **실지재고 방식**입니다.

```
(1)상품매출원가 36 = 기초재고 37 + 당기매입원가 38 − 관세환급 39 − 기말재고 40 − 타계정대체 41
(2)제조원가    42 = 기초재고 43 + 당기총원가 44 − 관세환급 45 − 기말재고 46 − 타계정대체 47
                     (44 = 제조원가명세서 49 당기제품제조원가, 서식 작성방법 제3항이 일치를 강제)
```

이 등식은 재고계정의 T계정 항등식이라 **측정만 맞으면 원장과 정확히 같아야** 합니다. 기초·기말은 잔액이므로 신뢰할 수 있고, 유입(38·mfg 3)과 타계정대체(41·47·mfg 48)만 `movement` 로 잽니다.

2026-09-07 실측(데모 회사)에서 산식 39,928 vs 원장 253,760 이 나왔고, 당시에는 총계 행을 원장으로 덮는 엔진 상수(`COGS_DIRECT`)로 우회했습니다. 그 우회는 잘못이었습니다 — 원인을 잘못 짚었고 새 결함을 만들었습니다(§9).

### 4.2 진짜 원인 — 상대계정 비례 배분

옛 엔진은 상대계정을 **전표 안 반대편 라인에 금액 비례로 배분**해 구했습니다. ERPNext 는 `Sales Invoice(update_stock=1)` 한 전표에 수익 분개(1131/4111)와 원가 분개(1152/5120)를 함께 싣습니다(`erpnext/accounts/doctype/sales_invoice/sales_invoice.py` — `gl_entries += super().get_gl_entries()`). 그래서 재고 대변 4,500 의 상대가 매출채권 69%·원가계정 31% 로 쪼개졌고,

- `counter_in_reverse: SETTLEMENT`(매입환출 화이트리스트)에 매출채권이 들어 있어 **외상매출 전표마다 당기매입원가가 깎였습니다.** 상품매매 fixture: `is 38` 110,000 이 80,000 으로(40,000 × 0.75 누락).
- 매출채권 몫이 타계정대체로 새어 산식 총계가 원장의 43% 만 인쇄됐습니다(데모 실측 109,822 vs 253,760).

### 4.3 정정 — D-6

재고 GL 라인의 `GL Entry.against` 는 코어가 **상대계정을 직접 써 넣습니다**: `erpnext/controllers/stock_controller.py` `get_gl_entries` 가 창고 leg 의 `against = expense_account`(target_warehouse 가 있으면 그 창고 계정) 로 만듭니다. Purchase Invoice 계열만 `against = self.supplier`(거래처명)입니다(`erpnext/accounts/doctype/purchase_invoice/purchase_invoice.py`).

엔진 `_exact_counter` 규칙:

| `against` | 상대계정 |
|---|---|
| 이 회사 계정 하나 | 그 계정 |
| 계정이 아닌 단일 토큰(거래처명) | `PARTY` — SETTLEMENT 집합의 원소로 취급(매입·매입환출) |
| 계정 여러 개(Journal Entry) · 빈 값 | 비례 배분으로 폴백 + `counter_fallback` 경고 |

이 규칙만으로 상품매매 fixture 의 `is 36` 이 `기초 0 + 유입 110,000 − 기말 37,300 − 타계정대체 3,000 = 69,700` 으로 원장(5110 68,000 + 감모 1,000 + 평가손실 700)과 **1원까지 일치**합니다. 플러그가 필요 없습니다. `COGS_DIRECT` 는 삭제했고 매핑표의 `5110`·`5120` 은 원래대로 `reconcile_only` 입니다.

### 4.4 블록 흐름 진단

정확한 상대계정이 생기자 "장부가 서식 블록 구조에 맞지 않는" 경우를 짚을 수 있게 됐습니다. `_check_block_flows` 가 error 등급 `block_flow_mismatch` 로 알립니다.

- 재고계정에서 그 블록이 아닌 원가계정으로 대체 (예: 재공품 1154 → 5120, 원재료 1155 → 5120)
- 제품·재공품 계정으로 직접 매입 (서식 제조원가 블록에는 매입 행이 없다)

이 경고가 나오면 회계가 아니라 **창고→계정 매핑이 업종과 어긋난** 것입니다(§8-3). 데모 회사가 정확히 이 상태입니다(§7.3).

## 5. 대사(reconciliation)

`reconcile(company, fiscal_year)` 가 9개 식을 평가합니다. 리포트가 스스로를 검증하는 장치이며, 2026-09-07 결함도 2026-09-08 결함도 **사람보다 먼저 잡아냈습니다.**

| 식 | 내용 |
|---|---|
| 매출원가 항등식 | `gl(5110)+gl(5120)+gl(5130)+gl(5140)+gl(5141)+gl(5150)+net(MFG_COST) == is.35` — 원장 대 산식의 독립 검산 |
| 제조원가명세서-손익계산서 연결 | `mfg.49 == is.44` (ref 라 구성상 항등 — 서식 작성방법 제3항) |
| 재고자산 재무상태표 대사 | `bs.44 == closing_balance(INV_ALL)` |
| 결산대체 완료 | `gl(5422)=gl(5423)=gl(5452)=0` (단일 손익계정, KB-KOR-002 §9-3) |
| 대차평균 | `bs.228 == bs.383` |
| 완전성 4종 | 자산·부채·자본 총계와 당기순손익이 GL 과 일치 |

`완전성 — 자본총계` 의 우변은 **GL 손익**(`Equity + (Income − Expense)`, 결산 후엔 `Equity`)입니다. 이전에는 좌변과 같은 `is.219` 를 넣어 항상 상쇄되는 공허한 검산이었습니다(§9).

허용오차는 절대 1원(`RECON_ABS_TOL`)입니다. 매핑표가 제안한 0.5% 상대오차는 10억 재무상태표에서 500만원을 통과시켜 검산이 무의미해지므로 좁혔습니다.

결산 전(가결산)에는 `is.219` 가 `bs.382` 에 임시 가산되므로 손익 결함이 대차평균·자본총계까지 번집니다. 결산분개(PCV) 후에는 매출원가 항등식·당기순손익 완전성 두 식만 반응합니다.

## 6. 사용법

Report 3종은 Script Report 로 등록되며 `install.py` 의 `after_install`/`after_migrate` 가 멱등하게 보장합니다. `bench migrate` 를 쓸 수 없는 개발 환경에서는 직접 호출합니다.

```bash
bench --site <site> execute setive_erpnext_kr.korea.common.nts_report.install_reports
```

필터는 회사·회계연도이며, 데스크에서 리포트 이름으로 엽니다(`NTS Standard Balance Sheet` 등).

미매핑 원장은 `ROOT_FALLBACK` 으로 루트별 '기타' 행에 라우팅하고 **error 등급 경고**를 남깁니다(유동/비유동을 뒤집을 수 있으므로). 점검은 `nts_codes.report_unmapped(company)`.

## 7. 검증

### 7.1 fixture 회사

데모 회사(`세티브 (Demo)`)는 **검증에 쓸 수 없습니다**(§7.3). 대신 회계적으로 유효한 흐름을 가진 회사 두 개를 스크립트로 만듭니다.

| 회사 | 흐름 |
|---|---|
| `세티브 (Fixture-MFG)` | 원재료 매입 100,000 · 환출 10,000 · 매입(update_stock) 20,000 → 임금 6,000 → Stock Entry 이동 40,000 → 제조(제품 20개 = 재료 40,000 + 노무비 배부 5,000) → DN 15개 + SI · SI(update_stock) 2개 → 반품 1개 → 견본 1개(5328) → 감모 1개(Stock Reconciliation, 5140) → 평가손실 500(5141) |
| `세티브 (Fixture-TRD)` | 창고 4개 → 1151, 기본계정 5110/4121 로 바꾼 뒤 상품 매입 100,000 · 환출 10,000 · 매입 20,000 → DN 30 + SI · SI(update_stock) 40 → 반품 2 → 견본 3 → 감모 1 → 평가손실 700 |

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
APP=../setive_erpnext_kr
PY=/home/frappe/frappe-bench/env/bin/python
EXEC="docker compose -f $COMPOSE exec -T backend"

docker compose -f $COMPOSE cp $APP/scripts/nts/fixture_company.py backend:/tmp/fixture_company.py
for KEY in mfg trd; do
  docker compose -f $COMPOSE exec -T -w /home/frappe/frappe-bench/sites backend $PY /tmp/fixture_company.py $SITE setup $KEY
done

# 대사 — 9식 전부 pass 여야 한다
for CO in "세티브 (Fixture-MFG)" "세티브 (Fixture-TRD)"; do
  $EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_report.reconcile \
    --kwargs "{'company':'$CO','fiscal_year':'2026'}"
done

# 정리 — 잔여 0 이어야 한다
for KEY in mfg trd; do
  docker compose -f $COMPOSE exec -T -w /home/frappe/frappe-bench/sites backend $PY /tmp/fixture_company.py $SITE teardown $KEY
done

# 매핑을 바꾼 뒤에는 계정에 다시 밀어넣는다
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.apply \
  --kwargs "{'company':'<회사명>','force':True}"
```

### 7.2 2026-09-08 실측

| | Fixture-MFG | Fixture-TRD |
|---|---|---|
| 원장 매출원가 (5110/5120 + 5140 + 5141 + 5150 + 미흡수 MFG_COST) | 36,000 + 2,250 + 500 + 0 + 1,000 = **39,750** | 68,000 + 1,000 + 700 = **69,700** |
| 서식 산식 총계 (is.35) | **39,750** | **69,700** |
| 내역 | 43 0 + 44 46,000 − 46 4,000 − 47 2,250 | 37 0 + 38 110,000 − 40 37,300 − 41 3,000 |
| mfg.49 당기제품제조원가 | 46,000 (재료비 40,000 + 노무비 6,000) | 0 |
| 대사 | **9/9, 차이 0** | **9/9, 차이 0** |

같은 fixture 를 2026-09-07 엔진으로 돌리면 둘 다 6/9 입니다 — 매출원가 항등식·대차평균·당기순손익 완전성 실패, MFG 차이 3,750 · TRD 차이 1,700(감모+평가손실+미흡수분 = `COGS_DIRECT` 가 떨어뜨린 금액). TRD 는 `is 38` 이 80,000 으로 30,000 과소(비례 배분).

### 7.3 데모 회사의 상태

`세티브 (Demo)` 는 새 엔진에서 **5/9** 입니다. 이것은 결함이 아니라 정직한 보고입니다. 데모는 ERPNext demo 생성기가 만든 것으로, 받은 적 없는 창고에서 출고해 제품(1152) 잔액이 −39,760 이고, 매입이 재공품·제품·원재료·미착품에 무작위로 들어가며, 생산 전표가 0건입니다. 재공품·원재료에서 5120 으로 직접 나간 160,800 과 제품 계정으로의 직접 매입 53,200 은 서식 어느 블록으로도 표현되지 않습니다. `block_flow_mismatch` 경고 4건이 정확히 그 금액을 짚습니다.

2026-09-07 에 데모가 9/9 였던 것은 총계를 원장으로 강제한 상태에서 5140·5141·5150·미흡수 제조원가가 **모두 0** 이었기 때문입니다 — 거짓 양성이었습니다.

## 8. 알려진 한계·후속 과제

1. **원재료의 타계정대체** — 법인세 제조원가명세서 재료비에는 타계정대체 행이 없습니다(소득세 서식에는 있음). 원재료를 견본비·건설중인자산 등으로 대체하면 현행 산식은 재료비(mfg 1)를 그만큼 과대계상하고 `매출원가 항등식` 이 실패합니다. `mfg 3` 에서 차감할지 `mfg 48` 에 합산할지는 세무 판단이며 매핑표에 명문화해야 합니다. fixture 는 이 경로를 일부러 쓰지 않았습니다(제품에서만 견본 대체).
2. **미검증 표준코드 33건** — 매핑표 `meta.unverified_codes`. 서식 원본으로 대조하지 못한 배정이며 세무 검토가 필요합니다(KB-KOR-002 §9).
3. **창고→계정 매핑이 제조업 전제** — 상품매매 테넌트는 §4.4 경고를 받습니다. **2026-09-08 결정: 초기 타깃이 제조업이므로 자동 분기는 보류**하고 근거만 남깁니다.
   - 창고만 바꿔서는 부족합니다. `Warehouse.account`(→1151) · `Company.default_inventory_account`(→1151) · `default_expense_account`(5120→5110) · `default_income_account`(4111→4121) · `default_discount_account`(4191→4192) 가 한 세트입니다. fixture 스크립트 `configure_trading` 이 그 레시피입니다.
   - ERPNext v16.33 에는 `Company.enable_item_wise_inventory_account` 가 있습니다 — 창고 대신 품목별(Item Default → Item Group → Brand)로 재고계정을 잡는 코어 스위치라 겸업 테넌트에 자연스럽습니다. 단 SLE 가 생긴 뒤에는 전환이 막혀 **회사 생성 시점에 결정**해야 하고, 계정 미지정 품목마다 throw 합니다.
   - 분기 신호가 없습니다. 위저드 KSIC 대분류는 Company 에 저장되지 않아(KB-KOR-001 §7) Company Custom Field 를 새로 심어야 합니다.
   - 기존 회사에는 `warehouses.apply` 가 소급되지 않습니다(빈 값만 채움). 전환용 `force` 경로가 필요합니다.
4. **서식 개정 대응** — 매핑표 `meta.{bs,is,mfg}_revised` 와 Company Custom Field `setive_nts_map_revision` 이 개정일을 들고 있고, 불일치 시 `stale` 로 보고합니다. 개정 시 `scripts/coa/nts_codes.json` 을 새 서식으로 다시 추출해야 합니다.
5. **공사·분양·운송·임대·기타 원가 블록** — `is.35` 의 자식 48·53·54·55·60·61 은 매출원가 항등식 좌변에 없습니다. 해당 계정을 쓰는 테넌트는 항등식이 구조적으로 실패하며 부속명세서 5종도 아직 없습니다.
6. **감모손실의 정상·비정상 구분** — 계정과목표는 5140 하나입니다. 비정상감모(영업외비용)를 쓰려면 계정을 나누고 매핑을 정해야 합니다.
7. **Journal Entry 로 재고계정을 직접 기표하면** `against` 가 계정 나열이라 비례 배분으로 폴백합니다. `counter_fallback` 경고로 드러납니다.
8. **인쇄·엑셀 서식** — 국세청 제출 서식 그대로의 출력물은 만들지 않았습니다.

## 9. 이전 서술 정정

- **§4 (2026-09-07 판) "장부가 진실이므로 총계 행은 원장 잔액을 씁니다"** — 이 결정과 `COGS_DIRECT` 를 철회합니다. 총계를 원장으로 덮자 하위 산식으로만 손익에 닿던 5140·5141·5150 잔여·미흡수 제조원가가 손익계산서에서 빠졌습니다. 감모손실이 있는 회사는 매출원가 과소·당기순손익 과대로 신고서가 나왔을 것입니다. 제조·상품매매 fixture 모두 6/9 로 재현됩니다(§7.2). "알려진 한계" 는 "내역 합이 안 맞을 수 있다" 까지만 적어 결함 범위를 축소 서술했습니다.
- **§4 "창고 간 이동이 매입·처분으로 오인돼 두 값이 어긋납니다"** — 원인 귀속이 틀렸습니다. 어긋남의 지배적 원인은 상대계정 비례 배분(§4.2)이었고, 창고 매핑 문제는 블록 오분류(§4.4)를 낳을 뿐 총계 격차의 원인이 아닙니다. 검증자의 T계정 반증과 fixture 실측으로 확인했습니다.
- **§7 "2026-09-07 실측 … 대사식 9/9 pass"** — 거짓 양성이었습니다(§7.3). 데모 회사는 회계적으로 무효한 데이터라 검증 기준에서 제외하고 fixture 로 대체합니다.
- **§8-1 "역산 플러그 도입 여부는 사용자 결정"** — 플러그는 채택하지 않습니다. 플러그는 대사 9식 중 하나도 개선하지 못하고(총계가 원장인 한 §9 첫 항목의 결함이 남음), `is 44` 는 서식 작성방법 제3항 때문에 플러그로 쓸 수 없으며, `is 47` 플러그는 데모에서 −213,832 를 인쇄합니다. 측정을 고치면 플러그 없이 맞습니다(§4.3).
- **§5 `완전성 — 자본총계`** — 좌우변이 같은 `is.219` 를 써서 항상 통과하는 공허한 검산이었습니다. 우변을 GL 손익으로 바꿨습니다.
- **엔진 대사 note "reconcile_only 계정은 제외한다"** — 코드는 전 원장을 합산합니다(그래야 R7 이 맞습니다). note 를 코드에 맞췄습니다.
- KB-KOR-002 §7 은 매핑표를 "소비자가 아직 없다" 고 적었습니다. 이 리포트가 소비자입니다.
