---
id: KB-OPS-001
title: 테넌트 프로비저닝·배포 파이프라인 (SETIVE Backend 참조)
domain: 운영·배포
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16.33.0
  - docker/development/docker-compose.yml
verified_on: 2026-09-04
verified_by: v16.33 소스 확인 + 개발 컨테이너 실측(라이브 API 호출·migrate 전후 비교)
related: [KB-DEV-001, KB-ARCH-001, KB-LOC-002, KB-KOR-003]
---

# KB-OPS-001: 테넌트 프로비저닝·배포 파이프라인

SETIVE Backend가 테넌트 사이트를 프로비저닝하고 변경분을 배포할 때 참조하는 문서입니다.
AI 에이전트가 ERPNext API로 만든 산출물을 어떻게 회수하고 배포하는지, 무엇이 반영되고 무엇이 조용히 누락되는지를 다룹니다.

---

## 1. 배포 단위

테넌트 저장소에 배포되는 것은 **앱 2개**입니다.

| 앱 | 출처 | 배포 대상 | 역할 |
|---|---|---|---|
| `frappe` | 컨테이너 이미지 내장 | ❌ 아님 | 프레임워크. 이미지 태그로만 갱신 |
| `erpnext` | 이 저장소(SETIVE 포크) | ✅ | ERPNext 본체 + 한국 계정과목표 |
| `setive_erpnext_kr` | 별도 저장소 | ✅ | 한국화·테넌트 커스터마이징 전체 |

`frappe`는 배포 대상이 아닙니다. [`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml)이 `frappe/erpnext:v16.33.0` 이미지를 쓰고, 그 위에 이 저장소를 `apps/erpnext` 자리에 바인드 마운트합니다. **`frappe` 코드는 이미지 태그를 올릴 때만 바뀝니다** — git 병합 정책과 무관한 별도 유입 경로입니다.

### 1.1 저장소 구성 — 두 앱이 함께 배포된다

두 앱은 **별개의 git 저장소**이며, 테넌트 환경에 **함께** 배치돼야 합니다. 하나만 배포하면 동작하지 않습니다.

```
<테넌트 체크아웃 루트>/
├── setive-oss-erpnext-16.33/     ← 앱 1: ERPNext 포크 (저장소 A)
│   └── docker/development/docker-compose.yml
└── setive_erpnext_kr/            ← 앱 2: 한국화 앱 (저장소 B)
```

두 폴더는 **형제 관계**여야 합니다. compose의 마운트 경로가 상대경로로 형제 폴더를 가리키기 때문입니다.

컨테이너 내부에서는 이렇게 배치됩니다.

```
/home/frappe/frappe-bench/apps/
├── frappe/              ← 이미지 내장 (배포 대상 아님)
├── erpnext/             ← 저장소 A 가 마운트됨
└── setive_erpnext_kr/   ← 저장소 B 가 마운트됨
```

Frappe 관점에서 이 셋은 **동등한 앱**입니다. `erpnext`가 특별 취급되지 않습니다.

### 1.2 compose 마운트 지점은 3곳

[`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml)에서 `apps/erpnext` 마운트가 선언된 위치마다 앱 마운트를 함께 추가해야 합니다. 실측 기준 3곳입니다.

| 위치 | 대상 |
|---|---|
| `x-backend-defaults` 앵커 | backend, queue-short, queue-long, scheduler, websocket |
| `configurator` 서비스 | 초기화 컨테이너 |
| `frontend` 서비스 | nginx |

```yaml
- ../../:/home/frappe/frappe-bench/apps/erpnext
- ../../../setive_erpnext_kr:/home/frappe/frappe-bench/apps/setive_erpnext_kr
```

`../../`는 저장소 A의 루트, `../../../`는 그 부모(= 두 저장소의 공통 부모)를 가리킵니다.

**앵커에만 추가하고 `frontend`를 빠뜨리면** 백엔드는 정상인데 정적 자산 경로가 어긋납니다.

### 1.3 `apps.txt`는 configurator가 자동 생성한다

`sites/apps.txt`를 수동으로 편집할 필요가 없습니다. configurator의 entrypoint 첫 줄이 다음을 실행합니다.

```
ls -1 apps > sites/apps.txt;
```

마운트를 추가하고 스택을 재기동하면 앱이 자동 등재됩니다. 실측으로 확인했습니다.

### 1.4 앱은 bench 가상환경에 pip 설치돼야 한다 ★

**마운트만으로는 동작하지 않습니다.** 앱이 파이썬 패키지로 설치돼 있어야 `bench`가 import할 수 있습니다.

컨테이너에는 파이썬이 **두 개** 있습니다.

| 경로 | 용도 |
|---|---|
| `/usr/local/bin/python` | 시스템 파이썬. `bench` 실행파일 자체 |
| `/home/frappe/frappe-bench/env/bin/python` | **bench 가상환경. 사이트 명령이 실제로 쓰는 것** |

`pip install`을 시스템 파이썬에 하면 `python -c "import setive_erpnext_kr"`은 성공하지만 `bench --site ... install-app`은 `ModuleNotFoundError`로 실패합니다. 실측으로 재현했습니다.

```bash
# 파이썬 코드를 로드하는 컨테이너 전부에 설치
for SVC in backend queue-short queue-long scheduler; do
  docker compose -f "$COMPOSE" exec -T "$SVC" \
    /home/frappe/frappe-bench/env/bin/pip install -q -e apps/setive_erpnext_kr
done
```

**이 설치는 컨테이너 레이어에 기록되므로 컨테이너를 재생성하면 소실됩니다.** `apps/`는 바인드 마운트라 소스는 남지만 `site-packages`의 링크는 사라집니다.

→ 운영 환경에서는 매번 pip 설치를 반복하는 대신 **앱을 포함한 커스텀 이미지를 빌드**하는 것이 정석입니다(frappe_docker의 layered build). 개발 환경에서는 컨테이너 재생성 시마다 위 명령을 반복해야 합니다.

### 1.5 앱 이름 규칙

앱 이름은 **파이썬 모듈명**이 되므로 소문자와 언더스코어만 씁니다.

```
setive_erpnext_kr     ✅
SETIVE-ERPNEXT-KR     ❌  하이픈·대문자는 import 불가
```

앱 이름은 사후 변경 비용이 매우 큽니다. 폴더명·패키지명·`Module Def.app_name`·fixtures 경로에 모두 박히고, 이미 배포된 테넌트 DB에도 기록됩니다.

### 1.6 앱 등재 확인

앱 소스를 배치하는 것만으로는 인식되지 않습니다. `sites/apps.txt`에 등재돼야 합니다.

현재 개발 사이트 상태:

```
erpnext
frappe
```

`setive_erpnext_kr`을 추가하고 `bench install-app`을 1회 실행해야 사이트에 설치됩니다.

---

## 2. 상태는 두 곳에 저장된다

배포 파이프라인 설계의 전제입니다.

```
   [ 파일 ]                              [ DB ]
   앱 폴더의 .json/.py/.js               MariaDB
   git 관리 · 배포 대상                   런타임에 동작하는 실체
        │                                     │
        │  ── bench migrate ─────────▶        │  파일을 DB에 반영
        │                                     │
        │  ◀──── export ──────────────        │  DB를 파일로 회수
```

- **`bench migrate`** — 파일 → DB. 이 단계가 없으면 배포된 파일은 런타임에 영향을 주지 않습니다.
- **재기동(restart)** — 파이썬 프로세스 교체. **DB 상태를 변경하지 않습니다.**
- **export** — DB → 파일. 에이전트 산출물을 git으로 회수하는 유일한 경로.

실측: DocType `.json`이 디스크에 존재하고 컨테이너가 44시간 연속 가동 중인 상태에서 해당 DocType이 DB에 없었습니다. 컨테이너 기동 스크립트(`/usr/local/bin/start.sh` 등)에 `bench migrate` 호출이 없습니다.

---

## 3. 에이전트 산출물은 두 종류다

에이전트가 ERPNext API로 만드는 객체는 **파일이 자동 생성되는 것**과 **DB에만 남는 것**으로 갈립니다. 회수 절차가 다르므로 반드시 구분해야 합니다.

| 산출물 | 파일 자동 생성 | 회수 방법 |
|---|---|---|
| 표준 DocType (`custom=0`) | ✅ `developer_mode=1`일 때 | 불필요 (저장 시 앱 폴더에 기록) |
| Custom Field | ❌ | `export_customizations` |
| Property Setter | ❌ | `export_customizations` |
| Workflow | ❌ | `export-fixtures` |
| Client Script / Server Script | ❌ | 권장하지 않음 (§7.4) |
| Custom DocType (`custom=1`) | ❌ | **회수 경로 없음** (§7.5) |

실무에서 에이전트가 가장 많이 생성하는 것은 Custom Field·Property Setter·Workflow이며, **이들은 파일이 전혀 생기지 않습니다.**

측정 방법 — DB에만 존재하는 항목 수를 세는 드리프트 검사:

```bash
bench --site "$SITE" execute frappe.client.get_count --kwargs "{'doctype':'Custom Field'}"
bench --site "$SITE" execute frappe.client.get_count --kwargs "{'doctype':'Property Setter'}"
```

개발 사이트 실측 시점(2026-09-04)에 파일로 회수되지 않은 항목이 135건 확인됐습니다. 회수하지 않은 항목은 컨테이너 재생성이나 신규 테넌트 복제 시 유실됩니다.

---

## 4. 회수(export) 명령

`$SITE`는 테넌트 사이트명, `$APP`은 `setive_erpnext_kr`입니다.

### 4.1 Custom Field · Property Setter

```bash
bench --site "$SITE" execute frappe.modules.utils.export_customizations \
  --kwargs '{"module":"<모듈명>","doctype":"<대상 DocType>","sync_on_migrate":True}'
```

산출물: `<app>/<module>/custom/<doctype>.json`

**`sync_on_migrate:True`는 필수입니다.** 기본값이 `False`이며, 누락하면 파일은 정상 생성·커밋되지만 배포 후 `bench migrate`가 그 파일을 읽지 않습니다. 오류도 로그도 남지 않습니다.

이 함수는 `developer_mode=1`을 요구합니다(`Only allowed to export customizations in developer mode`). 따라서 **운영 테넌트에서 직접 실행할 수 없고 저작/스테이징 환경에서 수행해야 합니다** (§6).

v16에는 `bench export-customizations` CLI가 없습니다. 위와 같이 `bench execute`로 호출합니다.

### 4.2 Workflow

```bash
bench --site "$SITE" export-fixtures --app "$APP"
```

Workflow는 `fixtures` 경로만 유효합니다. `bench export-doc`으로 내보내면 파일은 생성되지만 `bench migrate`가 해당 파일을 읽지 않아(`IMPORTABLE_DOCTYPES`에 미포함) 영구히 반영되지 않습니다.

Workflow 회수 시 함께 내보내야 하는 것:
- `Workflow State`, `Workflow Action Master`
- 대상 DocType에 자동 생성되는 `workflow_state` Custom Field

### 4.3 표준 DocType

`developer_mode=1`에서는 저장 시점에 앱 폴더로 자동 기록되므로 별도 명령이 불필요합니다. 명시적으로 다시 뽑으려면:

```bash
bench --site "$SITE" export-doc "DocType" "<DocType 이름>"
```

`export-doc`은 `developer_mode`를 검사하지 않아 운영에서도 동작합니다.

**저장 위치는 사람이 지정할 수 없고 `Module Def`가 결정합니다.** 산출물이 `setive_erpnext_kr`로 가려면 다음 세 가지가 선행돼야 합니다.

1. 앱의 `modules.txt`에 모듈 등재
2. `app_name=setive_erpnext_kr`, `custom=0`인 `Module Def` 존재
3. 대상 문서의 `module` 필드가 그 모듈을 가리킴

이 설정이 없으면 산출물이 `erpnext` 포크나 `frappe` 코어 폴더에 기록됩니다.

---

## 5. 배포 파이프라인

### 5.0 신규 앱 최초 설치 (1회)

2026-09-04 개발 환경에서 실제로 수행한 순서입니다.

```bash
COMPOSE=docker/development/docker-compose.yml
APP=setive_erpnext_kr
SITE=localhost

# 1. 앱 생성 (저작 환경에서 1회). 프롬프트: Title / Description / Publisher / Email
#    / License(소문자 슬러그) / GitHub Workflow(y/N)
docker compose -f "$COMPOSE" exec -T backend bench new-app "$APP" --no-git

# 2. 호스트 형제 폴더로 복사 (컨테이너 apps/ 는 볼륨이 아니므로 재생성 시 소실)
CID=$(docker compose -f "$COMPOSE" ps -q backend)
docker cp "$CID:/home/frappe/frappe-bench/apps/$APP" ../$APP

# 3. compose 마운트 3곳 추가 (§1.2) 후 스택 재기동 → apps.txt 자동 갱신 (§1.3)
docker compose -f "$COMPOSE" up -d

# 4. bench 가상환경에 pip 설치 (§1.4) — 이 단계 누락이 가장 흔한 실패
for SVC in backend queue-short queue-long scheduler; do
  docker compose -f "$COMPOSE" exec -T "$SVC" \
    /home/frappe/frappe-bench/env/bin/pip install -q -e "apps/$APP"
done

# 5. 사이트에 설치
docker compose -f "$COMPOSE" exec -T backend bench --site "$SITE" install-app "$APP"

# 6. 캐시 + 재기동 (생략 시 gunicorn 워커가 옛 프로세스라 HTTP 500)
docker compose -f "$COMPOSE" exec -T backend bench --site "$SITE" clear-cache
docker compose -f "$COMPOSE" restart backend queue-short queue-long scheduler frontend
```

**6단계를 생략하면 사이트 전체가 HTTP 500이 됩니다.** `install-app`은 성공했는데 실행 중인 gunicorn 워커가 새 모듈을 모르는 상태이며, 로그에는 `ModuleNotFoundError: No module named '<app>'`가 남습니다. 실측으로 재현·복구했습니다.

### 5.1 순서 (역순 금지)

```bash
# 0. 사전 드리프트 검사 — DB에만 있는 미회수 항목이 있으면 배포 중단
# 1. 소스 배포                     ★ migrate보다 반드시 먼저
# 2. bench --site $SITE install-app $APP     (신규 앱 최초 1회)
# 3. bench --site $SITE migrate              ★ 생략 시 1의 결과가 반영되지 않음
# 3a. 앱 설치 전에 만든 Company 가 있으면 한국화 백필 (사이트당 회사마다 1회, 멱등)
#     bench --site $SITE execute setive_erpnext_kr.korea.common.company.backfill --kwargs "{'company':'<회사명>'}"
# 4. 번역 컴파일 (변경 시)
# 5. bench --site $SITE clear-cache
# 6. 컨테이너 재기동 (§5.3)
# 7. 사후 검증 — 파일에 있고 DB에 없는 항목 0건 확인
```

**1과 3의 순서를 바꾸면 데이터가 삭제됩니다** (§7.1).

**3a는 기존 사이트에 앱을 나중에 설치했을 때만 필요합니다.** 앱의 한국화 설정(Company 기본계정·창고 계정·부가세 템플릿·국세청 표준코드)은 `Company.on_update` 훅으로 적용되므로 앱 설치 후 만든 회사는 자동으로 처리되지만, 설치 전에 만든 회사는 훅이 돌지 않은 상태로 남습니다. `backfill` 은 빈 값만 채우는 멱등 명령이라 이미 적용된 회사에 다시 실행해도 변경이 없습니다. 3(migrate)보다 뒤여야 합니다 — `after_migrate` 가 만드는 Custom Field 가 없으면 표준코드 단계가 throw 합니다. 절차·결과 해석은 [KB-KOR-003 §8](./KB-KOR-003_company_hook_tax_nts.md) 을 봅니다.

번역 컴파일은 개발 환경에서 [`Makefile`](../../Makefile)의 `make po`가 수행하는 것과 같은 절차입니다 (KB-DEV-001, KB-LOC-002). 앱별로 지정하려면:

```bash
bench --site "$SITE" execute frappe.gettext.translate.compile_translations \
  --kwargs "{'target_app':'$APP','locale':'ko','force':True}"
```

### 5.2 변경 유형별 필요 조치

라이브 컨테이너에 변경을 주입하고 재기동 전후를 비교해 측정했습니다.

| 변경 대상 | 재기동만으로 반영 | 필요한 조치 |
|---|---|---|
| `.py` 로직 | ✅ | 재기동 |
| `hooks.py` 값 | ✅ | 재기동 |
| DocType 폴더의 `.js` | ✅ (재기동도 불필요) | 없음 / `clear-cache` |
| DocType `.json` | ❌ | `bench migrate` |
| `fixtures/*.json` | ❌ | `bench migrate` |
| `<module>/custom/*.json` | ❌ | `bench migrate` + 파일에 `sync_on_migrate:1` |
| `scheduler_events` 훅 | ❌ (부분) | 재기동 + `bench migrate` |
| `locale/*.po` | ❌ | `compile_translations` + `clear-cache` |
| `public/js/*.bundle.js` | ❌ | `bench build` — **현 이미지에 node 미포함으로 실행 불가** (§8.1) |
| 신규 앱 | ❌ | `apps.txt` 등재 → `install-app` → `migrate` → 재기동. 기존 Company 가 있으면 `backfill` (§5.1 3a) |

`scheduler_events`는 재기동 시 훅 자체는 로드되지만 `Scheduled Job Type` 레코드가 생성되지 않아 배치가 실행되지 않습니다. 오류가 발생하지 않으므로 탐지가 어렵습니다.

### 5.3 재기동 대상

파이썬 코드를 로드하는 컨테이너는 4개이며, **`frontend`를 반드시 포함**해야 합니다.

```bash
docker compose -f <compose> restart backend queue-short queue-long scheduler frontend
```

`backend` 컨테이너를 재생성하면 컨테이너 IP가 바뀝니다. `frontend`의 nginx가 이전 upstream 주소를 유지하면 백엔드가 정상이어도 외부 요청이 502로 실패합니다. 실측 중 재현됐습니다.

---

## 6. developer_mode — 환경별 설정

| | `developer_mode = 1` | `developer_mode = 0` |
|---|---|---|
| 표준 DocType API 수정 | 가능 + 파일 자동 생성 | 차단 (HTTP 417 `CannotCreateStandardDoctypeError`) |
| Custom Field / Property Setter | 가능 | **가능** |
| Workflow | 가능 | **가능** |
| `export_customizations` | 가능 | 차단 |

`developer_mode`는 단일 스위치가 아니라 개발 프로파일 전체를 켭니다. 소스 확인 결과 다음이 함께 활성화됩니다.

- 예외 발생 시 스택트레이스가 클라이언트로 노출
- OAuth `redirect_uri`의 https 강제 해제
- meta·hooks·assets·website 캐시 비활성
- 프론트엔드의 DocType 편집 잠금 해제

### 권장 배치

| 환경 | `developer_mode` | 에이전트 허용 범위 |
|---|---|---|
| 저작(빌드/스테이징) | `1` | 표준 DocType 설계, `export_customizations` |
| 테넌트 운영 | `0` | Custom Field, Property Setter, Workflow |

운영에서 `0`으로 두면 표준 스키마 손상이 프레임워크 레벨에서 차단됩니다.

**현재 개발 스택은 `1`입니다.** [`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml)의 configurator가 매 기동 시 `bench set-config -g developer_mode 1`을 실행하며, 값은 `sites/localhost/site_config.json`이 아니라 `sites/common_site_config.json`에 기록됩니다. **배포용 compose를 작성할 때 이 라인을 제외해야 합니다.**

`developer_mode=1` 상태에서 DocType을 저장하면 요청하지 않은 필드(`row_format`, `modified`, 파일 끝 개행 등)까지 재작성되어 소스에 불필요한 diff가 발생합니다.

---

## 7. 실패 모드와 방어

### 7.1 migrate가 DocType을 삭제한다

DB에 존재하고 소스 파일이 없는 표준 DocType은 `bench migrate`의 `remove_orphan_doctypes`가 강제 삭제합니다. 실측 중 재현됐습니다.

```
❌ migrate → 파일 배포     DocType이 먼저 삭제됨
✅ 파일 배포 → migrate
```

**부가 위험:** DocType 정의를 삭제해도 물리 테이블은 남습니다(`DROP TABLE` 미수행). 이후 같은 이름으로 재생성하면 이전 컬럼과 데이터가 조회됩니다. 실측으로 확인했습니다.

→ **신규 테넌트는 반드시 `bench new-site`로 빈 DB에서 시작합니다.** 기존 테넌트 DB를 복제해 신규 테넌트를 만들면 테넌트 간 데이터 격리가 깨질 수 있습니다.

### 7.2 배포가 에이전트 작업을 무음 롤백한다

fixtures 임포트는 `force=True`로 동작하며, DB 레코드가 파일보다 최신이어도 덮어씁니다. 경고·로그·예외가 없습니다.

반대로 **fixture 파일에서 항목을 제거해도 대상 DB에서는 삭제되지 않습니다.** `git revert`로 롤백되지 않으므로, 삭제는 SETIVE가 별도 패치로 처리해야 합니다.

### 7.3 migrate는 실패해도 exit 0을 반환한다

fixture 임포트 코드가 `DoesNotExistError`를 `print`로 처리하고 다음 파일로 진행합니다. 파일 하나에 항목 50개가 있고 그중 1개가 미존재 DocType을 참조하면 50개 전부 임포트되지 않으나 종료코드는 0입니다.

→ **SETIVE Backend는 종료코드에 의존하지 말고 stdout에서 `"Skipping fixture syncing"` 문자열을 검출해 실패로 처리합니다.**

### 7.4 Client Script / Server Script

DB에 저장되는 JavaScript/Python은 git 관리 밖의 코드입니다. 에이전트에게 생성 권한을 부여하지 않습니다. `Server Script` 레코드 생성만으로 해당 DocType의 저장이 실패하는 사례를 실측했습니다.

### 7.5 Custom DocType (`custom=1`)

앱 폴더로 export되지 않고 fixtures로도 내보낼 수 없습니다(`DISALLOWED_FIXTURE_DOCTYPES`). 생성되면 해당 테넌트에 고립됩니다. **에이전트에게 `custom=1` DocType 생성을 허용하지 않습니다.**

### 7.6 멱등성

프레임워크는 같은 label에 다른 fieldname을 갖는 Custom Field를 차단하지 않습니다. 동일 요청을 두 번 처리하면 `tax_id`와 `tax_id_1`이 같은 라벨로 공존합니다. 실측으로 확인했습니다.

에이전트 도구 설계 규칙:

- Custom Field는 `frappe.get_doc({...}).insert()` 대신 `create_custom_field()` 헬퍼 사용 (멱등)
- Property Setter는 `make_property_setter()` 사용
- Customize Form 경로를 모사할 때는 `is_custom_field=1`을 명시 (누락 시 무시됨)
- 도구 레벨에서 `(doctype, label)` 사전 조회로 중복 생성을 차단

### 7.7 동시성

조사 중 복수 에이전트가 같은 사이트를 동시에 조작해 상호 산출물이 삭제되는 사고가 발생했습니다.

- 에이전트 작업은 **테넌트 사이트 단위로 직렬화(락)** 합니다.
- 전용 서비스 계정으로만 API를 호출해 `owner`/`modified_by`로 변경 주체를 추적합니다.
- 정리 작업에서 **와일드카드 삭제를 금지**합니다.

### 7.8 회수 누락 방지

회수는 이름 기반이 아니라 **시각 기반**으로 수행합니다. 작업 시작 시각 `t0`를 기록하고 `modified >= t0`인 레코드를 수집하면, Workflow 생성 시 자동 생성되는 Custom Field 같은 부수 산출물까지 포착됩니다.

---

## 8. 미해결 사항

### 8.1 erpnext 번들 JS 404 — 해결됨 (2026-09-04)

**증상:** 이 저장소를 `apps/erpnext`에 바인드 마운트하면 이미지에 포함된 `erpnext/public/dist`(1.8M)가 가려집니다. `assets.json`이 참조하는 번들이 전부 404이고, 컨테이너에 node/npm이 없어 `bench build`로 재생성할 수도 없습니다.

측정:

```bash
# 이미지에는 존재
docker run --rm frappe/erpnext:v16.33.0 \
  du -sh /home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
# → 1.8M

# 마운트된 컨테이너에는 부재
docker compose -f "$COMPOSE" exec -T backend ls apps/erpnext/erpnext/public/dist
# → No such file or directory
```

**해결:** `dist`만 named volume으로 분리했습니다. Docker는 빈 named volume을 최초 마운트할 때 이미지 레이어의 해당 경로 내용을 볼륨으로 복사하므로, 바인드 마운트가 가린 자산이 되살아납니다. `locale-data` 볼륨과 같은 기법입니다.

```yaml
# apps/erpnext 마운트 뒤에 와야 덮어쓴다. 마운트 지점 3곳 모두에 추가
- erpnext-dist:/home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
```

**이미지 태그를 올린 뒤에는 이 볼륨을 삭제해야 새 자산이 반영됩니다.**

```bash
docker volume rm setive-erp-dev_erpnext-dist
```

검증: `/assets/erpnext/dist/js/erpnext.bundle.*.js` 및 `.css` 모두 HTTP 200.

### 8.2 클라이언트 JS 배치 권장

`bench build` 의존을 피하려면 클라이언트 스크립트를 `public/js/*.bundle.js`가 아니라 **DocType 폴더의 `.js` 또는 `doctype_js` 훅**으로 배치합니다.

### 8.3 fixtures 선언 규칙

앱 `hooks.py` 작성 시:

- `fixture_auto_order = True`를 초기부터 설정. 같은 doctype을 두 번 선언하면 파일명이 충돌해 후자가 전자를 덮어씁니다(실측 확인).
- `fixtures` 선언에 **filters를 반드시 지정**합니다. 필터 없는 `"Property Setter"` 선언은 프레임워크 기본 항목까지 전부 수집합니다.

### 8.4 확인 필요

- 실제 프로덕션용 compose는 이 조사 범위 밖입니다. configurator의 `developer_mode=1` 라인 제외 여부와 번역 컴파일 수행 여부를 배포용 compose에서 직접 확인해야 합니다.
- `developer_mode` 운영 사용에 대한 Frappe 공식 문서 권고 원문은 미확인입니다. 본 문서의 서술은 v16.33 소스와 라이브 컨테이너 실측에 근거합니다.

---

## 9. 검증

`$SITE`, `$COMPOSE`를 환경에 맞게 지정합니다.

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
EXEC="docker compose -f $COMPOSE exec -T backend"

# developer_mode 실효값 (site_config 가 아니라 common_site_config 확인)
$EXEC cat sites/common_site_config.json

# 설치된 앱
$EXEC cat sites/apps.txt

# DB에만 존재하는 커스터마이징 건수
$EXEC bench --site $SITE execute frappe.client.get_count --kwargs "{'doctype':'Custom Field'}"
$EXEC bench --site $SITE execute frappe.client.get_count --kwargs "{'doctype':'Property Setter'}"

# 기동 스크립트에 migrate 호출이 없음을 확인
$EXEC grep -rn "bench migrate" /usr/local/bin/ ; echo "exit=$?"

# 앱이 bench 가상환경에 설치돼 있는지 (시스템 파이썬이 아니라 env)
$EXEC /home/frappe/frappe-bench/env/bin/python -c "import setive_erpnext_kr; print('OK')"

# 사이트 응답
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/
```

---

## 10. 이전 서술 정정

- **`developer_mode`가 꺼져 있다는 최초 판단은 오류였습니다.** `sites/localhost/site_config.json`만 확인한 결과이며, 실제 값은 `sites/common_site_config.json`의 `"developer_mode": 1`입니다. 설정 확인은 반드시 `common_site_config.json`을 함께 봐야 합니다.
- **`sites/apps.txt` 수동 편집이 필요하다는 초기 서술을 철회합니다.** configurator entrypoint의 `ls -1 apps > sites/apps.txt`가 자동 생성하므로, 마운트 추가 후 스택 재기동만으로 등재됩니다 (§1.3).
- 초판은 **앱의 pip 설치 단계를 누락**했습니다. 마운트와 `apps.txt` 등재만으로는 `bench`가 앱을 import하지 못합니다. §1.4로 보강했습니다.
- §5.1 초판은 `install-app` → `migrate` 만으로 배포가 끝나는 것처럼 읽혔습니다. 앱의 Company 훅은 회사 저장 시에만 실행되므로 **앱 설치 전에 만든 회사에는 한국화 기본값이 적용되지 않습니다.** 3a 단계(`backfill`)를 추가했습니다 (2026-09-06, KB-KOR-003 §8 실측).
