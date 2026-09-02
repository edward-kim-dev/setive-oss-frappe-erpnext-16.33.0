# KB-ARCH-001: Frappe Core vs ERPNext App Setup Wizard 아키텍처

## 1. 개요 (Overview)
- **도메인**: 애플리케이션 아키텍처 / SPA 페이지 확장 구조
- **대상 시스템**: Frappe Framework Core vs ERPNext Application
- **목적**: Frappe Setup Wizard의 페이지 레벨 아키텍처 및 다운스트림 앱(ERPNext)이 코어 위저드 슬라이드를 확장(Extend)하는 후크 메커니즘을 명세함.

## 2. 구성요소 분리 및 역할 구조

```
[Frappe Core Framework]
  └─ 전용 라우트 페이지: setup-wizard
  └─ UI 소스코드: frappe/desk/page/setup_wizard/setup_wizard.js
  └─ 코어 기본 슬라이드: Welcome (언어, 국가, 시간대, 통화), User (관리자 계정/비밀번호)
       │
       ▼ (Hooks 통합 메커니즘: setup_wizard_requires & setup_wizard_stages)
[ERPNext App Extension]
  └─ UI 소스코드: erpnext/public/js/setup_wizard.js
  └─ 확장 슬라이드: Persona (업종, 팀 규모), Organization (회사명, 계정과목, 회계연도)
```

## 3. 확장 및 연결 메커니즘

1. **프론트엔드 파일 주입**:
   - `erpnext/hooks.py` 내 `setup_wizard_requires = "assets/erpnext/js/setup_wizard.js"` 설정.
   - `erpnext/public/js/setup_wizard.js`가 `frappe.setup.on("before_load")` 후크 이벤트에 바인딩되어 `erpnext.setup.slides_settings.map(frappe.setup.add_slide)` 호출.
2. **백엔드 스테이지 핸들러**:
   - `erpnext/hooks.py` 내 `setup_wizard_stages = "erpnext.setup.setup_wizard.setup_wizard.get_setup_stages"` 설정.
   - 위저드 완료 시 DB 레코드 생성 (회사, 계정과목 체계, 회계연도, 기본 창고) 수행.

## 4. 관련 핵심 파일 목록
- **Frappe Core UI**: `frappe/desk/page/setup_wizard/setup_wizard.js`
- **Frappe Core API**: `frappe/desk/page/setup_wizard/setup_wizard.py`
- **ERPNext App UI**: [`erpnext/public/js/setup_wizard.js`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/public/js/setup_wizard.js)
- **ERPNext App API**: [`erpnext/setup/setup_wizard/setup_wizard.py`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/setup/setup_wizard/setup_wizard.py)
- **후크 설정 파일**: [`erpnext/hooks.py`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/hooks.py)
