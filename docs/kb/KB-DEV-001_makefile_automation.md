---
id: KB-DEV-001
title: Makefile 개발 자동화 타겟
domain: 개발 도구
status: active
applies_to:
  - erpnext@16.33.0
  - docker/development/docker-compose.yml
verified_on: 2026-09-14
verified_by: make help/up/up-dev/po 실행 확인 + developer_mode 0↔1 전환 실측 + 런타임 번역 사전 조회 32/32
related: [KB-LOC-001, KB-LOC-002]
---

# KB-DEV-001: Makefile 개발 자동화 타겟

## 1. 요약

개발용 Docker 스택([`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml))의 `backend` 컨테이너에 `bench` 명령을 위임하는 얇은 래퍼입니다.
번역 컴파일과 캐시 초기화처럼 손으로 치면 길고 순서를 틀리기 쉬운 작업을 단일 타겟으로 묶습니다.

전문은 [`Makefile`](../../Makefile)에 있습니다. **이 문서는 전문을 복사해 두지 않습니다** (아래 §4 참조).

## 2. 타겟

**스택**

| 타겟 | 동작 | 언제 쓰는가 |
|---|---|---|
| `make` / `make help` | 타겟 목록 출력 | — |
| `make up` | `DEVELOPER_MODE=0 … up -d` → 앱 서비스 재시작 → `clear-cache` | **운영과 같은 흐름**을 볼 때. 셋업 위저드의 "계정 설정" 슬라이드가 보인다 |
| `make up-dev` | 위와 같되 `DEVELOPER_MODE=1` | DocType 을 편집할 때. 편집분이 앱 폴더에 JSON 으로 기록된다 |
| `make down` | `docker compose down` | 중지. 볼륨·데이터 보존 |
| `make restart` | `docker compose restart` | 전 서비스 재시작 |
| `make reset` | `docker compose down -v` | ⚠ 볼륨까지 삭제. 사이트 DB·업로드·번역 전부 소실 |

**번역·캐시** — 모두 `require-backend` 가드를 거칩니다(§3.1).

| 타겟 | 동작 | 언제 쓰는가 |
|---|---|---|
| `make po` | `compile_translations(locale='ko', force=True)` → `clear-cache` → `cache().flushall` | `ko.po` 를 수정한 뒤 |
| `make lang` | `setive_erpnext_kr...system_defaults.configure_target_languages()` 실행 후 `make po` | 컨테이너 재생성으로 지역 기본값·MO가 유실됐을 때 |
| `make clean` | `clear-cache` → `cache().flushall` | 캐시만 비울 때 |

### 2.1 `developer_mode` 를 왜 기동 타겟으로 나눴는가

`frappe.boot.developer_mode` 가 참이면 셋업 위저드의 `user` 슬라이드("Let's set up your account")가 **슬라이드 목록에 추가조차 되지 않습니다**.

```javascript
// frappe/desk/page/setup_wizard/setup_wizard.js:87
if (!(s.name === "user" && frappe.boot.developer_mode)) { frappe.setup.add_slide(s); }
```

백엔드도 짝을 이룹니다 — 이메일이 없으면 `create_or_update_user()` 가 즉시 반환하고(`setup_wizard.py:312-314`), `run_setup_success()` 는 개발자 모드일 때 `login_as_first_user()` 를 건너뜁니다(`:209-210`). **개발자 모드는 "계속 Administrator 로 작업한다"는 전제**이며 의도된 동작입니다.

이전에는 compose 의 configurator 가 `developer_mode 1` 을 하드코딩해 이 슬라이드를 **로컬에서 볼 방법이 없었습니다.** 이제 configurator 가 `DEVELOPER_MODE` 환경변수를 읽습니다(기본 1).

```yaml
DEVELOPER_MODE: ${DEVELOPER_MODE:-1}      # configurator environment
bench set-config -gp developer_mode "$${DEVELOPER_MODE:-1}";
```

`$$` 는 compose 가 아니라 컨테이너 셸이 전개하도록 이스케이프한 것입니다. `-gp` 는 정수로 저장하기 위한 것인데, 실측상 `-g` 도 정수로 저장되어 `"0"` 문자열이 truthy 가 되는 함정은 없습니다.

**모드 전환에는 재시작과 캐시 초기화가 함께 필요합니다.** configurator 는 매 기동마다 값을 다시 쓰지만, 이미 떠 있는 `backend` 는 옛 `frappe.conf` 를 물고 있고 bootinfo 는 Redis 에 캐시됩니다. `_up` 타겟이 이 둘을 자동으로 처리합니다.

### 2.2 재시작 뒤에는 `frontend` 도 함께 돌려야 한다 — 502 의 원인

`backend` 를 재시작하면 **컨테이너 IP 가 바뀝니다**(실측: `172.30.0.5` → `172.30.0.6`). 그런데 `frontend` 의 nginx 설정은 upstream 을 이름이 아니라 **설정 로드 시점에 해석한 IP 로 고정**합니다.

```nginx
upstream backend-server { ... }      # /etc/nginx/conf.d/*.conf:1
proxy_pass http://backend-server;    # :77
```

그래서 `frontend` 를 그대로 두면 옛 IP 로 붙다가 502 가 납니다. backend 는 멀쩡히 떠 있는데도요 — 로그에는 이렇게 남습니다.

```
connect() failed (111: Connection refused) while connecting to upstream,
upstream: "http://172.30.0.5:8000/api/method/ping"
```

`_up` 과 `restart` 는 `APP_SERVICES` 를 먼저 돌린 뒤 **`PROXY_SERVICE`(frontend)를 마지막에** 재시작합니다. `docker compose restart` 를 인자 없이 부르면 순서가 보장되지 않아 같은 문제가 재발할 수 있으므로 `restart` 타겟도 두 단계로 나눠 뒀습니다.

### 2.3 `wait` — 응답할 때까지 기다린다

gunicorn 부팅에 십수 초가 걸립니다. 이걸 기다리지 않으면 "기동 완료" 를 찍은 직후 브라우저가 502 를 받습니다. `wait` 타겟이 `/api/method/frappe.ping` 이 200 을 줄 때까지 2초 간격으로 최대 120초 폴링합니다.

경로에 주의하십시오 — **`frappe.ping`** 입니다. `/api/method/ping` 은 404 입니다.

공통 전제:

```makefile
COMPOSE_FILE = docker/development/docker-compose.yml
EXEC_BACKEND = docker compose -f $(COMPOSE_FILE) exec backend
```

사이트명은 `localhost` 로 고정돼 있습니다. 다른 사이트를 쓰면 Makefile을 수정해야 합니다.

## 3. 주의

1. **스택이 떠 있어야 합니다.** `docker compose exec` 이므로 `backend` 컨테이너가 실행 중이 아니면 실패합니다. 기동은 `make up` / `make up-dev` 또는 IDE 의 실행 구성(§4).
2. **`make po` 후 브라우저 강제 새로고침이 필요합니다.** 번역은 부팅 시 클라이언트로 내려가므로 서버 캐시만 비워서는 화면이 바뀌지 않습니다.
3. **`make lang` 은 지역 기본값을 다시 씁니다.** `configure_target_languages()`(앱 `korea/common/system_defaults.py`) 는 `force_defaults=False` 로 호출되므로 `System Settings.language` 가 이미 설정돼 있으면 덮어쓰지 않습니다 (KB-LOC-001 §2).
4. **`make clean` 은 데이터를 지우지 않습니다.** 사이트·Redis 캐시만 비웁니다. 볼륨 초기화는 `docker compose ... down -v` 입니다.

### 3.1 `require-backend` 가드

`po` · `lang` · `clean` 은 실행 중인 컨테이너가 필요합니다. 스택이 내려가 있으면 docker 는 다음 한 줄만 뱉고 원인도 다음 조치도 알려주지 않습니다.

```
service "backend" is not running
```

`require-backend` 가 먼저 걸러 무엇을 해야 하는지와 현재 컨테이너 상태를 함께 출력합니다.

```bash
$(COMPOSE) ps --services --status running | grep -qx backend || { ...안내 출력...; exit 1; }
```

## 4. IDE 실행 구성

동작을 성격에 따라 두 곳에 나눴습니다. 기준은 **출력을 볼 이유가 있는가**입니다.

| 위치 | 동작 | 터미널 |
|---|---|---|
| [`.vscode/launch.json`](../../.vscode/launch.json) — Run and Debug ▷ | `기동 (운영)` · `기동 (개발자)` · `재시작` | 뜬다 (진행 로그 확인) |
| [`.vscode/tasks.json`](../../.vscode/tasks.json) — Tasks: Run Task | `중지` · `초기화` | **뜨지 않는다** |

선택 목록의 라벨은 `기동 (운영)` / `기동 (개발자)` / `재시작` 세 개뿐입니다. 무엇이 달라지는지는 라벨이 아니라 `launch.json` 상단 주석과 §2.1 에 둡니다 — 드롭다운에 설명을 넣으면 고를 때 오히려 읽기 어렵습니다. `초기화` 는 여기 넣지 않았습니다. `재시작` 으로 안 풀리는 상황에만 쓰는 것이고, 그때는 `tasks.json` 쪽을 의도적으로 찾아가는 편이 오발을 줄입니다.

`launch.json` 의 `node-terminal` 은 디버그 세션을 만들기 때문에 실행하면 상단에 디버그 툴바(계속/중단 핸들)가 붙습니다. 중지·초기화처럼 출력을 볼 이유가 없는 동작에는 방해가 되므로 `tasks.json` 으로 옮기고 다음 `presentation` 을 줬습니다.

```jsonc
"presentation": { "reveal": "never", "echo": false, "close": true, "panel": "dedicated" }
```

`problemMatcher: []` 는 실행할 때마다 뜨는 출력 스캐너 선택 프롬프트를 막습니다.

## 5. 이전 서술 정정

- 이전 판은 Makefile **전문을 문서에 인라인 복사**해 뒀고, 이후 `lang` 타겟이 추가되면서 문서와 실제 파일이 불일치 상태가 됐습니다 (`.PHONY: help po clean` 으로 남아 있었음). 전문 복사를 제거하고 타겟 표 + 상대경로 링크로 대체했습니다. 이것이 docs/README.md 규약 4(파일 전문을 인라인 복사하지 않기)의 실제 사례입니다.
- "소요 시간" 컬럼(`~0.2초` 등)을 제거했습니다. 호스트 성능·캐시 상태에 따라 달라지는 값이라 명세로 쓸 수 없습니다.
- 절대경로 링크를 상대경로로 교체했습니다.
- **2026-09-07: `make lang` 의 실행 경로가 바뀌었습니다.** `erpnext.setup.install.configure_target_languages` → `setive_erpnext_kr.korea.common.system_defaults.configure_target_languages`. 해당 코드가 포크에서 앱으로 이관됐기 때문입니다(KB-LOC-001 정정 참조).
- **2026-09-07: 개발 스택 포트가 8000 → 8002 로 바뀌었습니다.** 같은 머신의 다른 프로젝트가 8000 을 점유하면 `frontend` 컨테이너만 조용히 기동 실패하고 backend 는 정상이라, 브라우저가 남의 스택 응답(500)을 받는 진단하기 어려운 상태가 됩니다. 접속 주소는 `http://localhost:8002` 입니다.
- **2026-09-14: `make po` 가 "service \"backend\" is not running" 으로 실패한다는 보고가 있었습니다.** Makefile 의 결함이 아니라 스택이 내려가 있었던 것입니다. 다만 그 구분이 메시지에 드러나지 않아 `require-backend` 가드를 넣었습니다(§3.1).
- **2026-09-14: §3-1 이 기동 방법으로 `docker compose ... up` 을 안내했습니다.** 그 경로는 `DEVELOPER_MODE` 를 주지 않아 항상 개발자 모드(기본 1)로 뜹니다. `make up` / `make up-dev` 로 교체했습니다.
- **2026-09-14: 이전 판의 IDE 구성 이름 `⚡ SETIVE ERP (Docker)` 는 동작 4종(기동·중지·재시작·초기화)을 한 `pickString` 으로 묶은 단일 launch 구성이었습니다.** 기동을 모드별 2종으로 나누고, 중지·초기화는 디버그 세션이 붙지 않도록 태스크로 분리했습니다(§4).
- **2026-09-14: `_up` 이 `frontend` 를 재시작 대상에서 제외해 `make up` 직후 502 가 났습니다.** "frontend 는 정적 자산만 서빙하므로 제외한다" 는 주석이 틀렸습니다 — frontend 는 backend·websocket 앞단의 nginx 리버스 프록시입니다. backend 재시작으로 컨테이너 IP 가 바뀌었는데 nginx 가 옛 IP 를 캐시하고 있어 `connect() failed (111: Connection refused)` 가 발생했습니다. `PROXY_SERVICE` 로 분리해 앱 서비스 뒤에 재시작하도록 고쳤고, 응답을 기다리는 `wait` 타겟도 추가했습니다(§2.2 · §2.3).
