---
id: KB-OPS-002
title: 테넌트 연계 설정·자격증명 계층 — 무엇을 파일에 두고 무엇을 DB 에 두는가
domain: 운영·배포
status: draft
applies_to:
  - erpnext@16.33.0
  - frappe@v16
  - setive_erpnext_kr@0.0.1
verified_on: 2026-09-16
verified_by: frappe/erpnext 코어 소스 확인(Bank Account · move_plaid_settings_to_doctype · company.json) + KB-OPS-001 배포 모델 대조 + 팝빌/볼타 환경분리 문서 확인(2026-09-15) + 정체성 키·신원 필드 소유권 재검토 후 정정 2건(2026-09-16, §13)
related: [KB-OPS-001, KB-KOR-006, KB-KOR-007, KB-KOR-005, KB-KOR-008]
---

# KB-OPS-002: 테넌트 연계 설정·자격증명 계층

## 1. 요약

외부 서비스 연계(전자세금계산서, 국세청 조회 등)에 필요한 자격증명을 어디에 둘 것인가. 결론은 **세 층으로 나누고, 층마다 거처가 다르다.**

| 층 | 무엇 | 거처 | 이유 |
|---|---|---|---|
| **1** | SETIVE↔벤더 **파트너 자격증명** (팝빌 `LinkID`/`SecretKey`) | **중앙 게이트웨이** (테넌트 사이트 아님) | 키 1벌의 폭발 반경이 전 테넌트 |
| **2** | 사이트 전역 스위치 (운영/테스트, 엔드포인트, 알림 정책) | **Single DocType** | 사이트에 하나뿐인 값 |
| **3** | **사업자번호 단위** 값 (CorpNum, 연동회원 상태, 인증서 상태) | **Company Link 일반 DocType** | 사업자번호가 Company 단위 |

**"설정 파일로 빼자"는 직관은 절반만 맞다.** 고객별 값이 앱 저장소(git)에 들어가면 안 된다는 부분은 정확하다. 그러나 Frappe 에서 "파일"은 ① git 배포물 ② 사이트 볼륨의 `site_config.json` 둘뿐이고, 후자는 UI·권한·감사·회사별 분리가 전혀 없다.

---

## 2. 테넌트 = 사이트, 그러나 Company 는 여럿일 수 있다

[KB-OPS-001](./KB-OPS-001_tenant_provisioning_deployment.md) 기준 **테넌트 = 격리된 사이트**다. 그런데 **한 사이트가 ERPNext Company 를 여럿 가질 수 있다** (KB-OPS-001 §5.1 "사이트당 회사마다 1회").

실측: `erpnext/setup/doctype/company/company.json` 에서 `company_name` 만 `unique=1` 이고 **`tax_id` 는 unique 도 reqd 도 아니다.** 신규 Company 생성은 ERPNext 기본 UI 에서 고객이 아무 때나 할 수 있다.

> ⚠ **이것이 3층을 Single 로 접으면 안 되는 이유다.** 한 사이트에 법인 + 개인사업자 2개를 두는 중소기업은 흔하고, 팝빌 연동회원은 사업자등록번호 단위다. Single 로 접으면 **두 번째 Company 가 첫 번째 CorpNum 의 인증서로 발행되는 오발행**이 발생하며 이는 세법상 사고다.

---

## 3. 후보별 판정

| 후보 | 판정 | 근거 |
|---|---|---|
| (a) `site_config.json` | **환경 앵커 전용** | git 밖이고 고객 UI 에 안 보이는 것이 장점. 단점: UI·권한·감사·검증 전무, Company 단위 분리 불가, **60초 캐시**로 즉시 반영 아님, JSON 한 글자 깨지면 bench 명령 전체가 죽음 |
| (b) Single DocType + Password | **사이트 전역 스위치** | `__Auth` 테이블 Fernet 암호화, UI·권한·`track_changes`, git 유출 불가. 한계: 회사 2개 이상이면 표현 불가 |
| (c) 일반 DocType (Company Link) | **테넌트 고유 자격증명의 정답** | 코어 선례 `Bank Account`(company Link + Password, 비-Single) |
| (d) 환경변수 / docker secret | **주입 경로로만** | compose 가 git 안이고 `docker inspect` 로 샌다. 변경마다 컨테이너 재생성 |
| (e) 앱 코드 내 JSON | **절대 불가** | 평문 git 인 것도 문제지만, 앱은 전 테넌트 공통 배포물이고 **fixtures 임포트가 고객 변경분을 경고 없이 롤백**한다 |

### 3.1 상류가 이미 같은 판단을 내렸다

ERPNext v12 패치 `move_plaid_settings_to_doctype.py` 가 Plaid 자격증명을 **`site_config`(frappe.conf) 에서 Settings DocType 의 Password 필드로 이관**했다. Frappe 생태계는 `site_config` 를 연동 자격증명의 자리로 보지 않는다.

---

## 4. 1층 — 파트너 자격증명은 테넌트 사이트에 두지 않는다

팝빌 `LinkID`/`SecretKey` 하나로 **파트너 하위 임의 `CorpNum` 의 토큰을 발급**할 수 있다(토큰 요청 본문 `access_id` 에 대상 사업자번호를 넣는 구조). 도달 가능한 행위에 `QuitMember`(관리자 포함 전 담당자 일괄 삭제)와 `Refund`(포인트 환불신청)까지 포함된다.

**폭발 반경이 전 테넌트인 키를 N개 사이트에 복제하는 것 자체가 설계 결함이다.** 팝빌 약관 제14조 6)은 인증키 관리 소홀의 책임을 전적으로 파트너에게 지운다.

```
  테넌트 사이트 site_config     →  게이트웨이 URL + 사이트 전용 토큰만
  중앙 게이트웨이                →  LinkID / SecretKey, 고정 출구 IP,
                                    팝빌 IP Whitelisting, 웹훅 수신
```

> **과도기 절충**: 게이트웨이 착수 전이라면 `site_config.json` 에 두되 — 고객이 읽을 수 없는 유일한 층이므로 — **DocType 에는 어떤 경우에도 넣지 않는다.**

키 이름은 upstream 충돌 방지를 위해 `setive_` 접두사를 붙인다.

```bash
bench --site $SITE set-config setive_integration_env sandbox
```

> ⚠ `-p` 옵션은 JSON 파서가 아니라 `ast.literal_eval` 이다. 반드시 **파이썬 리터럴**(작은따옴표, `True`/`False`/`None`)로 준다. JSON 의 `true`/`false`/`null` 은 여기서 터진다.
> ⚠ `-g` 를 붙이면 `common_site_config.json` 으로 가서 같은 bench 의 모든 사이트가 공유한다. **사이트 레벨(`-g` 없이)로 통일**한다.
> ⚠ 값 반영은 워커 프로세스당 **최대 60초 지연**된다(site_cache ttl=60). 회전 직후 검증은 60초 뒤 또는 재기동 후에 한다.

---

## 5. 2층 — Single DocType

`Korea Integration Settings` (issingle=1, track_changes=1, System Manager 만 read/write)

| 필드 | 타입 | 기본 | 용도 |
|---|---|---|---|
| `enabled` | Check | 0 | 마스터 스위치. 꺼져 있으면 외부 호출 없음 |
| `provider` | Select | popbill | |
| `environment` | Select | **sandbox** | site_config 상한 **이하**로만 |
| `effective_environment` | Data (read_only) | | 서버가 계산해 표시 |
| `timeout_seconds` / `retry_count` | Int | 15 / 2 | |
| `notify_on_failure` | Link | | 전송 실패 알림 수신자 |

### 5.1 환경 해석은 fail-safe 로 (중요)

```
effective = "production"  ⟺  site_config.setive_integration_env == "production"
                            ∧  Settings.environment == "production"
                            ∧  ¬ account.force_sandbox
site_config 키가 없으면 → 무조건 sandbox
```

**site_config 가 천장이고 DocType 은 그 아래로만 내려갈 수 있다.** 팝빌 SDK 의 `IsTest` 기본값이 **`false`(=운영)** 인 fail-open 구조이므로 SETIVE 층에서 반드시 뒤집어야 한다.

### 5.2 환경의 형태가 벤더마다 다르다 (2026-09-15 추가)

| 벤더 | 환경 분리 방식 |
|---|---|
| **팝빌** | 도메인·ServiceID 완전 분리 (`test.popbill.com`/`POPBILL_TEST` ↔ `popbill.com`/`POPBILL`). **데이터·인증서·연동회원이 이관되지 않는다** |
| **볼타** | `xapi.bolta.io` 단일 도메인. **키 접두사(`test_`/`live_`)로만** 갈린다 |

→ 자격증명 스키마의 '환경' 축을 벤더별로 다르게 잡아야 하고, 테넌트 프로비저닝 코드는 처음부터 **환경별 재실행 가능(idempotent)** 해야 한다. 팝빌에서는 테스트에서 만든 연동회원이 운영에 없으므로 **같은 온보딩을 두 번 돌리게 된다.**

---

## 6. 3층 — (provider, environment, company) 당 1행 (합치지 않는다)

`Korea Integration Account` (일반 DocType, `autoname: naming_series:` → `KIA-.#####`)

정체성은 **(provider, environment, company) 복합**이다. 근거와 autoname 을 `format:` 으로 두지 않는 이유는 [KB-KOR-008](./KB-KOR-008_etax_vendor_adapter_contract.md) §7. 아래 §13-1 의 정정 ① 을 함께 읽는다.

| 필드 | 타입 | 비고 |
|---|---|---|
| `provider` · `environment` · `company` | Select · Select · Link(Company) | reqd. **세 필드의 복합 unique**. 단일 필드 unique 는 걸지 않는다 |
| `corp_num` | **Data** | 사업자등록번호. **비밀이 아니다.** validate 에서 하이픈 제거·체크섬 검증 + `Company.tax_id` 불일치 시 throw. **단일 unique 아님** — `(provider, environment, corp_num, branch_code)` 복합 |
| `user_id` | Data | 연동회원 담당자 아이디. 비밀 아님. 팝빌 전용 축 — [KB-KOR-008](./KB-KOR-008_etax_vendor_adapter_contract.md) §14 참조 |
| `api_secret` · `cert_password` | **Password** | `__Auth` 로 감. `get_password()` 로만 읽는다 |
| `enrolled_ceo_name` · `enrolled_biz_type` · `enrolled_biz_class` · `enrolled_corp_name` · `enrolled_addr` · `enrolled_on` | **read_only** | 벤더 등록 **시점 스냅샷**. 원천이 아니다 — 원천은 Company/Customer/Supplier Custom Field(아래 §13-1 정정 ②). drift 탐지용 |
| `force_sandbox` | Check | production→sandbox 방향으로만 작동 |
| `last_verified_on` · `last_verify_message` | read_only | 연결 확인 결과 |

> ⚠ 복합 unique 는 DocType JSON 키로 표현할 수 없다. `on_doctype_update()` 에서 `frappe.db.add_unique` 로 건다 — 코어 선례 [`erpnext/stock/doctype/bin/bin.py`](../../erpnext/stock/doctype/bin/bin.py):251-252.

### 6.1 왜 Single 이 아닌가

1. 사업자등록번호는 Company 단위 값이고 팝빌 연동회원도 사업자등록번호 1:1
2. 한 사이트에 Company 가 여럿일 수 있다 (§2)
3. 나중에 Single→일반으로 옮기면 `__Auth` 행의 `name` 이 DocType 명으로 박혀 **데이터 이전 패치가 따로 필요**하다
4. 코어 선례 `Bank Account` 가 같은 형태

### 6.2 UX 는 합치되 데이터는 분리

Company 가 1개인 대다수 테넌트를 위해 **2층 Single 화면 안에 3층을 child table 로 렌더**해 한 화면처럼 보이게 한다. **데이터 모델은 CorpNum 단위로 분리하고 표현만 합친다.**

### 6.3 가드레일 (필수)

1. 발행 시 반드시 `doc.company` → 3층 레코드 → `CorpNum` 으로 해석한다. 레코드가 없으면 **발행을 차단**한다. **절대 "사이트 기본 CorpNum" 으로 폴백하지 않는다** — 이 폴백이 오발행의 유일한 경로다.
2. `Company` 의 `after_insert`/`on_update` 훅으로 `tax_id` 가 채워진 신규 Company 를 감지해 "연동 미설정" 경고를 띄운다. `erpnext/hooks.py` 의 `doc_events` 에 `"Company"` 키가 없으므로 앱에서 경합 없이 주입 가능하다.

### 6.4 Company Custom Field 로 대신하지 않는 이유

앱이 이미 `nts_codes.get_custom_fields()` 로 Company Custom Field 를 생성하고 있어 "Company 에 붙이면 되지 않나"가 자연스러운 유혹이다. 권하지 않는다 — ① Company 는 전 사용자가 읽는 문서라 권한을 자격증명 단위로 좁힐 수 없다 ② provider 가 둘 이상이면 필드가 곱셈으로 는다 ③ Company 저장 때마다 `korea/common/company.py` 의 on_update 오케스트레이터가 도는데 여기에 자격증명 검증까지 얹으면 책임이 섞인다 ④ `last_verified_on` 같은 운영 메타를 Company 에 붙이는 것은 부적절하다.

> ⚠ **이 논거 네 개는 「자격증명」에 대한 것이며 「공개 기재사항」에는 적용되지 않는다.** 둘을 같은 규칙으로 다루면 §13-1 정정 ② 의 오류가 반복된다.
>
> | | 자격증명 (`api_secret` · `cert_password` · `user_id`) | 공개 기재사항 (대표자성명 · 업태 · 종목) |
> |---|---|---|
> | 비밀인가 | ✅ `__Auth` | ❌ 세금계산서 인쇄양식에 찍히고 합계표에 집계된다 |
> | ① 권한 좁히기 | 필요하다 | **불필요** — 전 사용자가 읽어야 하는 값이다 |
> | ② provider 곱셈 | 성립한다 | **성립하지 않는다** — 벤더를 바꿔도 값이 같다 |
> | ③ 책임 혼재 | 성립한다 | **성립하지 않는다** — 마스터데이터 검증은 Company 훅의 본래 일이다 |
> | ④ 운영 메타 | 성립한다 | **해당 없음** — 운영 메타가 아니다 |
> | 거래처(Customer/Supplier) | Account 레코드가 **없다** | 공급받는자 쪽에도 필요하다 → Custom Field 뿐이다 |
>
> 따라서 자격증명은 이 DocType 에, 공개 기재사항은 Custom Field 에 둔다. 판정 기준은 "비밀인가" 가 아니라 **"세금계산서에 찍히는가"** 다.

---

## 7. 접근 계층

DocType JSON 은 모듈 폴더에 강제되지만 **호출 로직은 [CLAUDE.md](../../CLAUDE.md) 라우팅 2단계대로 `korea/common/` 에 둔다.** 신규 파일 `korea/common/integration.py`:

| 함수 | 규칙 |
|---|---|
| `get_partner_credentials(provider)` | 게이트웨이(또는 `frappe.conf`)만 읽는다. **DB 를 보지 않는다** |
| `get_account(company, provider=None, environment=None)` | 없으면 한국어로 throw. `environment` 를 생략하면 `resolve_environment()` 값을 쓴다. **다른 환경의 행은 조회 결과에서 원천 배제**한다(§13-1 정정 ①) |
| `get_secret(company, provider, fieldname)` | `doc.get_password()` 만 사용. **절대 `doc.api_secret` 을 직접 읽지 않는다**(별표가 나온다) |
| `resolve_environment(company=None)` | site_config 상한 ∧ Single ∧ `force_sandbox` |
| `mask(value)` | 로그·msgprint 용 (앞 2자 + `*`) |
| `verify(company, provider)` | **whitelist 하지 않는다**(권한 우회 방지). `bench execute` 로만 |

> 자격증명을 `frappe.log_error` / `frappe.msgprint` / Error Log 에 원문으로 남기지 않는다 — **Error Log 는 System Manager 가 읽는다.** 요청 전문을 통째로 로깅하지 말고 요청 식별자·HTTP 상태·응답 코드만 남긴다.

---

## 8. 배포 규칙

- **`hooks.py` 의 `fixtures` 에 두 DocType 을 절대 넣지 않는다.** 넣으면 값이 배포물이 되고 fixtures 임포트가 고객 변경분을 경고 없이 덮어쓴다([KB-OPS-001](./KB-OPS-001_tenant_provisioning_deployment.md) §7.2). 프레임워크의 `DISALLOWED_FIXTURE_DOCTYPES` 는 `["DocType","Page"]` 뿐이라 이 실수를 막아주지 않는다.
- `after_migrate` 에서는 Single 문서의 **존재만** 보장하고 값은 채우지 않는다.
- DocType JSON 은 배포 후 **`bench migrate` 가 필요**하다.
- 초기값 주입을 "설정 파일"처럼 다루려면: 테넌트별 seed JSON 을 **SETIVE Backend 저장소/비밀 보관소**(앱 저장소가 아님)에 두고 프로비저닝이 `bench execute ...seed` 로 밀어 넣는다. 이때 JSON 은 **배포 산출물이 아니라 입력**이다 — 이 구분이 §3 (e) 와 갈리는 지점이다.

---

## 9. encryption_key 운영 (가장 자주 사고 나는 곳)

Password 필드는 `__Auth` 테이블에 Fernet 암호화되지만 **그 키(`encryption_key`)가 같은 사이트의 평문 `site_config.json` 에 있다.** 없으면 프레임워크가 **조용히 새 키를 만들어 기록한다.** 즉 DB 덤프 유출만 막아줄 뿐 파일시스템 접근은 막지 못한다.

| 규칙 | 이유 |
|---|---|
| 프로비저닝 시 SETIVE 가 키를 생성해 **비밀 보관소에 기록**하고 `set-config encryption_key` 로 명시 주입 | 자동 생성에 맡기면 DB 를 옮길 때 `__Auth` 와 키가 어긋난다 |
| 백업은 `*-database.sql.gz` 와 `*-site_config_backup.json` 을 **반드시 짝으로** | `.sql.gz` 만 챙기는 것이 표준 사고 경로 |
| 스테이징에 운영 DB 복제 시 **운영 키를 함께 옮기지 않는다.** `__Auth` 행을 비우고 샌드박스 자격증명 재입력 | 키를 같이 옮기면 스테이징이 운영 자격증명을 쥔다 |
| `make reset`(= `docker compose down -v`)은 **개발 전용** | `sites-data` 볼륨을 지워 `encryption_key` 가 영구 소실된다. 운영 compose 에 동일 타깃을 만들지 않는다 |
| 배포 검증에 `integration.verify(company)` 를 넣는다 | 키 불일치는 배포 직후가 아니라 **실제 전송 시점**에 터진다 |

> 이 개발 스택에서 `site_config.json` 은 호스트 bind 가 아니라 **`sites-data` 이름 볼륨 안**에 있어 git·호스트 백업 어디에도 잡히지 않는다.

---

## 10. 포크 규약 "DB 에 코드를 저장하지 않는다" 와 충돌하지 않는다

[CLAUDE.md](../../CLAUDE.md) 의 그 규칙은 대상이 명확하다 — **Client/Server Script**(git 밖의 코드)와 **`custom=1` DocType**(회수 경로 없는 스키마). 판별 기준은 **"git 이 진실의 원천인가"** 다.

| | 원천 | 배포 방향 | 예 |
|---|---|---|---|
| 코드·스키마 | **git** | 배포 → DB | DocType **정의** (`korea_integration_account.json`) |
| 설정·자격증명 | **DB** | **배포로 흘러가면 안 됨** | DocType **인스턴스** (각 회사의 `corp_num`·`api_secret`) |

자격증명은 실행되는 로직이 아니라 테넌트 데이터다. 오히려 규칙과 충돌하는 쪽은 **앱 코드 내 JSON**(§3 (e))이다.

**실무 경계선 하나**: DocType 정의는 git, **그 값은 절대 git 에 올리지 않는다(= fixtures 금지).**

---

## 11. 벤더 교체 시

볼타로 가면 연동회원 계정 계층(ID/Password)이 사라져 3층에서 해당 필드가 빠지고 `issuerId` 로 대체된다. **층 구조 자체는 그대로다** — CorpNum 단위 분리는 벤더가 아니라 **세법이 강제**하기 때문이다.

---

## 12. 검증

```bash
SITE=localhost
COMPOSE=docker/development/docker-compose.yml
X="docker compose -f $COMPOSE exec -T backend bench --site $SITE"

# 1. 환경 상한 규칙 — site_config 를 올리지 않은 채 Settings 만 production 으로 바꿔도 sandbox 여야 한다
$X set-config setive_integration_env sandbox
$X execute setive_erpnext_kr.korea.common.integration.resolve_environment   # → "sandbox"

# 2. Password 필드가 평문으로 새지 않는지
$X execute frappe.client.get_value \
  --kwargs '{"doctype":"Korea Integration Account","filters":{"name":"<name>"},"fieldname":"api_secret"}'
# → 별표 문자열만 반환되어야 한다

# 3. fixtures 로 값이 새지 않는지
$X export-fixtures && git -C ../setive_erpnext_kr status --short
# → Korea Integration * 관련 파일이 나오면 안 된다

# 4. 오발행 가드레일 — 연동 레코드 없는 Company 로 발행 시도 시 차단되는가
$X execute setive_erpnext_kr.korea.common.integration.get_account \
  --kwargs '{"company":"<연동 미설정 회사>"}'    # → 한국어 예외

# 5. 정체성 키 — 같은 회사가 sandbox/production 2행을 가질 수 있어야 한다 (§13-1 정정 ①)
#    같은 (provider, environment, company) 3튜플을 두 번 넣으면 DuplicateEntryError 여야 한다
$X execute frappe.client.get_count \
  --kwargs "{'doctype':'Korea Integration Account','filters':{'company':'<회사명>'}}"
# → sandbox 행 + production 행 = 2

# 6. 복합 unique 인덱스가 실제로 걸려 있는가 — DocType JSON 이 아니라 on_doctype_update() 소관
$X mariadb -e "show index from \`tabKorea Integration Account\` where Non_unique = 0"
# → provider/environment/company 조합 인덱스가 보여야 한다

# 7. 신원 필드가 계정이 아니라 Custom Field 에 있는가 (§13-1 정정 ②)
$X execute frappe.client.get_count \
  --kwargs "{'doctype':'Custom Field','filters':{'fieldname':['in',['setive_ceo_name','setive_biz_type','setive_biz_class']]}}"
# → 9  (3 fieldname × Company·Customer·Supplier 3 DocType)
```

---

## 13. 이전 서술 정정

### 13-1. 2026-09-16

- **① `Korea Integration Account` 의 정체성을 `company` 단일 unique 로 둔 것은 오류였습니다.** §6 은 `autoname: format:{provider}-{company}` 와 *"company 와 corp_num 양쪽에 unique 제약"* 이라고 적었습니다. 이대로면 **한 회사가 팝빌과 국세청 조회 서비스키를 동시에 가질 수 없고**, 같은 회사의 sandbox 행과 production 행도 공존할 수 없습니다. 팝빌은 테스트/운영 연동회원이 서로 **존재하지 않는 별개 레코드**이므로([KB-KOR-006](./KB-KOR-006_etax_invoice_integration.md):373) 환경은 정체성 축입니다. 정정: **(provider, environment, company) 복합**. `corp_num` 도 단일 unique 를 풀고 `(provider, environment, corp_num, branch_code)` 복합으로 갑니다 — 본점과 종사업장 Company 는 **같은 사업자등록번호**를 공유합니다.
  `environment` 를 나중에 넣으면 전 행 rename 과 `__Auth`(docname 키) 이관 패치가 붙으므로 **지금 넣습니다.** 같은 이유로 `autoname` 을 `format:` 으로 두지 않습니다 — ERPNext 는 Company rename 을 허용하는데 `name` 은 생성 시점 1회로 고정되어 `popbill-production-구회사명` 이 영구히 남습니다. `naming_series:` 로 채번하고 정체성은 unique 인덱스로 강제합니다. 함께 정정: §7 의 `get_account(company, provider=None)` 시그니처에 `environment` 가 없었습니다.

- **② `biz_type` · `biz_class` · `ceo_name` 을 `Korea Integration Account` 필드로 둔 것은 오류였습니다.** §6 은 이 셋을 *"`joinMember` 필수인데 Company 에 없는 필드"* 로 계정에 담았습니다. 두 가지가 틀렸습니다. 첫째, **이 셋은 벤더 산출물이 아니라 세금계산서 기재사항**입니다 — 전자세금계산서 XML 이 상호·대표자성명을 `1..1` 로 요구하고([ONT-ENT-002](../ontology/ONT-ENT-002_korean_tax_party_and_transaction_axes.md):149) 벤더를 바꿔도 값이 같습니다. 둘째, **거래처(Customer/Supplier)에는 `Korea Integration Account` 레코드 자체가 없어** 공급받는자 쪽 기재사항을 담을 곳이 없습니다. 정정: 원천을 **Company/Customer/Supplier 의 Custom Field**(`setive_ceo_name` · `setive_biz_type` · `setive_biz_class`)로 옮기고, 계정에는 **벤더 등록 시점 스냅샷만 read-only** 로 남깁니다(`enrolled_*`). 스냅샷이 필요한 이유는 팝빌 회신 때문입니다 — *"사업자 정보가 변경될 경우 … 모든 연동 환경이 새롭게 재설정됩니다"*([KB-OPS-003](./KB-OPS-003_popbill_partner_onboarding.md):41). 현재값만 있으면 재등록이 필요한 상태인지 알 수 없습니다. 함께 정정: §1 요약표 3행의 *"사업자번호 단위 값 (CorpNum, 연동회원 상태, 인증서 상태)"* 에서 **업태·종목은 빠집니다.**
  필드 정의와 산술은 [KB-KOR-003](./KB-KOR-003_company_hook_tax_nts.md) §7.4, 설계 근거는 [KB-KOR-008](./KB-KOR-008_etax_vendor_adapter_contract.md) §8.

---

## 14. 알려진 한계

- 1층의 **중앙 게이트웨이가 아직 없다.** 게이트웨이 구축 전까지는 과도기 절충(§4)을 쓰며, 그 상태에서는 파트너 키가 테넌트 사이트에 존재한다.
- `Korea Integration Settings` / `Korea Integration Account` 는 **아직 구현되지 않았다.** 이 문서는 설계이며 필드명은 구현 시 확정된다.
- Frappe 의 `__Auth` 암호화는 **DB 덤프 유출만** 막는다. 파일시스템 접근 권한을 가진 주체로부터는 보호하지 못한다.
- 테넌트가 ERPNext UI 에서 Company 를 추가로 만드는 것을 **막을 방법이 없다.** §6.3 의 감지·경고가 유일한 방어이며, 이는 예방이 아니라 탐지다.
