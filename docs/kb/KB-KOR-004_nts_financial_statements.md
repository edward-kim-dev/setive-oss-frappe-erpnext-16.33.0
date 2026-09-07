---
id: KB-KOR-004
title: 국세청 표준재무제표 리포트 (표준재무상태표·표준손익계산서·제조원가명세서)
domain: 한국화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@16.31.0
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-07
verified_by: 개발 컨테이너 E2E — 데모 거래(GL 42건)로 리포트 3종 실행 후 GL 대조, 대사식 9/9 통과
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
| `movement` | 기간 발생액. 전표 단위로 상대계정을 구해 `except_counter` 집합이면 제외(타계정대체 배제) |
| `formula` | 같은 서식 행 코드와 `direct`(그 행에 직접 배정된 계정 잔액) 의 사칙연산 |
| `ref` | 다른 서식 행 참조 (is 44 → mfg 49) |
| `children` | 자식 행 합계 |
| `constant` | 대응 계정이 없는 행 |

행 속성 `contra`(괄호 항목)는 상위 합계에 음수로 들어갑니다. `level:"parent"` 는 하위 내역 행을 쓰지 않고 **총계 행에 원장을 직접 배정**한다는 뜻입니다.

`role` 은 배정에서 제외합니다 — `reconcile_only`(대사에만 사용), `not_applicable`.

## 4. 영구재고 보정 — 매출원가는 원장에서 가져온다

**사용자 결정 (2026-09-07).** 이번 검증에서 나온 유일한 실질 결함이고, 재무제표가 대차평균을 잃는 문제였습니다.

ERPNext 는 **영구재고**라 판매 시점에 실제 매출원가를 원장(`5110` 상품매출원가 · `5120` 제품매출원가)에 계상합니다. 반면 서식의 매출원가는 **실지재고 방식**(기초 + 매입 − 기말 − 타계정대체)입니다. 창고 간 이동이 매입·처분으로 오인돼 두 값이 어긋납니다.

실측(데모 회사):

| | 값 |
|---|---|
| 서식 산식 | 39,928 |
| 원장 `5120` | **253,760** |
| 결과 | 당기순손익 323,072 (정답 109,240), 부채와자본총계 507,365 ≠ 자산총계 293,533 |

**장부가 진실**이므로 총계 행은 원장 잔액을 씁니다.

- 매핑표: `5110 → is 36`, `5120 → is 42` 를 `level:"parent"` 로 직접 배정 (`5130 → is 61` 이 이미 쓰던 패턴)
- 엔진: `COGS_DIRECT` 상수가 그 행의 computed 산식을 `{"op":"formula","expr":"direct"}` 로 덮음 — 산식이 이기지 않게

`MOVEMENT_PATCH` · `BS_TOTAL_SPEC` 과 같은 **매핑표를 고치지 않는 엔진 보정** 방식입니다.

### 알려진 한계

하위 내역 행(37~41 · 43~47)은 실지재고 산식으로 계속 산출되므로 **총계와 합이 맞지 않을 수 있습니다.** 차이는 대사식 `매출원가 항등식` 이 보고합니다. 신고서 제출 전에 내역까지 맞춰야 하면 당기매입원가(38)·당기총원가(44)를 역산 플러그로 두는 방식이 있습니다 — **후속 과제이며 사용자 결정이 필요합니다.**

## 5. 대사(reconciliation)

`reconcile(company, fiscal_year)` 가 9개 식을 평가합니다. 리포트가 스스로를 검증하는 장치이며, 이번 결함을 **사람보다 먼저 잡아냈습니다**.

| 식 | 내용 |
|---|---|
| 매출원가 항등식 | 원장 COGS 합 = 서식 매출원가 |
| 제조원가명세서-손익계산서 연결 | `mfg.49 == is.44` |
| 재고자산 재무상태표 대사 | `bs.44 == closing_balance(INV_ALL)` |
| 결산대체 완료 | `gl(5422)=gl(5423)=gl(5452)=0` (단일 손익계정, KB-KOR-002 §9-3) |
| 대차평균 | `bs.228 == bs.383` |
| 완전성 4종 | 자산·부채·자본 총계와 당기순손익이 GL 과 일치 |

허용오차는 절대 1원(`RECON_ABS_TOL`)입니다. 매핑표가 제안한 0.5% 상대오차는 10억 재무상태표에서 500만원을 통과시켜 검산이 무의미해지므로 좁혔습니다.

## 6. 사용법

Report 3종은 Script Report 로 등록되며 `install.py` 의 `after_install`/`after_migrate` 가 멱등하게 보장합니다. `bench migrate` 를 쓸 수 없는 개발 환경에서는 직접 호출합니다.

```bash
bench --site <site> execute setive_erpnext_kr.korea.common.nts_report.install_reports
```

필터는 회사·회계연도이며, 데스크에서 리포트 이름으로 엽니다(`NTS Standard Balance Sheet` 등).

미매핑 원장은 `ROOT_FALLBACK` 으로 루트별 '기타' 행에 라우팅하고 **error 등급 경고**를 남깁니다(유동/비유동을 뒤집을 수 있으므로). 점검은 `nts_codes.report_unmapped(company)`.

## 7. 검증

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"

# 리포트 등록 확인 — 3건이어야 한다
$EXEC bench --site $SITE execute frappe.client.get_list \
  --kwargs "{'doctype':'Report','filters':{'name':['like','NTS%']},'fields':['name','report_type']}"

# 대사 — 9식 전부 pass 여야 한다
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_report.reconcile \
  --kwargs "{'company':'<회사명>','fiscal_year':'<연도>'}"

# 매핑을 바꾼 뒤에는 계정에 다시 밀어넣는다
$EXEC bench --site $SITE execute setive_erpnext_kr.korea.common.nts_codes.apply \
  --kwargs "{'company':'<회사명>','force':True}"
```

**2026-09-07 실측** (데모 회사, GL 42건 · 매출 5건 · 매입 6건, 재고품목 거래):

| 검증 | 결과 |
|---|---|
| 행 수 | bs 287 / is 199 / mfg 45 — 서식 스펙과 일치 |
| 매출액 | 363,000 = GL `4111` |
| 매출원가 | 253,760 = GL `5120` |
| 당기순손익 | 109,240 = GL(수익−비용) |
| 대차평균 | 자산총계 293,533 = 부채와자본총계 293,533 |
| 대사식 | **9/9 pass** |

## 8. 알려진 한계·후속 과제

1. **매출원가 내역 행이 총계와 합이 안 맞을 수 있음** — §4 참조. 역산 플러그 도입 여부는 사용자 결정.
2. **미검증 표준코드 33건** — 매핑표 `meta.unverified_codes`. 서식 원본으로 대조하지 못한 배정이며 세무 검토가 필요합니다(KB-KOR-002 §9).
3. **서식 개정 대응** — 매핑표 `meta.{bs,is,mfg}_revised` 와 Company Custom Field `setive_nts_map_revision` 이 개정일을 들고 있고, 불일치 시 `stale` 로 보고합니다. 개정 시 `scripts/coa/nts_codes.json` 을 새 서식으로 다시 추출해야 합니다.
4. **창고→계정 매핑이 제조업 전제** — 상품매매 테넌트는 창고가 원재료/재공품/제품으로 흩어져 실지재고 산식이 성립하지 않습니다(§4 의 원인). 업종별 창고 매핑 분기는 후속 과제입니다.
5. **인쇄·엑셀 서식** — 국세청 제출 서식 그대로의 출력물은 만들지 않았습니다. 현재는 데스크 리포트와 표준 내보내기만 지원합니다.

## 9. 이전 서술 정정

- KB-KOR-002 §7 은 매핑표를 "소비자가 아직 없다" 고 적었습니다. 이 리포트가 소비자입니다.
