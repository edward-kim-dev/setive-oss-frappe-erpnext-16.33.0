---
id: KB-LOC-001
title: 시스템 지역 기본값 및 사용 언어 제한
domain: 한글화
status: active
applies_to:
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02
verified_by: erpnext/setup/install.py · hooks.py 소스 직접 확인
related: [KB-ARCH-001, KB-LOC-002]
---

# KB-LOC-001: 시스템 지역 기본값 및 사용 언어 제한

## 1. 요약

두 가지를 합니다.

1. **사용 언어 제한** — `Language` 테이블에서 `en, ko, ja, zh, zh-TW` 5개만 `enabled=1` 로 두고 나머지를 끕니다.
2. **지역 기본값 주입** — `System Settings` 를 `ko` / `Korea, Republic of` / `Asia/Seoul` / `KRW` 로 설정하고 `Administrator` 의 언어를 `ko` 로 둡니다.

핵심 제약은 **운영자가 고른 값을 덮어쓰지 않는 것**입니다. 설치 시점에만 강제하고, 이후 마이그레이션에서는 값이 비어 있을 때만 채웁니다.

## 2. 구성

```
[erpnext/hooks.py]
   ├─ after_install = "erpnext.setup.install.after_install"
   └─ after_migrate = "erpnext.setup.install.after_migrate"
                │
                ▼
[erpnext/setup/install.py]
   ├─ after_install()  → configure_target_languages(force_defaults=True)   ← 무조건 기록
   ├─ after_migrate()  → configure_target_languages()                      ← 비어 있을 때만
   └─ configure_target_languages(force_defaults=False)
        ├─ Language.enabled 를 대상 5개 코드만 1로 UPDATE (frappe.qb + Case)
        └─ force_defaults 이거나 System Settings.language 가 비었을 때만
             System Settings {language, country, time_zone, currency} 기록
             + User "Administrator".language = "ko"
                │
                ▼
[erpnext/public/js/setup_wizard.js]
   └─ frappe.setup.utils.setup_language_field 래핑
        + frappe.setup.on("before_load") 에서 welcome 슬라이드 language 기본값 주입
```

관련 파일:

- [`erpnext/setup/install.py`](../../erpnext/setup/install.py) — `configure_target_languages()`, `after_migrate()`
- [`erpnext/hooks.py`](../../erpnext/hooks.py) — `after_install`, `after_migrate`
- [`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js) — 위저드 언어 필드 보정

## 3. 위저드 언어 필드 보정

### 3.1 문제

코어 `load_prefilled_data()` 는 `System Settings` 의 언어 **코드**(`"ko"`)를 `frappe.wizard.values.language` 에 넣습니다.
그러나 위저드 언어 필드는 Autocomplete이고 그 옵션의 `value` 는 언어 **라벨명**(`"한국어"`)입니다. 코드값 그대로는 매칭에 실패합니다.

### 3.2 처리

`frappe.setup.utils.setup_language_field` 를 래핑해, 원본 호출 전에 `frappe.wizard.values.language` 를 라벨명으로 환산합니다.

```javascript
const codes_to_names = frappe.setup.data.lang?.codes_to_names || {};
let val = frappe.wizard?.values?.language;
if (codes_to_names[val]) val = codes_to_names[val];        // "ko" → "한국어"
else if (!val) val = frappe.setup.data.lang?.default_language;
if (val && frappe.wizard) frappe.wizard.values.language = val;
```

정규화된 라벨명을 되돌려주면 코어가 `df.default` 와 `set_input` 을 알아서 처리합니다.

### 3.3 사용자 선택 보존

`before_load` 에서 기본값을 심을 때 특정 언어를 하드코딩하지 않고 서버가 계산해 내려주는 `default_language` 를 씁니다.

```javascript
const target_default = frappe.wizard?.values?.language || frappe.setup.data.lang?.default_language;
if (lang_field && target_default) lang_field.default = target_default;
```

`frappe.wizard.values.language` 를 먼저 보므로, 사용자가 이미 고른 값이 있으면 그것이 유지됩니다.
특정 언어를 무조건 덮어쓰면 슬라이드 갱신(`refresh_slides()`)마다 선택이 리셋됩니다.

### 3.4 래핑 순서 전제

```javascript
const original_setup_language_field = frappe.setup.utils.setup_language_field;
```

코어가 `frappe.setup.utils` 를 통째로 재할당하므로, 이 파일이 코어 페이지 스크립트보다 먼저 평가되면 래핑이 유실됩니다.
`setup_wizard_requires` 로 주입되는 파일은 항상 코어 이후에 로드된다는 전제를 지켜야 합니다 (KB-ARCH-001 §3.1).

## 4. 검증

```bash
# 지역 기본값
docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.client.get_value \
  --kwargs "{\"doctype\": \"System Settings\", \"fieldname\": [\"language\", \"country\", \"time_zone\", \"currency\"]}"'
# 기대: {"language": "ko", "country": "Korea, Republic of", "time_zone": "Asia/Seoul", "currency": "KRW"}

# 활성 언어 목록
docker exec setive-backend sh -lc 'cd /home/frappe/frappe-bench && \
  bench --site localhost execute frappe.db.get_list \
  --kwargs "{\"doctype\": \"Language\", \"filters\": {\"enabled\": 1}, \"pluck\": \"language_code\"}"'
# 기대: en, ko, ja, zh, zh-TW

# 기본값 재적용 (컨테이너 재생성 후 복구용)
make lang
```

## 5. 이전 서술 정정

이전 판에는 코드와 맞지 않는 서술이 있었습니다.

| 이전 서술 | 실제 |
|---|---|
| "`after_migrate` 및 **`override_whitelisted_methods`** 후크 등록" | `override_whitelisted_methods` 는 `frappe.www.contact.send_message` → `erpnext.templates.utils.send_message` 매핑 하나뿐이며 언어와 무관합니다 (`hooks.py:60`) |
| "**`load_languages`** 백엔드 API 오버라이드" | 그런 오버라이드는 존재하지 않습니다. 실제 메커니즘은 `configure_target_languages()` 의 `Language.enabled` UPDATE 입니다 |
| "코어 슬라이드는 하드코딩된 `default: \"English\"`" | 현재 코어는 서버가 내려주는 `default_language` 를 씁니다. 문제의 본질은 하드코딩이 아니라 코드값/라벨명 불일치입니다 |
| "한국어가 100% Default로 주입되도록 보장", "두 가지 상충 요소를 완벽히 해결" | 검증 가능한 서술로 대체 (§1, §3.3) |

이전 판의 절대경로 링크(`file:///Users/...`)도 상대경로로 교체했습니다.
