# SETIVE ERP 문서 체계

SETIVE ERP(ERPNext 16.33 포크)의 설계·구현 지식 저장소입니다.
문서는 두 갈래로 나뉩니다.

| 갈래 | 경로 | 성격 | 주 독자 |
|---|---|---|---|
| **KB** (Knowledge Base) | [`docs/kb/`](./kb/) | 코드에 결합된 구현 지식. 무엇을 어떻게 바꿨고 어떻게 검증했는가. | 개발자, 원격지 빌드 담당 |
| **ONT** (Ontology Source) | [`docs/ontology/`](./ontology/) | 코드에서 독립된 도메인 개념 모델. 개념·식별자·코드체계·관계. | 온톨로지/지식그래프 설계자, AI 엔진 |

두 갈래를 나눈 이유: KB는 코드가 바뀌면 같이 낡지만, ONT의 내용(국내 업종 코드체계, 세무 개념 등)은 제도가 바뀌지 않는 한 유효합니다.
온톨로지 스키마 설계는 ONT를 입력물로 삼고, KB는 "그 개념이 현재 시스템의 어디에 구현돼 있는지"를 되짚는 용도로 씁니다.

---

## 문서 목록

### KB — 구현 지식

| ID | 제목 | 도메인 |
|---|---|---|
| [KB-ARCH-001](./kb/KB-ARCH-001_setup_wizard_architecture.md) | 셋업 위저드 확장 아키텍처 (Frappe Core ↔ ERPNext App) | 아키텍처 |
| [KB-DEV-001](./kb/KB-DEV-001_makefile_automation.md) | Makefile 개발 자동화 타겟 | 개발 도구 |
| [KB-LOC-001](./kb/KB-LOC-001_regional_localization.md) | 시스템 지역 기본값 및 사용 언어 제한 | 한글화 |
| [KB-LOC-002](./kb/KB-LOC-002_gettext_po_compilation.md) | Gettext 번역 탐색 순위와 PO/MO 컴파일 | 한글화 |
| [KB-LOC-003](./kb/KB-LOC-003_fork_local_translation.md) | 번역 문자열 추가 규약 — 앱 ko.po 에 쓰고 포크 main.pot 만 갱신 (msgctxt) | 한글화 |
| [KB-KOR-001](./kb/KB-KOR-001_ksic_wizard_industry.md) | 셋업 위저드 업종 분류를 KSIC 대분류로 교체 | 한국화 |
| [KB-KOR-002](./kb/KB-KOR-002_korean_chart_of_accounts.md) | 한국 표준 계정과목표 (일반기업회계기준) 와 국세청 표준재무제표 코드 매핑 | 한국화 |
| [KB-KOR-003](./kb/KB-KOR-003_company_hook_tax_nts.md) | Company 훅 — 기본계정·창고·부가세 템플릿·국세청 표준코드 자동 설정 | 한국화 |
| [KB-OPS-001](./kb/KB-OPS-001_tenant_provisioning_deployment.md) | 테넌트 프로비저닝·배포 파이프라인 (SETIVE Backend 참조) | 운영·배포 |

### ONT — 온톨로지 입력물

| ID | 제목 | 대상 |
|---|---|---|
| [ONT-CLS-001](./ontology/ONT-CLS-001_korean_industry_code_systems.md) | 국내 업종 코드체계 (KSIC · 국세청 업종코드 · 산재보험 사업종류) | 분류체계 |

작성 규약은 [`docs/ontology/README.md`](./ontology/README.md)에도 별도로 있습니다.

---

## 문서 작성 규약

### 1. 파일명과 ID

```
<갈래>-<도메인>-<번호>_<slug>.md      예: KB-KOR-001_ksic_wizard_industry.md
```

도메인 코드는 다음만 씁니다. 새 코드가 필요하면 이 표에 먼저 추가합니다.

| 코드 | 의미 | 비고 |
|---|---|---|
| `ARCH` | 애플리케이션 아키텍처 | |
| `DEV` | 개발자 도구·빌드·CI | |
| `LOC` | 한글화 (번역·지역 설정) | SETIVE-README의 "한글화" |
| `KOR` | 한국화 (국내 법정/비즈니스 규칙) | SETIVE-README의 "한국화" |
| `OPS` | 운영·배포·프로비저닝 | 테넌트 서비스 운영 |
| `CLS` | 분류체계·코드체계 | ONT 전용 |
| `ENT` | 엔티티 개념 모델 | ONT 전용 |

### 2. 프런트매터 (필수)

모든 문서는 YAML 프런트매터로 시작합니다. 기계 수집(온톨로지 하베스팅, RAG 색인)의 진입점이므로 필드를 임의로 빼지 않습니다.

```yaml
---
id: KB-KOR-001
title: 셋업 위저드 업종 분류를 KSIC 대분류로 교체
domain: 한국화
status: active            # active | draft | superseded
applies_to:               # 이 문서가 유효한 버전
  - erpnext@16.33.0
  - frappe@v16
verified_on: 2026-09-02   # 사실관계를 마지막으로 실측한 날
verified_by: 소스 확인 + 런타임 검증
related: [ONT-CLS-001, KB-LOC-003]
---
```

### 3. 링크는 저장소 상대경로로

**절대 경로(`file:///Users/...`)를 쓰지 않습니다.** 이 저장소는 원격지·고객사 환경으로 이관되는 기준 소스이므로 작성자 로컬 경로는 모든 다른 독자에게서 깨지고, 디렉토리 구조가 불필요하게 노출됩니다.

`docs/kb/KB-XXX-001_....md` 에서 저장소 루트의 소스를 가리키는 경우:

```markdown
[`erpnext/public/js/setup_wizard.js`](../../erpnext/public/js/setup_wizard.js)      ✅
[`erpnext/public/js/setup_wizard.js`](file:///Users/edward/.../setup_wizard.js)     ❌
```

상대 깊이는 문서 위치에 따라 다릅니다 — `docs/` 는 `../`, `docs/kb/` 와 `docs/ontology/` 는 `../../` 로 루트에 닿습니다.

코드 위치를 짚을 때는 `경로:라인` 표기를 씁니다 (`erpnext/public/js/setup_wizard.js:130`).

### 4. 파일 전문을 인라인 복사하지 않기

Makefile, 설정 파일 등의 **전문을 문서에 붙여넣으면 반드시 낡습니다.** 실제로 KB-DEV-001은 Makefile 전문을 복사해 뒀다가 `lang` 타겟이 추가되면서 문서와 불일치 상태가 됐습니다. 인용은 요지가 드러나는 최소 발췌로 하고, 전체는 상대경로 링크로 넘깁니다.

### 5. 명세를 쓰고 주장을 쓰지 않기

"100% 주입", "완벽히 해결", "초고속", "생산성 극대화" 같은 표현은 검증 가능한 서술로 바꿉니다.

```
❌ 한국어가 100% Default로 주입되도록 보장함
✅ System Settings.language 가 비어 있을 때만 "ko" 를 기록한다 (install.py:69). 운영자가 고른 값은 덮어쓰지 않는다.
```

측정치를 쓸 때는 어떻게 측정했는지 함께 적습니다.

### 6. "검증" 절은 재현 가능하게

각 KB 문서 끝의 검증 절에는 **실행 가능한 명령**을 남깁니다. 결과만 적어두면 다음 사람이 재확인할 수 없습니다.

### 7. 사실을 고칠 때는 무엇이 틀렸는지 남기기

기존 문서의 서술이 코드와 다르면 조용히 덮어쓰지 말고 "이전 서술 정정" 항목으로 남깁니다. 낡은 문서를 신뢰해 잘못 판단할 다음 사람을 위한 장치입니다.
