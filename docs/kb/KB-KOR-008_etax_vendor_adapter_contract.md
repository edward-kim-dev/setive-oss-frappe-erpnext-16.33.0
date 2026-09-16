---
id: KB-KOR-008
title: 전자세금계산서 어댑터 계약 — 모듈 경로·DocType·포트·상태축·관리번호 단일화
domain: 한국화
status: draft
applies_to:
  - erpnext@16.33.0
  - setive_erpnext_kr@0.0.1
  - popbill(python SDK)@1.64.2
verified_on: 2026-09-16
verified_by: 포크·앱 전수 grep 으로 기존 e-tax 설계 산출물 실측(0건 확인) + KB-KOR-005/006/007·KB-OPS-002/003·ONT-ENT-002 전문 대조 + frappe 16.31.0 소스를 컨테이너 이미지에서 추출해 Report/Custom Field 경로 정적 대조(실행 없음) + MariaDB 10.6.28 에서 체크섬 SQL 실행 대조 + 아키텍트·세무실무·frappe구현 3관점 비평(2026-09-16)
related: [KB-KOR-006, KB-KOR-005, KB-OPS-002, KB-OPS-003, ONT-ENT-002]
---

# KB-KOR-008: 전자세금계산서 어댑터 계약

> **상태**: 계약 고정 문서. 이 문서가 확정하기 전에는 `korea/common/etax/` 에 코드 파일을 만들지 않는다.
> §3(포트)의 벤더 대칭성 주장은 **§11-1 의 볼타 스파이크 1건으로 확증되기 전까지 잠정**이다.
> 실행계획은 KB-KOR-009, 전환 런북은 KB-OPS-004 로 **번호만 예약**했다 — 본문은 이 세션 범위 밖이다.

---

## 1. 요약

전자세금계산서 설계가 KB-KOR-006 · KB-OPS-002 · KB-OPS-003 · KB-KOR-007 · ONT-ENT-002 다섯 문서에 흩어져 있고, **어느 문서도 DocType 이름 하나, 포트 파일 경로 하나를 확정하지 않았다.** 이 문서가 그 1벌을 고정한다.

```
korea/common/etax/          ← 벤더 무관 계약층. 여기에 벤더 이름이 한 글자도 없다
  contract.py   포트(Protocol) + Capability + 오류 모델
  state.py      DocumentState × NtsState 2축
  mgtkey.py     document_key · attempt_token
  dto.py        입출력 자료형
  service.py    오케스트레이션. provider 문자열 비교 0건
  adapters/     popbill.py · bolta.py — 벤더 용어는 이 아래에만 존재한다
```

| 축 | 결정 | 절 |
|---|---|---|
| 모듈 경로 | `korea/common/etax/` 1개. `einvoice/` 폐기 | §2 |
| DocType | 4벌 + 인접 1벌. 물리경로 `setive_erpnext_kr/setive_erpnext_kr/doctype/<slug>/` | §3 |
| 포트 | `etax/contract.py` 의 `Protocol`. 본체 8연산 + Capability 2개 | §4 |
| 상태 | `DocumentState` × `NtsState` 2축. `NOT_OBSERVABLE` 포함 | §5 |
| 관리번호 | `document_key`(문서 주소) + `attempt_token`(요청 식별) 분리 | §6 |
| 계정 정체성 | `(provider, environment, company)` 복합 | §7 |
| 신원 원천 | Company/Customer/Supplier Custom Field. 계정에는 스냅샷만 | §8 |
| Custom Field 관리 | **코드(`create_custom_fields`) 단일화**. CLAUDE.md 0단계 개정 필요 — 제안만 | §9 |
| 자격증명 교체 | 세대(generation) 모델. 교차 시도 금지 | §10 |

### 1.1 "네 벌 충돌" 의 실측 결과 — 충돌이 아니라 공백이었다

착수 전제는 "발행 이력 DocType 3벌 · 포트 정의 파일 4벌 · 모듈 경로 2벌 · 관리번호 규칙 3벌" 이었다. 두 저장소 전체(문서·코드·미추적 파일·stash) 를 훑은 결과는 다르다.

| 전제 | 실측 | 증명 |
|---|---|---|
| 발행 이력 DocType 3벌 | 고유명 **0개**. 무명 언급 1회 | `grep -rniF 'Korea Tax Invoice'` → 0. [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):250 이 이름 없이 `autoname` 규칙만 규정 |
| 포트 정의 파일 4벌 | e-tax 어댑터 경로 **0개** | `grep -oE '\`[A-Za-z0-9_/.]+\.py\`' KB-KOR-006` → 코어 파일 2건뿐 |
| 모듈 경로 2벌 | `etax/`·`einvoice/` **양쪽 다 부재** | `grep -rn 'etax/\|einvoice/'` → 0 |
| 관리번호 규칙 3벌 | 생성 규칙(형식·길이·문자집합) **부재** | `grep -rn 'mgt_key'` → 1건([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):250) |

**결론은 바뀌지 않는다 — 오히려 더 급하다.** 서로 다른 네 벌을 하나로 줄이는 일이 아니라, 0벌 위에 1벌을 처음 놓는 일이다. 다만 **문서 간 실제 모순은 14건 있었고** 그중 계약에 직결되는 5건을 §12 에 정정 항목으로 남긴다.

---

## 2. 모듈 경로 — `korea/common/etax/` 하나

`setive_erpnext_kr/korea/common/etax/`. `einvoice/` 는 **폐기하고 만들지 않는다.**

근거:
- [`CLAUDE.md`](../../CLAUDE.md) 라우팅 2단계 — "세금계산서·원천징수·4대보험·한국 리포트·번역. hooks 로 도달 가능하면 전부 여기다"(`korea/common/`).
- `einvoice` 라는 이름은 코어 함수 `validate_einvoice_fields`([`erpnext/controllers/accounts_controller.py`](../../erpnext/controllers/accounts_controller.py):4440)와 충돌한다. 앱 모듈과 코어 이탈리아 훅이 같은 단어를 쓰면 다음 에이전트가 어느 쪽을 고치는지 혼동한다.
- 한국 법정 용어는 "전자세금계산서"이고 벤더 API 도 `taxinvoice`(팝빌 상품코드 110, [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):190) 를 쓴다. `etax` 가 그 축약으로 일관된다.

**로직과 스키마는 경로가 갈린다.** 이것은 선택이 아니라 frappe 강제다.

| 종류 | 경로 | 근거 |
|---|---|---|
| 로직 | `setive_erpnext_kr/korea/common/etax/` | CLAUDE.md 2단계 |
| DocType JSON | `setive_erpnext_kr/setive_erpnext_kr/doctype/<slug>/` | 모듈 폴더 강제. `modules.txt` 가 `SETIVE ERPNext KR` 하나뿐이므로 `frappe.scrub` → `setive_erpnext_kr` |
| Report | `setive_erpnext_kr/setive_erpnext_kr/report/<slug>/` | 위와 동일. 실재 선례 3종 |

> ⚠ `erpnext/regional/korea/` 는 만들지 않는다. `frappe.scrub("Korea, Republic of")` 가 쉼표 때문에 import 불가능한 이름을 만들고 **프레임워크가 그 예외를 조용히 삼킨다**([`CLAUDE.md`](../../CLAUDE.md) 금지 사항). 단 `regional_overrides` 훅 자체는 국가명 **문자열 키** 조회라 한국에서 동작한다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md) §7.1) — 디렉터리 금지와 훅 사용 가부는 별개다.

---

## 3. DocType — 이름 4벌 고정

| DocType | slug | 성격 |
|---|---|---|
| `Korea Tax Invoice` | `korea_tax_invoice` | 발행 이력. **append-only** |
| `Korea Etax Webhook Event` | `korea_etax_webhook_event` | 웹훅 원본 수신 로그. append-only |
| `Korea Integration Settings` | `korea_integration_settings` | `issingle=1`. 테넌트 2층 설정 ([KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md) §5) |
| `Korea Integration Account` | `korea_integration_account` | 3층 자격증명 ([KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md) §6) |

인접 DocType(계약 본체 아님, 세무 마스터 계층 소관):

| DocType | slug | 성격 |
|---|---|---|
| `Korea Party Tax Status` | `korea_party_tax_status` | 거래처 사업자 상태 관측 **append-only 로그**. [KB-KOR-005](./KB-KOR-005_localization_roadmap.md) M2/M4 |

모든 JSON 의 `"module"` 은 반드시 `SETIVE ERPNext KR` 이다 — `modules.txt` 의 실제 값이며 다르면 `reload_doc` 이 경로를 만들지 못한다([`korea/common/nts_codes.py`](../../../setive_erpnext_kr/setive_erpnext_kr/korea/common/nts_codes.py):26-27). 각 폴더에 빈 `__init__.py` 가 필요하다(Report 3종 전부 갖고 있다).

### 3.1 DocType 등재 경로가 없다 — `_ensure_doctypes()` 를 만든다

[`install.py`](../../../setive_erpnext_kr/setive_erpnext_kr/install.py) 는 Custom Field 와 Report 만 보장하고 **DocType 등재 경로가 없다.** 이 스택은 `bench migrate` 를 돌릴 수 없으므로([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):221) 파일만 있고 테이블이 없는 상태가 정상이 되어 버린다.

Report 가 쓰는 것과 같은 트릭을 쓴다 — `reload_doc` 은 migrate 와 **같은 코드 경로**(`import_file_by_path`)를 탄다.

```python
def _ensure_doctypes():
    for slug in DOCTYPE_SLUGS:
        frappe.reload_doc(nts_codes.MODULE, "doctype", slug, force=False)
```

`_ensure_custom_fields()` **보다 먼저** 부른다.

### 3.2 `Korea Tax Invoice` 는 append-only 다

행을 덮어쓰지 않는다. 근거 4가지:

1. **가산세 판정이 시각 기반이다.** 미발급 2% / 지연발급 1% / 지연전송 0.3% / 미전송 0.5%([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):236-239). 행을 덮으면 지연 판정의 근거가 소멸한다. 귀책은 전적으로 공급자이고([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):264) SETIVE 가 회수 경로의 종착지다(:271) — 시각 이력이 곧 방어 자료다.
2. **수정발행은 당초승인번호 연결이 필수다**([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):230). 당초 행을 덮으면 링크 대상이 사라진다.
3. **벤더에서 지워져도 국세청에는 남는다**([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):221). ERP 이력은 벤더의 사본이 아니라 SETIVE 의 독립 장부다.
4. **일일 대사가 필수다**([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):241). 대사는 과거 상태의 시계열을 요구한다.

시도 단위 로그는 문서 단위와 분리한다.

```
Korea Tax Invoice        문서 1장 = 벤더 문서 주소 1개
  account (Link) · tenant_scope_hash · document_key · document_key_live · vendor_document_ref
  document_kind (세금계산서 | 계산서) · issue_direction (정발행 | 역발행)
  amendment_reason_code (01~06) · original_invoice (Link self)
  supply_date · written_date · issued_at · sent_at          ← 가산세 기산일 4종
  nts_approval_no · document_state · nts_state
  voided (Check) · void_reason · superseded_by (Link self)
  source_vouchers (child table)                             ← 월합계 N:1 · 수정발행 1:N

Korea Etax Attempt       시도 1회. append-only  ← §3 의 고정 4벌이 **아니다**. 아래 주 참조
  tax_invoice (Link) · attempt_token · requested_at
  http_status · vendor_code · error_category · state_after
```

> ⚠ **`Korea Etax Attempt` 는 이 계약이 고정하는 4벌에 들어가지 않는다.** 이 문서의 임무는 §3 의
> 네 이름을 확정하는 것이고 다섯 번째를 끼우면 계약의 경계가 흐려진다. 시도 로그는 **구현 세부**이므로
> 이름·slug·필드는 KB-KOR-009 에서 확정한다. 여기서 확정하는 것은 제약 하나뿐이다 —
> **시도 단위와 문서 단위를 같은 행에 담지 않는다.** 재시도가 문서 상태를 덮어쓰면 §3.2 가
> append-only 로 지키려던 시각 이력이 그 자리에서 소멸한다. 그래서 §13 의 기계 검사 #5 도 4벌만 센다.

`source_vouchers` 자식 테이블이 있어야 **월합계(N:1)** 와 **수정발행 2장(1:N)** 을 둘 다 표현할 수 있다. 원천전표 1건 ↔ 문서 1장 가정은 출시 첫날 깨진다 — 월합계를 빼면 "실무 투입이 불가능하다"([KB-KOR-005](./KB-KOR-005_localization_roadmap.md):86), 수정사유 01·02·05 는 **2장**을 발급한다([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):221-228).

---

## 4. 포트 — `etax/contract.py`

### 4.1 선별 기준

본체에 두는 조건은 **셋 다** 만족할 때다.

1. 두 벤더 모두에 존재한다.
2. 세법이 요구하는 업무 사건을 표현하거나 **그 사건의 사전조건**이다.
3. 상태 전이가 동형이다 — 만료 초·필드 수 같은 **값의 차이**는 DTO 로 흡수된다.

3번이 없으면 "이름만 같은 연산"이 본체에 들어온다. 누출은 메서드 **이름**이 아니라 **인자와 예외**에서 일어나므로, 본체 연산은 시그니처와 DTO 필드까지 이 문서가 고정한다.

### 4.2 본체 8연산

```python
class EtaxPort(Protocol):
    provider_label: ClassVar[str]
    capabilities: ClassVar[frozenset[Cap]]

    def enroll_tenant(self, req: EnrollRequest) -> TenantHandle: ...
    def cert_enrollment_url(self, handle: TenantHandle) -> CertEnrollment: ...
    def cert_status(self, handle: TenantHandle) -> CertStatus: ...
    def issue(self, req: IssueRequest) -> IssueResult: ...
    def issue_amendment(self, req: AmendmentRequest) -> IssueResult: ...
    def cancel_issue(self, ref: DocumentRef) -> IssueResult: ...
    def resolve_unknown(self, ref: DocumentRef) -> IssueResult: ...
    def list_documents(self, q: DocumentQuery) -> Page[DocumentSummary]: ...
```

| 연산 | 팝빌 | 볼타 | 본체인 이유 |
|---|---|---|---|
| `enroll_tenant` | `joinMember`(11필드) | `POST /v1/issuers`(3필드) | 볼타는 `issuerId` 가 있어야 발행 자체가 불가능하다 — **선택 기능이 아니라 사전조건**. 차이는 필드 수와 반환값뿐이고 그건 DTO 다 |
| `cert_enrollment_url` | `GetTaxCertURL`(30초 만료) | `GET /v1/issuers/{id}/certificates/url`(5분 만료) | [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):454 — "이 부분만은 어느 벤더로 가도 같다". 전자서명은 법적 요건(:138). **만료 초만 다르고 상태 전이가 같다** |
| `cert_status` | `GetCertificateExpireDate` · `CheckCertValidation` | 등록내역 조회 | 위와 동일 |
| `issue` | 정발행 | 정발행 | 세법 필수 |
| `issue_amendment` | 수정세금계산서 | 수정 90원 | 세법 필수. 전송 후에는 유일한 회수 경로 |
| `cancel_issue` | 전송 전 발급취소(익영업일 15시, [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):206) | 삭제 | 이게 없으면 모든 회수가 수정발행으로 가 2장 × 국세청 영구 잔존 |
| `resolve_unknown` | `checkMgtKeyInUse` | 재전송 후 409 `IDEMPOTENCY_CONFLICT` | 워커 크래시로 `SENDING` 고착된 행의 **유일한 복구 수단**. 볼타는 "조회"가 아니라 "재시도의 부작용"으로 같은 일을 한다 |
| `list_documents` | `GetUseHistory` 계열 | 목록 API | 일일 대사가 필수인데(`KB-KOR-006`:241) 건당 조회는 수천 건 테넌트에서 성립하지 않는다 |

> ⚠ 연산 이름에 벤더 용어를 쓰지 않는다. `MgtKeyProbe` 가 아니라 `resolve_unknown` 이다. **Capability 이름에 벤더 용어가 들어가는 순간 중립성은 이미 실패했다.**

### 4.3 `parse_webhook` 은 본체에 둘 수 없다 — provider 레벨 디코더

팝빌 웹훅은 **전 테넌트 공용 파트너 통합 URL 1개**다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):29·64, [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):160). 즉 **수신 시점에 account 를 아직 모른다.** `account` 로 어댑터를 얻어 그 인스턴스의 `parse_webhook()` 을 부르는 형태는 닭-달걀이다.

```python
class WebhookDecoder(Protocol):          # provider 레벨. 인스턴스 아님
    def decode(self, headers, raw_body) -> list[WebhookEvent]: ...
    def ack(self) -> tuple[int, str]: ...       # 벤더별 ACK 규격
```

라우팅은 `WebhookEvent.tenant_ref` → `Korea Integration Account` 역조회로 **디코딩 후에** 한다.

> ⚠ ACK 본문을 비우면 팝빌이 **5분 간격 4회 재전송**한다([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):170). 즉 중복 이벤트가 **정상 동작**이다. `Korea Etax Webhook Event` 에 `(provider, vendor_event_id)` unique 를 반드시 걸고, 상태 반영은 **단조 전이만** 허용한다(`SENDING → ISSUED` 가능, `ISSUED → SENDING` 금지).

### 4.4 Capability — 선언형 집합, 판정은 한 곳

`typing.Protocol` 의 `runtime_checkable` 은 **메서드 이름의 존재만** 검사한다. 어댑터가 `NotImplementedError` 스텁을 갖고만 있어도 `True` 다 — 거짓 양성이 구조적으로 보장된다. `hasattr` 도 같은 이유로 안 된다.

```python
class Cap(StrEnum):
    HOMETAX_COLLECT = "hometax_collect"              # 팝빌만 (KB-KOR-006:66)
    PARTNER_AGGREGATED_BILLING = "partner_billing"   # 팝빌만 (KB-KOR-006:115-118)
```

```python
# service.py — 유일한 판정 지점
def require(port: EtaxPort, cap: Cap) -> None:
    if cap not in port.capabilities:
        frappe.throw(_("{0} 공급자는 {1} 기능을 지원하지 않습니다.")
                     .format(port.provider_label, CAP_LABEL_KO[cap]))
```

Capability 가 2개뿐인 것이 맞다. 초안은 5개였는데 `TenantEnrollment`·`CertificateEnrollment`·`MgtKeyProbe` 는 **두 벤더 다 갖고 있었고**, `PartnerBilling` 은 잔액 고갈 방어(공통)와 합산 과금(팝빌 고유)이 뭉쳐 있었다. 볼타도 개발자센터에서 포인트를 충전한다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):368). 잔액 고갈은 전 테넌트 동시 중단 SPOF 이므로(:208) **본체의 오류 카테고리**로 간다.

규칙 — 정직하게 쓴다. `provider` 문자열 비교는 0건으로 만들 수 있지만 **Capability 분기 자체는 없앨 수 없다.**

1. `provider` 문자열 비교 **0건** (§13 의 grep 으로 강제).
2. Capability 분기는 `service.py` **한 파일 안에서만**. `korea/common/` 의 다른 파일은 `Cap` 을 import 하지 않는다.
3. UI·리포트는 provider 가 아니라 capability 로 게이트한다.
4. 적합성 시험(conformance suite)이 선언된 모든 Cap 에 대해 실제 호출이 `NotImplementedError` 를 내지 않음을 검증한다. **이게 없으면 Protocol 은 장식이다.**

### 4.5 오류 모델

```python
@dataclass(frozen=True)
class EtaxError(Exception):
    category: ErrorCategory
    vendor_code: str
    retryable: bool
    message_ko: str

class ErrorCategory(StrEnum):
    AUTH = "auth"; IDEMPOTENCY_CONFLICT = "idempotency_conflict"
    VALIDATION = "validation"; CERT_INVALID = "cert_invalid"
    BALANCE_EXHAUSTED = "balance_exhausted"; RATE_LIMIT = "rate_limit"
    VENDOR_DOWN = "vendor_down"; UNKNOWN = "unknown"
```

오류 모델이 없으면 `service.py` 로 벤더 예외가 역류한다. 세 벤더가 서로 다른 방식으로 알린다 — 팝빌 `PopbillException`(음수 8자리) · 볼타 HTTP + `cause.code` · **바로빌은 음수 5자리 반환값(예외가 아니다)**([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):67). 세 번째가 결정적이다: "예외로 알린다"는 전제 자체가 깨지므로 어댑터가 반환값을 `EtaxError` 로 승격해야 한다.

`BALANCE_EXHAUSTED` 를 빠뜨리지 않는다 — 파트너 잔액 0 = 전 테넌트 발행 동시 중단이 이 카테고리로만 표현된다.

---

## 5. 상태 — 2축

단일 `status` 로 접지 않는다. 가산세가 **발급**(미발급 2% · 지연발급 1%)과 **국세청 전송**(지연전송 0.3% · 미전송 0.5%)을 따로 벌하므로([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):236-239), "발행은 됐는데 전송이 반려된" 상태를 표현할 수 있어야 한다.

```python
class DocumentState(StrEnum):       # 발행 축
    DRAFT = "draft"
    QUEUED = "queued"
    SENDING = "sending"
    ISSUED = "issued"
    FAILED = "failed"
    VOIDED = "voided"           # 국세청 전송 전 삭제. 문서가 없었던 일이 됨
    SUPERSEDED = "superseded"   # 수정발행으로 상쇄. 원본은 유효하게 남는다

class NtsState(StrEnum):            # 국세청 전송 축
    NOT_OBSERVABLE = "not_observable"
    PENDING = "pending"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"       # 팝빌 상태코드 305
    FAILED = "failed"
```

- **`ISSUED × REJECTED`** 가 요구된 "발행됐으나 전송 반려" 다. [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):438 이 이 대응을 "벤더와 무관한 SETIVE 설계 결정이며 미정" 으로 남겨둔 공백을 여기서 메운다.
- **`NOT_OBSERVABLE`** 이 필요한 이유는 둘이다. ① 발행 전에는 국세청 상태가 존재하지 않는다. ② 벤더가 전송 상태를 별도로 노출하지 않을 수 있다 — 볼타의 전송 상태 노출 여부는 **근거 없음(미확인)** 이다. 관측 불가를 `PENDING` 으로 접으면 대사가 영원히 미완료로 남는다.
- **`CANCELLED` 을 쓰지 않고 `VOIDED`/`SUPERSEDED` 로 쪼갠 이유**: 국세청 승인 후에는 취소가 불가능하고 수정발행으로만 상쇄된다. 하나의 `CANCELLED` 로 찍으면 원본이 사라진 것처럼 보여 **합계표에 1장만 잡힌다** — [ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):230 이 경고한 붕괴가 그대로 실현된다.

### 5.1 전이 규칙 — `SENDING` 은 워커에서만 커밋된다

[KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md) §7.2 의 세 컨텍스트에서 **doc_event 훅 구간의 `frappe.db.commit()` 은 무시된다**(`_disable_transaction_control`). 동시에 :217 은 "발행 실패 시 제출 차단"을 `on_submit` 의 `frappe.throw` → `db.rollback(chain=True)` 로 설계했다. **이 둘은 동시에 만족할 수 없다.**

```
on_submit (컨텍스트 a — commit 불가):
    Korea Tax Invoice insert → QUEUED       # 제출 트랜잭션에 실린다
    enqueue(..., enqueue_after_commit=True)
    # 벤더 호출 없음. throw 는 사전검증 실패에만 쓴다

worker (컨텍스트 c — commit 정상):
    QUEUED → SENDING  + commit              # 유일한 SENDING 선커밋 지점
    port.issue(...)
    SENDING → ISSUED / FAILED + commit
```

**"발행 실패 시 제출 차단"을 포기한다.** 대가는 이미 [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):188 이 인증서에 대해 내린 판단과 같다 — *"전표는 제출시키고 발행만 '대기' 큐에 넣는다. 만료가 월말·분기말에 몰리면 마감 업무 전체가 멈춘다."* 같은 논리가 발행 실패 전반에 적용된다. 제출 차단은 마감일에 전 고객을 동시에 세운다.

동기 호출을 남기면 다음이 일어난다: 훅 안에서 팝빌 호출 성공 → 같은 요청의 다른 `on_submit` 훅이 throw → `rollback(chain=True)` → **Korea Tax Invoice 행 소멸, docstatus=0 복귀, 국세청에는 발급 완료.** [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):237 이 *"국세청엔 발급됐는데 DB 엔 흔적 없음"* 이라고 예고한 바로 그 상태다.

---

## 6. 관리번호 — `document_key` + `attempt_token`

| 항목 | 정의 | 벤더에 실리는가 |
|---|---|---|
| `document_key` | **문서 주소.** 한 세금계산서 문서에 1개. 재시도에 불변 | ✅ 팝빌 `MgtKey` · 볼타 `Bolta-Client-Reference-Id` |
| `attempt_token` | **요청 1회 식별.** 매 시도 신규 | ❌ 로그·추적 전용 |
| `vendor_document_ref` | 어댑터가 `document_key` 에서 파생해 싣고 되받아 저장 | (파생 결과) |

### 6.1 문자집합

팝빌(1~24자, 영문·숫자·`-`·`_`) ∩ 볼타(255자, `\S`) = **1~24자 `[A-Za-z0-9_-]`**.

> ⚠ 이 규격은 착수 지시로 주어진 값이며 **저장소 문서에는 기재가 없다**(`grep -n 'MgtKey'` → [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):247 한 줄, 길이·문자집합 없음). §11-1 스파이크에서 벤더 규격 원문으로 재확인한다.

> ⚠ 교집합은 **N=2 스냅샷**이다. 같은 벤더 비교표에 바로빌이 후보로 살아 있고 그 제약은 미조사다. 3번째 벤더가 더 좁은 규격을 요구하면 교집합이 **소급해서** 줄어드는데, 이미 발행된 문서의 키는 국세청 신고분이라 **바꿀 수 없다**([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):221). 그래서 §6.2 의 발생 규칙이 중요하다.

### 6.2 발생 규칙 — 원천전표 이름에서 파생하지 않는다

```
document_key ← Korea Tax Invoice 자신의 name  (KTI-2026-00001, 14자)
```

원천전표 이름(`ACC-SINV-2026-00001`)을 sanitize 해서 쓰면 **네 가지가 동시에 깨진다**.

| 시나리오 | 파생 방식의 실패 | KTI 방식 |
|---|---|---|
| 월합계 (N:1) | 전표 N건 → 키 1개를 만들 방법이 없다 | `source_vouchers` 가 N행 |
| 수정발행 2장 (1:N) | 전표 1건 → 키 1개. 두 번째 장을 insert 할 수 없다 | KTI 2행 + `original_invoice` 링크 |
| Company rename · naming series 변경 | 같은 전표의 키가 바뀐다. 발행된 벤더 키는 못 바꾼다 | KTI 시리즈는 SETIVE 소유 — 면역 |
| 24자 초과 → 해시 접미 | 사람이 읽는 키와 opaque 키가 섞인다. 팝빌 콘솔 검색이 안 된다. 해시 알고리즘에 버전 표식이 없어 한 번 바꾸면 과거 문서를 영원히 못 찾는다 | 14자 → **여유 10자. 해시 분기가 영원히 불필요** |

### 6.3 autoname 에 쓰지 않는 두 값

**① 관리번호를 autoname 으로 쓰지 않는다.** 팝빌은 문서 삭제 후 같은 관리번호 재사용이 정상 경로다. 이름이 곧 그 값이면 정당한 재사용에서 문서명이 충돌한다. 그래서 `name` 과 `document_key` 를 **별도 필드로 둔다** — `name` 은 `naming_series:` 로 채번되어 절대 재사용되지 않고, `document_key` 는 최초 발행 시 자기 `name` 을 복사하되 **재사용 가능한 값**이다.

**② 승인번호를 autoname 으로 쓰지 않는다.** 스키마 오류 시 국세청이 `9999999999999999xsderror` 를 반환한다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):250) — 이 센티널이 여러 행에 동시에 올 수 있다.

**그리고 `nts_approval_no` 에 `unique=1` 도 걸지 않는다.** 두 가지 이유가 겹친다.

- 센티널 `9999999999999999xsderror` 가 두 행에 오면 **unique 제약이 오히려 정상 경로를 막는다.** 어댑터가 이 값을 `None` 으로 정규화하고 `error_code` 에 옮긴다.
- 빈 값은 frappe 가 NULL 로 바꾸고 MariaDB UNIQUE 는 **다중 NULL 을 허용**하므로 미승인 행이 여럿 생기는 것을 막지 못한다. 즉 unique 를 걸어도 기대한 보호가 오지 않는다.

> 다중 NULL 허용은 버그가 아니라 **논리적 삭제를 표현하는 도구**다. §6.4 가 이를 뒤집어 쓴다.

### 6.4 유일성 — 벤더가 판정하는 범위에 건다

```
tenant_scope_hash : Data(40). sha1("{provider}|{environment}|{tenant_handle}"). insert 시 1회 고정
document_key_live : Data.    voided=0 이면 document_key 와 같고, voided=1 이면 NULL
UNIQUE (tenant_scope_hash, document_kind, document_key_live)
```

MariaDB 에 부분 인덱스가 없으므로 **살아 있는 행에서만 값이 채워지는 컬럼**에 unique 를 건다. 다중 NULL 허용은 여기서 버그가 아니라 **논리적 삭제를 표현하는 도구**다(§6.3 의 관찰을 뒤집어 쓴다).

**재사용의 정확한 절차** — §6.2 가 `document_key ← 자기 name` 이라고만 했으면 새 행은 새 name 을 받아 **벤더 관리번호가 재사용되지 않는다.** 규칙을 하나 더 못박는다.

```
최초 발행    : document_key = 자기 name                    (KTI-2026-00001)
벤더 삭제 후 : 기존 행 voided=1 · superseded_by = 새 행
               새 행 document_key = **선행 행의 document_key 를 복사**   (KTI-2026-00001 그대로)
```

즉 `document_key` 의 파생원은 "자기 name" 이 아니라 **"체인 최초 행의 name"** 이다. 체인 중간의 어떤 행도 새 키를 만들지 않는다. 이래야 팝빌의 "삭제 후 같은 관리번호 재사용" 이 실제로 표현되고, `document_key_live` unique 가 정당한 재사용을 막지 않는다.

범위가 `account` 가 아니라 `tenant_scope` 인 이유 — **account 는 ERP 의 정체성이고 유일성은 벤더가 판정한다.** 결정적 반례: 본점 Company 와 종사업장 Company 는 **같은 사업자등록번호**를 갖는다(`setive_branch_code` 를 신설하는 이유가 바로 이것이다). 두 account 행이 같은 `document_key` 를 쓰면 DB unique 는 통과하고 벤더에서는 같은 CorpNum 네임스페이스에서 충돌한다.

복합 unique 는 DocType JSON 키가 아니라 `on_doctype_update()` 훅으로 건다. 코어 선례: [`erpnext/stock/doctype/bin/bin.py`](../../erpnext/stock/doctype/bin/bin.py):251-252 `frappe.db.add_unique("Bin", ["item_code","warehouse"], constraint_name="unique_item_warehouse")`.

> sandbox 와 production 이 같은 `document_key` 를 갖는 것은 **정상이자 필수**다. 팝빌은 테스트/운영이 완전 분리되어 발행이력이 이관되지 않으므로([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):198-200 "전부 다시 해야 한다") 같은 전표를 운영에서 다시 발행하게 된다. 그때 키가 같아야 원천전표 ↔ 문서 추적이 유지된다. 반대로 볼타는 단일 도메인에 키 접두사로만 환경이 갈리므로 `test_`/`live_` 가 같은 reference-id 네임스페이스를 공유하는지 확인이 필요하다(**미확인**) — 공유한다면 볼타 어댑터의 `vendor_document_ref` 파생에만 환경 접두사를 붙인다. 벤더별 네임스페이스 정책이 중립 층에 새지 않는다.

---

## 7. `Korea Integration Account` 정체성 — `(provider, environment, company)`

정체성 키는 **(provider, environment, company) 복합**이다. `corp_num` 의 전역 unique 는 제거한다 — 같은 법인이 sandbox 행과 production 행을 정당하게 갖는다.

`environment` 를 나중에 넣으면 **전 행 rename 과 `__Auth` 이관 패치가 붙는다.** Password 필드는 `__Auth` 에 docname 으로 묶이므로 autoname 변경 = docname 변경 = 기존 `__Auth` 행 고아화다. 팝빌은 테스트/운영 연동회원이 서로 **존재하지 않는 별개 레코드**이므로([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):373) 이 축은 처음부터 있어야 한다.

**autoname 은 `format:` 을 쓰지 않는다.** ERPNext 는 Company rename 을 허용하고, rename 하면 Link 필드는 cascade 로 갱신되지만 `name` 은 생성 시점 1회로 고정되어 `popbill-production-구회사명` 이 영구히 남는다. §6.3 에서 Korea Tax Invoice 에 세운 원칙을 여기에도 같게 적용한다.

```
autoname : naming_series:   (KIA-.#####)
UNIQUE (provider, environment, company)              ← on_doctype_update()
UNIQUE (provider, environment, corp_num, branch_code)
```

두 번째 제약을 남기는 이유: 환경 축만 추가하면 됐지 제약을 통째로 버릴 이유는 없었다. 같은 환경·같은 provider 에서 같은 (사업자번호, 종사업장) 이 두 번 등록되면 오발행이다.

> ⚠ **사이트당 유효 환경은 언제나 정확히 1개다.** 행이 환경을 갖는 순간 "한 사이트에 sandbox 행과 production 행이 동시에 존재"가 정상 상태가 되고, 발행 시 어느 행을 집는지가 조회 조건에 달린다. [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):234 가 경고한 함정이다 — `IsTest` 는 기본값이 운영이고 **잘못된 환경으로 호출해도 정상 응답이 와 화면상 '발행 성공'으로 보인다.** 따라서 ① `resolve_environment()` 가 반환한 값과 다른 환경의 account 행은 `service.py` 진입 가드에서 **원천 배제**하고, ② 어댑터가 자기 클라이언트의 환경 플래그와 `resolve_environment()` 를 대조해 불일치면 throw 하며, ③ 기동 로그에 유효 환경을 찍는다.

---

## 8. 신원 기재사항의 원천

**원천은 Company / Customer / Supplier 의 Custom Field 다.** `Korea Integration Account` 에는 **벤더 등록 시점 스냅샷만 read-only** 로 둔다.

| | 원천 | 스냅샷 |
|---|---|---|
| 위치 | Company · Customer · Supplier Custom Field | `Korea Integration Account` (read_only) |
| 필드 | `setive_ceo_name` · `setive_biz_type` · `setive_biz_class` … | `enrolled_ceo_name` · `enrolled_biz_type` · `enrolled_biz_class` · `enrolled_corp_name` · `enrolled_addr` · `enrolled_on` |
| 용도 | 세금계산서 기재사항. 사람이 관리 | drift 탐지 — "벤더에 등록한 값 ≠ 현재 값" 판정 |

근거 두 가지:

1. **거래처에는 `Korea Integration Account` 레코드 자체가 없다.** 계정은 우리 회사(Company)당 1행이다. 업태·종목·대표자명은 공급받는자 쪽에도 필요한 기재사항이므로 계정에 두면 담을 곳이 없다.
2. **이 셋은 벤더 산출물이 아니다.** 세금계산서 기재사항이며 벤더를 바꿔도 값이 같다. 벤더 산출물(LinkID·연동회원 가입 결과·인증서 상태)만 계정에 남는다.

스냅샷이 필요한 이유는 팝빌 회신 때문이다 — *"사업자 정보가 변경될 경우 파트너 계약, LinkID, API KEY 를 포함한 모든 연동 환경이 새롭게 재설정됩니다"*([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):41). 현재값만 있으면 **재등록이 필요한 상태인지 알 수 없다.**

구현 규칙(위반하면 무증상 실패):
- 스냅샷은 `frappe.db.set_value(..., update_modified=False)` 로 쓴다. 기본값 `True` 면 `modified` 가 올라가 폼을 열어 둔 사용자의 다음 저장이 `TimestampMismatchError` 로 죽는다. 이 앱의 관례가 이미 그렇다([`korea/common/nts_codes.py`](../../../setive_erpnext_kr/setive_erpnext_kr/korea/common/nts_codes.py):393-395).
- `read_only` 는 **서버에서 강제되지 않는다.** 소비 함수 하나(`party_identity.tax_status()`)로 읽기를 통일하고, 그 함수가 권위(로그 최신 행)와 캐시를 구분한다.

---

## 9. Custom Field 관리 방식 — 코드 단일화

**결정: `create_custom_fields` 코드 방식으로 통일한다. `export_customizations` / `fixtures` 로 회수하지 않는다.**

근거:

1. **기존 구현이 이미 코드 방식이다.** 현재 9개 전부 [`korea/common/nts_codes.py`](../../../setive_erpnext_kr/setive_erpnext_kr/korea/common/nts_codes.py):158 의 `create_custom_fields(get_custom_fields(), update=True)` 로 만들어진다. `custom/*.json` 도 `hooks.py` 의 `fixtures` 도 부재(실측).
2. **ERPNext 코어 자신이 코드 방식이다.** `grep -c 'fixtures' erpnext/hooks.py` → **0**. italy·uae·install.py·patches 전부 `create_custom_fields` 를 쓴다. 우리가 따르는 선례가 이미 이쪽이다.
3. **`export_customizations` 는 사람이 UI 를 만져야 재현된다.** 에이전트도 CI 도 그 단계를 실행할 수 없다. 회수를 빠뜨린 DB 변경은 컨테이너 재생성 시 소실되고 이후 grep 으로 찾지 못한다 — CLAUDE.md 0단계가 경고하는 바로 그 위험을 **회수 단계 자체를 없앰으로써** 제거한다.
4. **혼용하면 같은 필드가 두 소스에서 관리된다.** migrate 순서에 따라 값이 왕복하고 어느 쪽이 이겼는지 사후에 알 수 없다.
5. `update=True` 가 멱등이므로 `bench migrate` 마다 수렴한다.

한계(정직하게):
- **Property Setter 는 이 경로로 만들 수 없다.** 코어 필드의 라벨·필수여부·기본값 변경은 여전히 Customize Form 또는 Property Setter 직접 생성이 필요하다. 이번 범위(신규 필드 추가)는 전부 코드 방식으로 성립한다.
- `create_custom_fields(update=True)` 는 **만들기만 하고 지우지 않는다.** 불필요해진 필드는 patch 로 명시 삭제해야 한다.

### 9.1 CLAUDE.md 0단계 개정이 필요하다 — 제안만 하고 멈춘다

현행 [`CLAUDE.md`](../../CLAUDE.md) 0단계는 *"필드 추가/숨김/필수여부/라벨/기본값 … → Customize Form · Property Setter · Workflow 로 처리한다"* 와 *"처리 후 반드시 `export_customizations` 또는 `export-fixtures` 로 앱에 회수하고 커밋한다"* 를 지시한다. **구현(KB-KOR-003)은 이미 코드 방식이므로 규약과 구현이 어긋나 있다.**

규약 변경은 사람 승인 사항이다. 제안 문구만 남긴다.

> **제안 — 0단계를 두 갈래로 쪼갠다**
> - **신규 필드 추가** → `create_custom_fields` **코드**. `korea/common/` 의 `get_custom_fields()` 에 넣는다. `export_customizations` 대상이 아니다.
> - **코어 필드의 속성 변경**(숨김·필수여부·라벨·기본값·목록필터) → Customize Form / Property Setter → `export_customizations` 회수.
>
> 함께 정정할 문장: 라우팅 2단계의 *"`erpnext/hooks.py` 의 `doc_events` 에는 `"Company"` 키가 없다. 경합 없이 쓸 수 있는 가장 깨끗한 주입 지점이다"* 는 부정확하다. [`erpnext/hooks.py`](../../erpnext/hooks.py):348-353 의 `"*"` 키가 **모든 DocType 의 `validate`** 에 `service_level_agreement.apply` 와 `transaction_deletion_record.check_for_running_deletion_job` 를 건다. Company 훅이 경합하지 않은 것은 키가 없어서가 아니라 **이벤트가 `on_update` 로 달라서**다. Customer/Supplier 에 `validate` 를 걸면 이 앱이 처음으로 코어와 같은 이벤트에 얹힌다.

---

## 10. 자격증명 교체 — 세대(generation) 모델

팝빌 회신(2026-09-15): *"추후 사업자 정보가 변경될 경우, 파트너 계약, LinkID, API KEY 를 포함한 모든 연동 환경이 새롭게 재설정됩니다."*([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):41)

따라서 `LinkID`/`SecretKey` 를 불변으로 가정하지 않는다.

```
credential_generation : Int
  1. next 주입              (운영자)
  2. verify() 단발 프로브    (bench execute 로만. whitelist 하지 않는다)
  3. 성공 시 generation 승격
  4. current 폐기
```

**요청 1건 안에서 두 키를 시도하지 않는다 — 절대 규칙.** 초안의 "인증 실패 시 current↔next 교차 시도" 는 폐기한다. 세 가지가 동시에 틀어진다.

- **`-99010013` 은 "키가 바뀌었다"가 아니다.** 실측 대조표([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):347-357): TESTER + 정상 SecretKey → `-99010013`(서명은 통과, **정책적 거부**) / SecretKey 1바이트 훼손 → `-99010007`(서명 불일치) / 미존재 LinkID → `-99004021`. 파트너 키가 정지된 상황에서 교차 시도하면 정상 키 하나를 같은 벽에 추가로 던지는 것이고 진단이 "두 키 모두 죽었다"로 오염된다.
- **`-99010007` 은 키 문제가 아닐 확률이 더 높다.** `UseLocalTimeYN` 기본값 `True` 는 로컬 시각을 서명에 넣어 몇 분만 틀어져도 모든 호출이 인증 오류가 된다([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):179). 컨테이너 시계가 드리프트하면 current 와 next 가 **똑같이** 실패한다. 교차 시도는 NTP 사고를 키 회전 사고로 오진하게 만든다.
- **`IPRestrictOnOff` 기본값 `True`** 는 토큰을 발급 시점 IP 에 묶어 컨테이너 재배치 시 워커마다 다르게 실패한다(:178). 여기에 교차 시도를 얹으면 워커 A 는 current 로, B 는 next 로 성공하고 C 는 둘 다 실패하는 비결정 상태가 된다.

인증 실패 시 작업은 `FAILED` 가 아니라 **보류**한다. `EtaxError.category == AUTH` 는 재시도 대상이되 **키를 바꾸지 않는다.** 회전은 별도 잡이 한다. 인증 실패 로그에 컨테이너 UTC 시각을 함께 남긴다 — 시계 드리프트를 키 문제로 오진하지 않기 위해서다. 키 값은 `mask()` 로만 남긴다.

> ⚠ **"무중단"을 SETIVE 혼자 달성할 수 없다.** 팝빌 SDK 가 사업자번호별로 토큰을 **30분 메모리 캐시**한다([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):178). 여기에 `site_config` 60초 캐시와 워커 프로세스 수명이 겹친다. 실제 반영 지연 = SDK 30분 + site_config 60초 + 워커 수명. 회전 절차 자체가 [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):301 질의 6번으로 **미회신**이므로, 답을 받기 전에 회전 알고리즘을 계약으로 확정하지 않는다.

**테넌트 온보딩은 전량 재실행이 안전한 멱등 함수여야 한다.**

```python
def enroll_tenant(company: str) -> EnrollResult:
    """몇 번 불러도 같다. 이미 가입돼 있으면 스냅샷만 갱신한다."""
```

첫 단계는 언제나 존재 확인이다 — 연동회원은 사업자번호 기준 **중복 등록 불가**이고([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):128) 타 파트너 소속 이전 절차는 문서에 없다(:130).

---

## 11. 착수 게이트 — 코드를 쓰기 전에 통과해야 하는 것

### 11.1 볼타 실호출 스파이크 1건 (§4 확정의 선행)

§4 의 "두 벤더 공통" 판정은 **두 벤더의 발행 호출을 실제로 대조하지 않고** 내려졌다. [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):11 의 `verified_by` 는 "공식 문서 원문 대조"라고 적지만 대조 **결과**가 문서에 남아 있지 않다.

- 볼타는 계약 없이 지금 가능하다 — 구글 가입 → 워크스페이스 → `test_` 키 자체 발급(승인 절차 없음) → 발급자 등록 3필드 → 테스트 인증서로 발행([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):368).
- 팝빌은 SDK(`popbill` 1.64.2)가 PyPI 에서 지금 읽히므로 계약 없이 **시그니처 대조가 가능하다.**
- 두 벤더의 요청 본문 필드 전체와 응답 스키마를 [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md) §3 에 표로 추가한 뒤 §4 를 "확정"으로 승격한다.

> ⚠ 볼타 워크스페이스 생성에 **체크섬 유효한 사업자등록번호**가 필요하고([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):18) SETIVE 는 2026-09-15 기준 사업자등록 **미보유 확정**이다([KB-KOR-005](./KB-KOR-005_localization_roadmap.md):149). 즉 이 스파이크도 **사업자등록 이후**다. [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):368(가능) 과 [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):18(불가능)이 같은 날짜로 충돌하며, 후자가 더 나중에 실측된 것이다 — §12-1 참조.

### 11.2 스택 선행 (KB-KOR-009 의 M0)

| # | 항목 | 미해소 시 |
|---|---|---|
| 1 | 기동 시 `bench migrate` | 새 DocType JSON 이 디스크에만 남는다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):221) |
| 2 | `bench --site $SITE enable-scheduler` | 상태 폴링·일일 대사가 돌지 않는다(:220). 신규 사이트는 `enable_scheduler=0` |
| 3 | 워커 3종(`queue-short`·`queue-long`·`scheduler`)에 벤더 SDK 설치 | 웹은 정상인데 **발급 잡만 조용히 실패**(:252) |
| 4 | 컨테이너 HTTPS egress | 외부 연계 전체 불가([KB-KOR-005](./KB-KOR-005_localization_roadmap.md):145) |
| 5 | 리베이스 후 `bench migrate` 미실행 해소 | `Contact.is_billing_contact` 부재(1054)로 전표가 막힌다([KB-KOR-003](./KB-KOR-003_company_hook_tax_nts.md) §10-1) |

1·2 가 안 되면 §5 의 2축 상태는 **관측 수단 없이 선언만 남는다.**

---

## 12. 이전 서술 정정

이 문서를 쓰며 기존 문서에서 발견한 모순 중 계약에 직결되는 것만 남긴다. 전체 14건은 §14 에 목록으로 둔다.

### 12-1. 볼타 계약 전 PoC 가능 여부 — KB-KOR-006 §10 이 낡았습니다

[KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):368 은 *"볼타 | 가능 … `test_` 키 버튼 한 번으로 자체 발급"*, :408 은 *"볼타는 지금 가능"* 이라고 적습니다. 같은 날짜(2026-09-15)의 [KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):18 은 *"팝빌·볼타 양쪽 모두 불가능하다 … 볼타는 워크스페이스 생성에 사업자등록증 기준 회사 정보와 **체크섬 유효한 사업자등록번호**를 요구"* 라고 적습니다. **KB-OPS-003 이 옳습니다** — 그쪽이 폼 HTML 과 검증 JS 를 직접 확인한 결과이고, KB-KOR-006 의 서술은 공식 문서 문구를 옮긴 것입니다. 사람 게이트(영업·심사·계약)가 없을 뿐 사업자번호 게이트는 양쪽 다 있습니다.

### 12-2. "1순위 벤더" 가 한 문서 안에서 충돌합니다

[KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):21 은 *"1순위 벤더는 팝빌"*, :71 은 *"볼타 — PoC 1순위 / 운영 2순위"* 입니다. 모순이 아니라 **축이 둘**인데 축 이름이 생략돼 읽는 사람이 충돌로 봅니다. 이 문서는 **운영 1순위 = 팝빌, 검증 1순위 = 볼타** 로 축을 명시해 씁니다.

### 12-3. 웹훅 수신 위치가 2벌입니다

[KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):219 은 *"앱의 `@frappe.whitelist(allow_guest=True)`"*(테넌트 사이트), [KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md):64-66 은 *"중앙 게이트웨이 → … 웹훅 수신"* 입니다. **게이트웨이가 옳습니다.** 팝빌 파트너 URL 은 전 테넌트 공용 1개이므로(§4.3) 테넌트 사이트가 받을 수 없습니다. 게이트웨이 착수 전 과도기에는 테넌트 사이트가 받되, 그것이 **과도기 절충임을 코드 주석에 남깁니다.**

### 12-4. `on_submit` 비동기 큐잉과 "발행 실패 시 제출 차단" 은 양립 불가입니다

[KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):25·216 은 `enqueue`, :217 은 `frappe.throw` 로 제출 차단을 설계합니다. §5.1 에서 판정했듯 **동시에 성립하지 않습니다.** 비동기를 택하고 제출 차단을 포기합니다. 같은 문서 :188 이 인증서에 대해 이미 같은 판단을 내려 뒀습니다.

### 12-5. KB-KOR-005 §4 의 절 참조가 틀렸습니다

[KB-KOR-005](./KB-KOR-005_localization_roadmap.md):102 는 *"팝빌 샌드박스 스파이크 → KB-KOR-006 §7"* 인데, [KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md) §7 의 제목은 "포크 수정 없이 구현 가능하다" 이고 스파이크 순서는 **§10.1**(:375)에 있습니다.

---

## 13. 검증

이 과제의 산출물은 **문서 1건이며 코드 파일은 만들지 않았다.** 따라서 아래 명령은 **KB-KOR-009 착수 시의 수용 게이트**다. 오늘 실행하면 "파일 없음"이 정답이다.

```bash
APP=../setive_erpnext_kr/setive_erpnext_kr
E="$APP/korea/common/etax"

# 1. 오늘 상태 — etax/ 는 아직 없어야 한다. 기대: 출력 없음(exit 1)
ls -d "$E" 2>/dev/null

# 2. 이월 보장 — 계약층에 벤더 용어가 0건이어야 한다 (009 착수 후)
grep -nE 'popbill|bolta|linkhub|issuanceKey|MgtKey|CorpNum|issuerId' \
  "$E"/{contract,state,mgtkey,dto}.py            # → 0 건
# 3. 이월 보장 — 오케스트레이션에 provider 문자열 분기가 0건이어야 한다
grep -nE 'provider ==|provider in' "$E/service.py"   # → 0 건

# 4. 벤더 용어는 adapters/ 아래에만 산다 — 위 2번이 0이고 아래가 >0 이어야 유의미하다
grep -rlE 'popbill|bolta|linkhub' "$E/adapters/"     # → 파일 2개

# 5. DocType 이름 4벌이 이 문서와 일치하는가
for S in korea_tax_invoice korea_etax_webhook_event \
         korea_integration_settings korea_integration_account; do
  test -f "$APP/setive_erpnext_kr/doctype/$S/$S.json" && echo "OK $S" || echo "MISSING $S"
done

# 6. 모든 DocType JSON 의 module 이 modules.txt 실제 값인가
grep -h '"module"' "$APP"/setive_erpnext_kr/doctype/*/*.json | sort -u
# → "module": "SETIVE ERPNext KR"  한 줄만 나와야 한다

# 7. 승인번호에 unique 가 걸려 있지 않은가 (§6.3)
grep -n '"fieldname": "nts_approval_no"' -A6 \
  "$APP/setive_erpnext_kr/doctype/korea_tax_invoice/korea_tax_invoice.json" | grep -c unique
# → 0

# 8. 복합 unique 가 on_doctype_update() 로 걸려 있는가 (§6.4 · §7)
grep -n 'add_unique' "$APP"/setive_erpnext_kr/doctype/*/*.py
```

문서 자체의 검증:

```bash
# 9. 번호 충돌 — KB-KOR-009 · KB-OPS-004 는 예약만 하고 본문이 없어야 한다
ls docs/kb/KB-KOR-009* docs/kb/KB-OPS-004* 2>/dev/null   # → 출력 없음
grep -rh "^id:" docs/kb/ docs/ontology/ | sort | uniq -d # → 출력 없음(중복 0)

# 10. 상대경로 링크가 실제 파일을 가리키는가
grep -oE '\]\(\.\.?/[^)]+\)' docs/kb/KB-KOR-008_etax_vendor_adapter_contract.md \
  | tr -d '])(' | while read -r p; do
      ( cd docs/kb && test -e "$p" ) || echo "BROKEN $p"
    done
```

---

## 14. 알려진 한계

- **§4 의 벤더 대칭성은 잠정이다.** §11-1 의 스파이크 전까지 "두 벤더 공통"은 문서 대조에 근거한 추정이며, 그 스파이크 자체가 SETIVE 사업자등록에 막혀 있다. 이 계약 위에 §5(상태)·§6(관리번호)·"발급 불가 거래처" 리포트가 전부 얹혀 있으므로, 스파이크 결과가 §4 를 뒤집으면 연쇄 수정이 필요하다.
- **상태축이 2개로 충분한가는 미결이다.** 부가세법상 **발급**(제32조: 공급받는자에게 전자적으로 전송)과 **국세청 전송**은 별개 의무이고 별개 가산세다. 공급받는자 이메일 전송 실패(bounce)는 현재 설계에서 `ISSUED × SENT` 로 나타나 "정상"으로 보이지만 법적으로는 발급 성립을 다툴 수 있다. **3번째 축 `RecipientDelivery`(NOT_REQUIRED · PENDING · DELIVERED · BOUNCED) 가 필요한지는 사람 결정 사항**이며 KB-KOR-009 착수 전에 판단해야 한다 — 나중에 넣으면 전 행 백필이 붙는다.
- **가산세 기산일 규칙은 아직 없다.** §3.2 가 `supply_date` · `written_date` · `issued_at` · `sent_at` 4종 시각을 필드로 확보했을 뿐, 지연 판정 규칙(월합계의 작성일자 = 말일, 발급 기한 = 익월 10일, 전송 기한 = 발급 익일)과 **국세기본법 제5조 공휴일 특례**, KST 자정 경계 처리는 미작성이다. `posting_date` 1:4 불일치 경고([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):279)를 그대로 승계하지 않도록 009 에서 다룬다.
- **위수탁(부가세법 시행령 제69조)은 DTO 에 없다.** 법정 3자 구조이고 `BrokerParty` 섹션이 별도이며 **수탁자 인증서로 서명**한다([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):117-128). `issue_direction`(정발행/역발행)만으로는 표현되지 않는다. 1차 범위에서 제외하되 **제외를 명시한 채로** 진행한다.
- **`NtsState.ACCEPTED` 와 `SENT` 의 구분이 벤더 응답에 실재하는지 미확인이다.** 팝빌 상태코드 305(반려)만 문서에 있고 승인 코드는 없다.
- **`Korea Integration Account.user_id` 는 팝빌 전용 축이다.** 담당자(`UserID`) 계층은 볼타에 없다([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):450 "계정 개념 없음"). 계정 본체 필드에서 빼고 `vendor_meta`(Small Text, JSON, 어댑터만 읽음)로 옮기는 것이 옳으나, [KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md) §6 의 필드표 개정은 이 세션의 정정 2건 범위 밖이라 **후속 과제로 남긴다.**
- **게이트웨이 경계가 아직 없다.** [KB-OPS-002](./KB-OPS-002_tenant_integration_credentials.md):246 이 중앙 게이트웨이 미구현을 명시한다. §10 의 세대 모델은 게이트웨이가 생기면 **테넌트 앱이 아니라 게이트웨이의 책임**으로 옮겨간다. 과도기 절충을 계약층에 영구 각인하지 않도록 `integration.py` 경계 뒤에 가둔다.
- **승인번호 접두사로 자사 문서를 판별하지 않는다.** 승인번호 24자리의 가운데 8자리는 **시스템사업자 등록번호**이고 앞 2자리가 발급 경로다(41 = ASP, [ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):245-265). 벤더를 바꾸면 그 시점 이후 문서의 가운데 8자리가 바뀌며 이는 정상이고 되돌릴 수 없다. 자사 문서 판별은 언제나 `account` Link 로 한다.
- **문서 간 모순 14건 중 9건은 이 문서 범위 밖이다.** 계약과 무관한 것(팝빌 단가 공개 여부, 온보딩 플로우 확정 여부, `RegistTaxCertPFX` SDK 구현 여부, `checkIsMember` 착수 시점, SETIVE-README 의 기능 선언 vs 코드 0줄, 앱 README 의 문서 목록 누락, 역참조 비대칭 2건, `regional_overrides` 정정이 CLAUDE.md·KB-KOR-003 에 미반영)은 각 문서 소관으로 남긴다.
