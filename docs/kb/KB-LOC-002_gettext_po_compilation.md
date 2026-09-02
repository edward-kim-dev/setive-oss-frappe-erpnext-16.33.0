# KB-LOC-002: Gettext 번역 엔진 및 PO/MO 컴파일 메커니즘

## 1. 개요 (Overview)
- **도메인**: 다국어 처리 (i18n) / 번역 엔진
- **대상 시스템**: SETIVE ERPNext (v16.33 Fork) 및 Frappe Framework v16
- **목적**: Frappe v16의 GNU Gettext 번역 탐색 우선순위, PO 파일 파싱 시 중복 제어 규칙, 및 단일 언어 초고속 컴파일 최적화 방안을 명세함.

## 2. Frappe v16 번역 처리 메커니즘

### A. 번역 탐색 우선순위 (`frappe/translate.py`)
1. **`Translation` DocType**: DB 수준 사용자 정의 커스텀 번역 (최우선 순위).
2. **Gettext 컴파일 MO 이진 파일** (`<app>/locale/<lang>/LC_MESSAGES/<app>.mo`): 이진 해시 테이블 기반 (운영 환경 표준, 초고속).
3. **CSV 번역 파일** (`<app>/translations/<lang>.csv`): 평문 텍스트 사전 (보조 방식).

### B. PO 파일 파싱 및 중복 제어 규칙
- GNU Gettext 및 Babel 파서는 `.po` 파일의 항목을 순차적으로 탐색함.
- **우선 채택 규칙**: 동일한 `msgid`가 파일 상단에 이미 존재하면 파서는 **첫 번째 항목만 채택**함. 파일 상단에 빈 번역(`msgstr ""`)이 채워져 있을 경우 파일 하단에 새로 추가된 번역은 무시됨.
- **중복 정리 전략 (In-place Update)**: 번역어 추가 시 파일 하단 덧붙이기 대신 기존 `msgid` 위치를 탐색하여 `msgstr`을 직접 업데이트하고 파일 내 중복 `msgid`를 제거해야 함.

### C. 단일 언어 초고속 컴파일 최적화
- 기본 `frappe.gettext.translate.compile_translations()` 호출 시 전 세계 80여 개 언어를 전체 컴파일(~10초 오버헤드).
- `locale='ko'` 파라미터 전달 시 (`frappe.gettext.translate.compile_translations(locale='ko', force=True)`) 한국어 (`ko/LC_MESSAGES/frappe.mo` 및 `erpnext.mo`) 2개 파일만 <0.2초 이내로 초고속 컴파일됨.

## 3. 관련 대상 파일 및 아티팩트
- **PO 소스 코드**: [`erpnext/locale/ko.po`](file:///Users/edward/DeathStar2/02_CoreSection/01_Development/SETIVE/setive-oss-erpnext-16.33/erpnext/locale/ko.po)
- **MO 컴파일 이진 아티팩트**: `assets/locale/ko/LC_MESSAGES/erpnext.mo`
