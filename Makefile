COMPOSE_FILE = docker/development/docker-compose.yml
COMPOSE      = docker compose -f $(COMPOSE_FILE)
EXEC_BACKEND = $(COMPOSE) exec backend
SITE         = localhost
URL          = http://localhost:8002

# developer_mode 를 바꾸면 재시작이 필요한 서비스.
APP_SERVICES = backend queue-short queue-long scheduler websocket

# ⚠ frontend(nginx)는 APP_SERVICES 뒤에 따로 재시작한다. "정적 자산만 서빙"이 아니라
#   backend/websocket 앞단 리버스 프록시이고, nginx 는 upstream 주소를 설정 로드 시점에
#   한 번만 해석해 캐시한다. backend 를 재시작하면 컨테이너 IP 가 바뀌므로(예 .5 → .6)
#   frontend 를 그대로 두면 옛 IP 로 붙다가 502 (connect() failed, Connection refused)가 난다.
PROXY_SERVICE = frontend

.PHONY: help up up-dev _up wait down restart reset po lang clean require-backend

# 기본 도움말 (make 또는 make help)
help:
	@echo "사용 가능한 Makefile 명령어:"
	@echo ""
	@echo "  [스택]"
	@echo "  make up       - 기동 (운영 유사 · developer_mode=0)"
	@echo "  make up-dev   - 기동 (개발자 모드 · developer_mode=1)"
	@echo "  make down     - 중지 (볼륨·데이터 보존)"
	@echo "  make restart  - 재시작"
	@echo "  make reset    - 초기화 ⚠ 볼륨까지 삭제 (사이트 데이터 전부 소실)"
	@echo ""
	@echo "  [번역·캐시]  ※ backend 가 실행 중이어야 한다"
	@echo "  make po       - 한국어(ko) PO 번역 사전 초고속 컴파일 및 캐시 적용"
	@echo "  make lang     - 지역 기본값(ko/KRW/Asia/Seoul) 재적용 + PO 컴파일"
	@echo "  make clean    - 사이트 및 Redis 캐시 초기화"

# ---------- 스택 ----------

# 운영과 같은 흐름으로 기동한다. 셋업 위저드 전 과정을 확인할 때 쓴다.
up:
	@$(MAKE) --no-print-directory _up MODE=0 LABEL="운영 유사"

# DocType 을 편집할 때 쓴다. 편집분이 앱 폴더에 JSON 으로 떨어진다.
up-dev:
	@$(MAKE) --no-print-directory _up MODE=1 LABEL="개발자 모드"

# up / up-dev 공용 본체.
# configurator 가 매 기동마다 developer_mode 를 다시 쓰므로 모드 전환은 재기동만으로 된다.
# 단 이미 떠 있는 backend 는 옛 값을 물고 있고 bootinfo 도 Redis 에 캐시되므로
# 앱 서비스 재시작 + clear-cache 까지 해야 전환이 실제로 반영된다.
_up:
	@echo "🚀 스택 기동 중... (developer_mode=$(MODE) · $(LABEL))"
	@DEVELOPER_MODE=$(MODE) $(COMPOSE) up -d
	@echo "♻️  기동 모드 반영 중 (앱 서비스 재시작 + 캐시 초기화)..."
	@$(COMPOSE) restart $(APP_SERVICES) > /dev/null
	@$(EXEC_BACKEND) bench --site $(SITE) clear-cache
	@$(COMPOSE) restart $(PROXY_SERVICE) > /dev/null
	@$(MAKE) --no-print-directory wait
	@echo "✅ 기동 완료 · developer_mode=$(MODE) ($(LABEL)) · $(URL)"

# 사이트가 실제로 응답할 때까지 기다린다. gunicorn 부팅에 십수 초가 걸리는데
# 이걸 안 하면 "기동 완료" 를 찍은 직후 브라우저가 502 를 받는다.
wait:
	@printf "⏳ 응답 대기"
	@i=0; while [ $$i -lt 60 ]; do \
		code=$$(curl -s -o /dev/null -w "%{http_code}" $(URL)/api/method/frappe.ping 2>/dev/null || echo 000); \
		if [ "$$code" = "200" ]; then echo " — 응답 정상"; exit 0; fi; \
		printf "."; sleep 2; i=$$((i+1)); \
	done; \
	echo ""; \
	echo "⚠️  120초 안에 응답이 없습니다. 로그를 확인하세요:"; \
	echo "     $(COMPOSE) logs --tail 50 backend"; \
	exit 1

down:
	@echo "🛑 스택 중지 중... (볼륨은 보존)"
	@$(COMPOSE) down
	@echo "✅ 중지 완료. 데이터는 남아 있습니다 — 'make up' 으로 이어서 씁니다."

# 전체 재시작. frontend 를 마지막에 한 번 더 돌려 upstream IP 를 다시 해석시킨다
# (docker compose restart 는 순서를 보장하지 않는다).
restart:
	@echo "🔄 스택 재시작 중..."
	@$(COMPOSE) restart $(APP_SERVICES) > /dev/null
	@$(COMPOSE) restart $(PROXY_SERVICE) > /dev/null
	@$(MAKE) --no-print-directory wait
	@echo "✅ 재시작 완료 · $(URL)"

# ⚠ 되돌릴 수 없다. 사이트 DB·설치 앱·업로드 파일·컴파일된 번역이 전부 사라지고
#   다음 기동에서 configurator 가 사이트를 처음부터 다시 만든다(수 분 소요).
reset:
	@echo "⚠️  초기화: 컨테이너와 볼륨을 모두 삭제합니다."
	@echo "   사이트 DB · 설치 앱 · 업로드 파일 · 컴파일된 번역이 전부 사라집니다."
	@$(COMPOSE) down -v
	@echo "✅ 초기화 완료. 다음 'make up' 에서 사이트를 새로 만듭니다 (수 분 소요)."

# ---------- 번역·캐시 ----------

# exec 계열은 실행 중인 컨테이너가 필요하다. 스택이 내려가 있으면
# docker 가 "service \"backend\" is not running" 만 뱉고 원인을 알려주지 않으므로
# 여기서 먼저 잡아 다음에 무엇을 할지 알려준다.
require-backend:
	@$(COMPOSE) ps --services --status running 2>/dev/null | grep -qx backend || { \
		echo "❌ backend 컨테이너가 실행 중이 아닙니다. 이 명령은 실행 중인 컨테이너가 필요합니다."; \
		echo ""; \
		echo "   먼저 스택을 기동하세요:"; \
		echo "     make up       (운영 유사 · developer_mode=0)"; \
		echo "     make up-dev   (개발자 모드 · developer_mode=1)"; \
		echo ""; \
		echo "   현재 컨테이너 상태:"; \
		$(COMPOSE) ps --all --format "{{.Service}}\t{{.State}}" 2>/dev/null | head -20 | sed "s/^/     /"; \
		exit 1; \
	}

# 한국어(ko) 전용 초고속 PO 번역 사전 컴파일 및 캐시 초기화 일괄 실행
po: require-backend
	@echo "🌐 한국어(ko) PO 번역 사전 컴파일 및 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site $(SITE) execute "frappe.gettext.translate.compile_translations" --kwargs "{'locale': 'ko', 'force': True}"
	@$(EXEC_BACKEND) bench --site $(SITE) clear-cache
	@$(EXEC_BACKEND) bench --site $(SITE) execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 적용 완료! 브라우저를 새로고침(Cmd+Shift+R / Ctrl+F5) 하세요."

# 지역 기본값 재적용 + 번역 컴파일 (컨테이너 재생성으로 MO 가 유실됐을 때 수동 복구용)
lang: require-backend
	@echo "🇰🇷 지역 기본값 적용 및 번역 컴파일 중..."
	@$(EXEC_BACKEND) bench --site $(SITE) execute setive_erpnext_kr.korea.common.system_defaults.configure_target_languages
	@$(MAKE) --no-print-directory po

# 캐시 초기화
clean: require-backend
	@echo "🧹 사이트 및 Redis 캐시 초기화 중..."
	@$(EXEC_BACKEND) bench --site $(SITE) clear-cache
	@$(EXEC_BACKEND) bench --site $(SITE) execute "frappe.cache().flushall" > /dev/null 2>&1
	@echo "✅ 캐시 초기화 완료!"
