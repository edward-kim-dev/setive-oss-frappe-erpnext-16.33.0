---
id: KB-ARCH-001
title: 셋업 위저드 확장 아키텍처 (Frappe Core ↔ ERPNext App)
domain: 아키텍처
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02
verified_by: 컨테이너 내 frappe/erpnext 소스 직접 확인
related: [KB-LOC-001, KB-KOR-001]
---

# KB-ARCH-001: 셋업 위저드 확장 아키텍처

## 1. 요약

Frappe Core가 `setup-wizard` 라우트와 기본 슬라이드 2개를 제공하고, 다운스트림 앱(ERPNext)이 훅 두 개로 프런트엔드 슬라이드와 백엔드 스테이지를 각각 덧붙이는 구조입니다.
SETIVE 포크의 위저드 변경은 전부 ERPNext 쪽 확장 지점에서 이뤄지며 Frappe 코어는 건드리지 않습니다.

## 2. 계층 구조

```
[Frappe Core]  frappe/desk/page/setup_wizard/
  ├─ 라우트 페이지: setup-wizard  (setup_wizard.json / .js / .py)
  └─ 코어 슬라이드 2개
       ├─ "welcome" : language, country, timezone, currency, enable_telemetry
       └─ "user"    : full_name, email, password
                 │
                 │  ◀── setup_wizard_requires   (프런트엔드 파일 주입)
                 │  ◀── setup_wizard_stages     (백엔드 스테이지 등록)
                 ▼
[ERPNext App]  erpnext/
  ├─ UI    : public/js/setup_wizard.js
  │            └─ 슬라이드 2개 추가
  │                 ├─ "persona"      : 대상, 팀 규모, 업종(KSIC), 사용 중 시스템, 모듈 선택
  │                 └─ "organization" : 회사명/약칭, 계정과목 체계, 회계연도, 데모 데이터
  └─ API   : setup/setup_wizard/setup_wizard.py
               └─ get_setup_stages() → 4단계 (+ 데모 선택 시 5단계)
```

## 3. 연결 메커니즘

### 3.1 프런트엔드 주입

[`erpnext/hooks.py:65`](../../erpnext/hooks.py)

```python
setup_wizard_requires = "assets/erpnext/js/setup_wizard.js"
```

[`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js) 가 `frappe.setup.on("before_load")` 에 바인딩되어 `erpnext.setup.slides_settings.map(frappe.setup.add_slide)` 를 호출합니다.

주의할 점 두 가지:

1. **번들이 아니라 원본 파일이 그대로 서빙됩니다.** `assets/erpnext/js/` 는 `apps/erpnext/erpnext/public/js/` 로의 심볼릭 링크이며, `setup_wizard_requires` 는 `*.bundle.js` 가 아닌 이 경로를 직접 가리킵니다. 따라서 이 파일 수정에는 `bench build` 가 필요 없고 브라우저 새로고침만으로 반영됩니다.
2. **로드 순서 전제.** 이 파일은 코어 페이지 스크립트 **이후에** 평가된다는 전제로 `frappe.setup.utils` 를 래핑합니다. 코어가 `frappe.setup.utils` 를 통째로 재할당하므로, 먼저 평가되면 래핑이 유실됩니다 (KB-LOC-001 §3 참조).

재진입 방어도 이 훅 안에 있습니다.

```javascript
if (frappe.boot.setup_wizard_completed_apps?.includes("erpnext")) return;
```

### 3.2 백엔드 스테이지

[`erpnext/hooks.py:66`](../../erpnext/hooks.py)

```python
setup_wizard_stages = "erpnext.setup.setup_wizard.setup_wizard.get_setup_stages"
```

[`get_setup_stages()`](../../erpnext/setup/setup_wizard/setup_wizard.py) 가 반환하는 단계:

| 순서 | 상태 메시지 | 처리 함수 | 내용 |
|---|---|---|---|
| 1 | Installing presets | `stage_fixtures` | 국가별 프리셋 (Designation, Sales Stage, Industry Type, UTM Source 등) |
| 2 | Setting up company | `setup_company` | Company 레코드, 계정과목 체계 |
| 3 | Setting defaults | `setup_defaults` | 기본 창고·계정·회계연도 등 |
| 4 | Personalizing your setup | `capture_user_persona` | 페르소나 응답을 텔레메트리로 전송 |
| 5 | Creating demo data | `setup_demo` | `setup_demo` 체크 시에만 추가 |

`capture_user_persona()` 는 DB에 쓰지 않고 `frappe.utils.telemetry.capture()` 만 호출합니다. **페르소나 슬라이드의 응답은 어디에도 저장되지 않습니다** — 업종 값을 재사용하려면 별도 필드가 필요합니다 (KB-KOR-001 §8).

## 4. 관련 파일

| 역할 | 경로 |
|---|---|
| Frappe Core UI | `frappe/desk/page/setup_wizard/setup_wizard.js` (컨테이너 내) |
| Frappe Core API | `frappe/desk/page/setup_wizard/setup_wizard.py` (컨테이너 내) |
| Select 컨트롤 (옵션 번역) | `frappe/public/js/frappe/form/controls/select.js` (컨테이너 내) |
| ERPNext UI | [`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js) |
| ERPNext API | [`erpnext/setup/setup_wizard/setup_wizard.py`](../../erpnext/setup/setup_wizard/setup_wizard.py) |
| 프리셋 데이터 | [`erpnext/setup/setup_wizard/data/`](../../erpnext/setup/setup_wizard/data/) |
| 훅 설정 | [`erpnext/hooks.py`](../../erpnext/hooks.py) |

Frappe 코어 파일은 이 저장소에 없습니다 (Docker 이미지 `frappe/erpnext:v16.33.0` 내부). 확인 방법:

```bash
docker exec setive-backend sh -lc \
  'sed -n "390,500p" /home/frappe/frappe-bench/apps/frappe/frappe/desk/page/setup_wizard/setup_wizard.js'
```

## 5. 위저드 재실행 방법

`setup_complete` 가 1이면 위저드는 desk로 리다이렉트됩니다. 개발 중 다시 보려면:

```bash
docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.client.get_value \
  --kwargs "{\"doctype\": \"System Settings\", \"fieldname\": [\"setup_complete\"]}"'
```

`0` 이고 `Company` 레코드가 없으면 `/app/setup-wizard` 로 접근 가능합니다.

## 6. 이전 서술 정정

- 이전 판은 코어 `welcome` 슬라이드 필드에서 `enable_telemetry` 가 빠져 있었습니다.
- 이전 판은 백엔드 스테이지를 "회사, 계정과목 체계, 회계연도, 기본 창고 생성"으로만 서술했습니다. 실제로는 프리셋 설치와 페르소나 텔레메트리 단계가 별도로 존재하며, 데모 데이터 단계는 조건부입니다.
- 이전 판의 파일 링크는 작성자 로컬 절대경로(`file:///Users/...`)였습니다. 저장소 상대경로로 교체했습니다 (docs/README.md 규약 3).
