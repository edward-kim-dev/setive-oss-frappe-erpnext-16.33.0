---
id: KB-DEV-001
title: Makefile 개발 자동화 타겟
domain: 개발 도구
status: active
applies_to:
  - erpnext@16.33.0
  - docker/development/docker-compose.yml
verified_on: 2026-09-02
verified_by: Makefile 소스 확인 + make po 실행 확인
related: [KB-LOC-001, KB-LOC-002]
---

# KB-DEV-001: Makefile 개발 자동화 타겟

## 1. 요약

개발용 Docker 스택([`docker/development/docker-compose.yml`](../../docker/development/docker-compose.yml))의 `backend` 컨테이너에 `bench` 명령을 위임하는 얇은 래퍼입니다.
번역 컴파일과 캐시 초기화처럼 손으로 치면 길고 순서를 틀리기 쉬운 작업을 단일 타겟으로 묶습니다.

전문은 [`Makefile`](../../Makefile)에 있습니다. **이 문서는 전문을 복사해 두지 않습니다** (아래 §4 참조).

## 2. 타겟

| 타겟 | 동작 | 언제 쓰는가 |
|---|---|---|
| `make` / `make help` | 타겟 목록 출력 | — |
| `make po` | `compile_translations(locale='ko', force=True)` → `clear-cache` → `cache().flushall` | `ko.po` 를 수정한 뒤 |
| `make lang` | `setive_erpnext_kr...system_defaults.configure_target_languages()` 실행 후 `make po` | 컨테이너 재생성으로 지역 기본값·MO가 유실됐을 때 |
| `make clean` | `clear-cache` → `cache().flushall` | 캐시만 비울 때 |

공통 전제:

```makefile
COMPOSE_FILE = docker/development/docker-compose.yml
EXEC_BACKEND = docker compose -f $(COMPOSE_FILE) exec backend
```

사이트명은 `localhost` 로 고정돼 있습니다. 다른 사이트를 쓰면 Makefile을 수정해야 합니다.

## 3. 주의

1. **스택이 떠 있어야 합니다.** `docker compose exec` 이므로 `backend` 컨테이너가 실행 중이 아니면 실패합니다. 기동은 IDE의 실행/디버그 구성(`⚡ SETIVE ERP (Docker)`) 또는 `docker compose -f docker/development/docker-compose.yml up`.
2. **`make po` 후 브라우저 강제 새로고침이 필요합니다.** 번역은 부팅 시 클라이언트로 내려가므로 서버 캐시만 비워서는 화면이 바뀌지 않습니다.
3. **`make lang` 은 지역 기본값을 다시 씁니다.** `configure_target_languages()`(앱 `korea/common/system_defaults.py`) 는 `force_defaults=False` 로 호출되므로 `System Settings.language` 가 이미 설정돼 있으면 덮어쓰지 않습니다 (KB-LOC-001 §2).
4. **`make clean` 은 데이터를 지우지 않습니다.** 사이트·Redis 캐시만 비웁니다. 볼륨 초기화는 `docker compose ... down -v` 입니다.

## 4. 이전 서술 정정

- 이전 판은 Makefile **전문을 문서에 인라인 복사**해 뒀고, 이후 `lang` 타겟이 추가되면서 문서와 실제 파일이 불일치 상태가 됐습니다 (`.PHONY: help po clean` 으로 남아 있었음). 전문 복사를 제거하고 타겟 표 + 상대경로 링크로 대체했습니다. 이것이 docs/README.md 규약 4(파일 전문을 인라인 복사하지 않기)의 실제 사례입니다.
- "소요 시간" 컬럼(`~0.2초` 등)을 제거했습니다. 호스트 성능·캐시 상태에 따라 달라지는 값이라 명세로 쓸 수 없습니다.
- 절대경로 링크를 상대경로로 교체했습니다.
- **2026-09-07: `make lang` 의 실행 경로가 바뀌었습니다.** `erpnext.setup.install.configure_target_languages` → `setive_erpnext_kr.korea.common.system_defaults.configure_target_languages`. 해당 코드가 포크에서 앱으로 이관됐기 때문입니다(KB-LOC-001 정정 참조).
