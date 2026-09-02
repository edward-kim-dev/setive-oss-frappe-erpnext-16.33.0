# KB-LOC-001: 시스템 지역 기본값 및 다국어 환경 설정

## 1. 개요 (Overview)
- **도메인**: 로컬라이제이션 / 지역 설정 (Localization & Regional Defaults)
- **대상 시스템**: SETIVE ERPNext (v16.33 Fork) 및 Frappe Framework v16
- **목적**: 초기 시스템 기본 언어를 한국어(`ko`), 국가를 `Korea, Republic of`(대한민국), 시간대를 `Asia/Seoul`, 통화를 `KRW`로 데이터베이스 레벨에서 바인딩함. 최초 위저드 접속 시 **"한국어"가 100% Default로 주입**되도록 보장함과 동시에, 사용자가 드롭다운에서 타 언어(English, 日本語 등)로 변경할 경우 **한국어로 재튕김(Reset) 없이 변경된 언어 및 필드 정보를 그대로 유지**하도록 두 가지 상충 요소를 완벽히 해결함.

## 2. 아키텍처 및 파일 매핑

```
[erpnext/hooks.py] ──> after_migrate 및 override_whitelisted_methods 후크 등록
       │
       ├──> [erpnext/setup/install.py] ──> DB 레벨 세팅 및 load_languages API 오버라이드
       │
       └──> [erpnext/public/js/setup_wizard.js] ──> frappe.setup.utils.setup_language_field 훅 래핑
```

- **[`erpnext/setup/install.py`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/setup/install.py)**: `System Settings` DB 기본값 및 `load_languages` 백엔드 API 오버라이드.
- **[`erpnext/hooks.py`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/hooks.py)**: API 오버라이드 및 마이그레이션 후크.
- **[`erpnext/public/js/setup_wizard.js`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/public/js/setup_wizard.js)**: `setup_language_field` 함수 오버라이드 및 언어 변환 보존 로직.

## 3. 핵심 모순 해결 및 구현 명세 (Dual Requirement Solution)

### A. 요구사항 1 해결 (초기 접속 시 한국어 Default 주입)
- **문제점**: Frappe Core 슬라이드는 하드코딩된 `default: "English"`와 `System Settings` 언어 코드(`"ko"`)를 넘겨받음. 그러나 Autocomplete 옵션 목록은 언어 라벨명(`"한국어"`)을 기대하므로 매핑에 실패하여 "English"로 떨어졌음.
- **해결책**: `frappe.setup.utils.setup_language_field`를 래핑하여, 초기 진입 시(`val`이 없거나 코드값 `"ko"`로 들어올 때) `frappe.wizard.values.language`를 **`"한국어"`** 라벨명으로 즉시 치환 및 주입함.

### B. 요구사항 2 해결 (타 언어 변경 시 한국어 재튕김 방지 및 해당 언어 전환)
- **문제점**: 이전 구현에서는 `before_load` 후크 실행 시마다 `lang_field.default = "한국어"`를 무조건 덮어썼기 때문에, 사용자가 "English"나 "日本語"를 선택하여 슬라이드가 새로 고쳐질 때마다(`refresh_slides()`) 다시 "한국어"가 강제 주입되어 이벤트가 무한 리셋되었음.
- **해결책**: `setup_language_field` 오버라이드 함수 내에서 사용자가 이미 명시적으로 선택한 언어값(`"English"`, `"日本語"` 등)이 존재할 경우에는 **해당 값을 전혀 건드리지 않고 그대로 보존**함.
