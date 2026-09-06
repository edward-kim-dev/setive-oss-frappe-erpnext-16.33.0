# CLAUDE.md — SETIVE ERPNext 포크

AI 에이전트가 이 저장소에서 작업할 때 따르는 규약입니다.
**커스터마이징을 어디에 쓸 것인가**가 이 문서의 핵심입니다.

관련 문서: [`docs/kb/KB-OPS-001`](docs/kb/KB-OPS-001_tenant_provisioning_deployment.md) (배포 파이프라인), [`docs/README.md`](docs/README.md) (문서 체계)

---

## 이 저장소가 무엇인가

이 폴더 **전체가 ERPNext 앱 하나**입니다. 프로젝트 폴더가 아닙니다.
컨테이너의 `apps/erpnext` 자리에 통째로 바인드 마운트됩니다.

```
<체크아웃 루트>/
├── setive-oss-erpnext-16.33/   ← 여기 (ERPNext 포크)
└── setive_erpnext_kr/          ← 형제 폴더 (한국화 앱). 대부분의 작업은 여기서 한다
```

`frappe`는 컨테이너 이미지에 내장되어 있고 이 저장소에 없습니다. 수정 대상이 아닙니다.

---

## 라우팅 규칙

요청을 받으면 아래를 **위에서부터** 검사하고, 처음 "가능"이 나오는 층에서 멈춘다.
아래로 내려갈수록 비용이 커진다.

### 0단계 — 코드가 필요한가?

필드 추가/숨김/필수여부/라벨/기본값/승인흐름/목록필터
→ **Customize Form · Property Setter · Workflow** 로 처리한다.

> ⚠️ 처리 후 반드시 `export_customizations` 또는 `export-fixtures` 로 앱에 회수하고 커밋한다.
> 회수하지 않은 DB 변경은 컨테이너 재생성 시 소실되며, 이후 어떤 에이전트도 grep으로 찾지 못한다.
> 명령은 KB-OPS-001 §4 참조. `sync_on_migrate:True` 를 빠뜨리면 배포해도 반영되지 않는다.

### 1단계 — 이 테넌트만의 요구인가?

→ `setive_erpnext_kr/korea/tenant/`

### 2단계 — 한국 공통 기능인가?

→ `setive_erpnext_kr/korea/common/`

세금계산서·원천징수·4대보험·한국 리포트·번역. hooks 로 도달 가능하면 전부 여기다.

```
doc_events / override_whitelisted_methods / override_doctype_class /
extend_doctype_class / doctype_js / fixtures / after_migrate /
permission_query_conditions / has_permission / regional_overrides
```

`erpnext/hooks.py` 의 `doc_events` 에는 `"Company"` 키가 **없다**. 경합 없이 쓸 수 있는 가장 깨끗한 주입 지점이다.

### 3단계 — 위 어디로도 안 되면 → 사람에게 에스컬레이션

코드를 고치지 말고 멈춘다. 다음 4조건을 **모두** 만족할 때만 사람이 포크 수정을 승인한다.

- (A) 앱 확장점으로 물리적으로 도달 불가
- (B) 전 테넌트 공통 변경
- (C) upstream 저변동 파일
- (D) 사람이 리뷰하고 단독 커밋으로 추적

**에이전트는 (A)~(D)를 스스로 판정하지 않는다. 근거만 제시하고 멈춘다.**

---

## 포크 수정이 허용되는 확정 예외

앱으로 불가능함이 코드로 확인된 지점이다. 이외의 포크 수정은 3단계를 거친다.

| 대상 | 이유 |
|---|---|
| `erpnext/accounts/doctype/account/chart_of_accounts/verified/kr_*.json` | `get_chart` / `get_charts_for_country` 가 `os.path.dirname(__file__)` 하위만 스캔한다. 설치된 앱을 순회하지 않으므로 앱에서 계정과목표를 주입할 수 없다. **신규 파일 추가만** 해당한다 |

### `erpnext/locale/ko.po` 는 예외가 아니다 — 앱에 쓴다

`crowdin.yml` 이 `/erpnext/locale/%two_letters_code%.po` 를 관리한다. 번역 봇이 이 파일을 통째로 덮어쓰는 PR 을 주기적으로 보낸다(최근 1년 15회).

→ 번역은 `setive_erpnext_kr/locale/ko.po` 에 쓴다. 설치 앱 순회에서 **나중 앱이 이기므로**(`required_apps = ["erpnext"]` 로 순서 보장) erpnext 번역을 덮어쓴다. 실측 검증됨.

`erpnext/locale/main.pot` 은 crowdin 이 읽는 source 이며 봇이 쓰지 않는다. 포크의 `__()` 호출에서 추출되는 결과이므로 포크에 유지한다.

규약 전문·리베이스 시 `main.pot` 충돌 해소 절차는 [`docs/kb/KB-LOC-003`](docs/kb/KB-LOC-003_fork_local_translation.md).

---

## 금지 사항

### `erpnext/hooks.py` 를 수정하지 않는다
upstream 최근 1년 커밋 **55회**. 리베이스 충돌의 주범이다. 훅이 필요하면 앱의 `hooks.py` 에 쓴다. Frappe 가 앱별 hooks 를 병합한다.

> ⚠️ **현재 이 규칙을 어기는 코드가 남아 있다 (미결).** `erpnext/hooks.py:67` 의 `after_migrate` 1줄과 `erpnext/setup/install.py` 의 `configure_target_languages` 36줄은 앱이 없던 시절 커밋(`0dd24bc04c`)의 산물이다.
> 이 코드는 frappe API 만 쓰고 erpnext 내부 심볼 의존이 0건이라 **앱 이관이 기술적으로 가능함이 확인됐다** — `setive_erpnext_kr/korea/common/system_defaults.py` 로 옮기고 앱 `install.py` 의 `after_install`/`after_migrate` 에서 호출한 뒤 두 코어 파일을 v16.33.0 원본으로 복원한다. 이관 시 `after_install` 은 `force_defaults=not frappe.is_setup_complete()` 로 게이트해야 한다(원본의 무조건 force 를 그대로 옮기면 기존 사이트에 앱을 나중 설치할 때 운영자가 고른 언어·국가·통화·타임존을 덮어쓴다). `Makefile` 의 `lang` 타깃 경로와 KB-LOC-001 §2 · KB-DEV-001 §3 도 함께 고쳐야 한다.
> **사람 승인 사항이다.** 이 잔존 코드를 "선례" 로 삼아 코어를 더 고치지 않는다.

### `erpnext/regional/korea/` 를 만들지 않는다
`erpnext/regional/` 에 italy·uae·australia 가 실재하지만 이는 **upstream 패턴**이다. 한국은 동작하지 않는다 — `frappe.scrub("Korea, Republic of")` 가 `korea,_republic_of` 를 만들어 쉼표 때문에 파이썬 import 가 불가능하고, **그 예외를 프레임워크가 조용히 삼킨다**. 무증상 실패다.

### 과거 커밋을 선례로 삼지 않는다
2026-09-04 이전 SETIVE 커밋 5건은 코어를 직접 수정했다(`hooks.py`, `setup/install.py`, `setup_wizard.js`, `ko.po`). **앱이 없던 시절의 산물이며 따르지 않는다.**

### DB 에 코드를 저장하지 않는다
`Client Script` / `Server Script` 는 git 밖의 코드다. 생성하지 않는다. `custom=1` DocType 도 만들지 않는다 — 회수 경로가 없어 해당 테넌트에 고립된다.

---

## 포크를 고치게 된 경우 (승인 후)

덮이는 함수 바로 위에 역참조 마커를 남긴다.

```python
# SETIVE-OVERRIDE: setive_erpnext_kr.korea.common.taxes.calculate (region=Korea)
def calculate_taxes(self):
```

이 마커가 없으면 다음 에이전트가 **실행되지 않는 죽은 코드를 고치고 완료 보고**한다. 코어 코드에는 "이 함수가 앱에서 덮여 있다"는 단서가 없고, 에이전트의 첫 수는 언제나 코어 방향이기 때문이다.

---

## 개발 환경

```bash
COMPOSE=docker/development/docker-compose.yml
SITE=localhost
```

### 브랜치 규약 — 이미지 태그와 같은 upstream 태그 위에 둔다

- 포크는 compose 가 쓰는 **이미지 태그와 같은 upstream 태그 위에 SETIVE 커밋을 리베이스**해 유지한다. 현재 `frappe/erpnext:v16.33.0` ↔ `v16.33.0`. 확인: `git describe --tags` → `v16.33.0-<n>-g<sha>`.
  어긋나면 무증상으로 전표 경로가 깨진다(2026-09-06 사고: 포크가 17-dev 인데 이미지 frappe 는 16.31.0 → `Meta.get_translated_label` 부재). 근거·절차는 [`docs/kb/KB-OPS-001`](docs/kb/KB-OPS-001_tenant_provisioning_deployment.md) §1.7.
- upstream 리모트가 있다: `upstream` = `https://github.com/frappe/erpnext.git`. 태그 수급은 `git fetch upstream --tags`. **`version-16-hotfix` 는 추적하지 않는다** — 릴리스 태그와 계보가 갈라져 있고 컨테이너 이미지가 태그 단위로만 나온다.
- 리베이스 전에 백업 브랜치를 만든다. 명명: `backup/develop-<직전상태>-<YYYYMMDD>` (예: `backup/develop-17dev-20260906`).
- **리베이스 후에는 `bench migrate` 가 필요하다.** 리베이스는 파일만 바꾸고 사이트 DB 스키마는 옛 태그에 머문다.

| 작업 | 명령 |
|---|---|
| 번역 컴파일 | `make po` |
| 지역 기본값 + 번역 | `make lang` |
| 캐시 초기화 | `make clean` |
| 스택 기동 | `docker compose -f $COMPOSE up -d` |

### 컨테이너를 재생성한 뒤에는 앱을 다시 pip 설치해야 한다

```bash
for SVC in backend queue-short queue-long scheduler; do
  docker compose -f "$COMPOSE" exec -T "$SVC" \
    /home/frappe/frappe-bench/env/bin/pip install -q -e apps/setive_erpnext_kr
done
docker compose -f "$COMPOSE" restart backend queue-short queue-long scheduler frontend
```

`env/bin/pip` 여야 한다. 시스템 파이썬(`/usr/local/bin/pip`)에 설치하면 `python -c "import ..."` 는 되지만 `bench` 는 못 찾는다. 이 단계를 빠뜨리면 **사이트 전체가 HTTP 500** 이 되고 로그에 `ModuleNotFoundError` 가 남는다.

### 파일을 바꾼 뒤 무엇이 필요한가

| 바꾼 것 | 필요한 조치 |
|---|---|
| `.py` | 재기동 |
| DocType `.json` · `fixtures/*.json` · `custom/*.json` | **`bench migrate`** |
| DocType 폴더의 `.js` | 없음 |
| `locale/*.po` | `make po` |
| `public/js/*.bundle.js` | `bench build` — **이 이미지에 node 가 없어 실행 불가**. 이 경로를 쓰지 말고 `doctype_js` 훅이나 DocType 폴더의 `.js` 를 쓴다 |

**재기동만으로는 DB 가 바뀌지 않는다.** 스키마·fixtures 반영은 `bench migrate` 가 한다. 상세는 KB-OPS-001 §5.

---

## 문서

코드를 바꾸면 `docs/kb/` 에 기록한다. 규약은 [`docs/README.md`](docs/README.md) 에 있다.

- 파일명: `<갈래>-<도메인>-<번호>_<slug>.md`
- YAML 프런트매터 필수
- 링크는 저장소 상대경로 (절대경로 금지)
- 파일 전문을 인라인 복사하지 않는다
- 검증 절에는 실행 가능한 명령을 남긴다
- 기존 서술을 고칠 때는 "이전 서술 정정" 항목으로 무엇이 틀렸는지 남긴다
