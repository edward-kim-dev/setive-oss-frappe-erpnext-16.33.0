COMPOSE_FILE = docker/development/docker-compose.yml
EXEC_BACKEND = docker compose -f $(COMPOSE_FILE) exec backend

.PHONY: help po lang clean

# 기본 도움말 (make 또는 make help)
help:
	@echo "사용 가능한 Makefile 명령어:"
	@echo "  make po     - 한국어(ko) PO 번역 사전 초고속 컴파일 및 캐시 적용"
	@echo "  make lang   - 지역 기본값(ko/KRW/Asia/Seoul) 재적용 + PO 컴파일"
	@echo "  make clean  - 사이트 및 Redis 캐시 초기화"

# 한국어(ko) 전용 초고속 PO 번역 사전 컴파일 및 캐시 초기화 일괄 실행
po:
	@echo "🌐 한국어(ko) PO 번역 사전 컴파일 및 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.gettext.translate.compile_translations" --kwargs "{'locale': 'ko', 'force': True}"
	@$(EXEC_BACKEND) bench --site localhost clear-cache
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 적용 완료! 브라우저를 새로고침(Cmd+Shift+R / Ctrl+F5) 하세요."

# 지역 기본값 재적용 + 번역 컴파일 (컨테이너 재생성으로 MO 가 유실됐을 때 수동 복구용)
lang:
	@echo "🇰🇷 지역 기본값 적용 및 번역 컴파일 중..."
	@$(EXEC_BACKEND) bench --site localhost execute setive_erpnext_kr.korea.common.system_defaults.configure_target_languages
	@$(MAKE) po

# 캐시 초기화
clean:
	@echo "🧹 사이트 및 Redis 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site localhost clear-cache
	@$(EXEC_BACKEND) bench --site localhost execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 캐시 초기화 완료!"
