# KB-DEV-001: 빌드 및 번역 관리 CLI 자동화 (Makefile)

## 1. 개요 (Overview)
- **도메인**: 개발자 도구 / 빌드 자동화 (Developer Tooling & Build CLI)
- **대상 시스템**: SETIVE ERPNext 워크스페이스 루트
- **목적**: 단일 타겟 명령어로 Gettext 이진 컴파일, Redis 번역 캐시 초기화, 사이트 캐시 갱신을 일괄 처리하여 개발 생산성을 극대화함.

## 2. 파일 위치 및 구조
- **파일 경로**: [`Makefile`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/Makefile)

```makefile
COMPOSE_FILE = docker/development/docker-compose.yml
EXEC_BACKEND = docker compose -f $(COMPOSE_FILE) exec backend

.PHONY: help po clean

help:
	@echo "사용 가능한 Makefile 명령어:"
	@echo "  make po     - 한국어(ko) PO 번역 사전 초고속 컴파일 및 캐시 적용"
	@echo "  make clean  - 사이트 및 Redis 캐시 초기화"

po:
	@echo "🌐 한국어(ko) PO 번역 사전 컴파일 및 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.gettext.translate.compile_translations" --kwargs "{'locale': 'ko', 'force': True}"
	@$(EXEC_BACKEND) bench --site localhost clear-cache
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 적용 완료! 브라우저를 새로고침(Cmd+Shift+R / Ctrl+F5) 하세요."

clean:
	@echo "🧹 사이트 및 Redis 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site localhost clear-cache
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 캐시 초기화 완료!"
```

## 3. 타겟 매트릭스

| 타겟 명령어 | 처리 동작 | 하위 실행 스크립트 | 소요 시간 |
|---|---|---|---|
| `make po` | 한국어 PO 컴파일 및 캐시 비우기 | `compile_translations(locale='ko', force=True)` ➔ `clear-cache` ➔ `cache().flushall` | ~0.2초 |
| `make clean` | 전체 캐시 비우기 | `clear-cache` ➔ `cache().flushall` | ~0.1초 |
| `make help` | 도움말 출력 | 사용 가능한 타겟 목록 표시 | 즉시 |
