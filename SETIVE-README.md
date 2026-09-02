# SETIVE ERP (ERPNext v16.33.0 Fork)

> **ERPNext 16.33.0** 버전을 포크(Fork)하여 한국 비즈니스 환경 및 국내 기업 요구사항에 특화된 Custom ERP를 구축하는 프로젝트입니다.

## 프로젝트 개요 및 핵심 목표

본 프로젝트는 오픈소스 ERP인 ERPNext 16.33.0을 기반으로, 국내 비즈니스 환경에 완전 최적화된 ERP 솔루션을 제공하는 것을 목적으로 합니다.

### 1. 한글화 (Localization)
- **UI 및 시스템 번역 최적화**: ERPNext 전체 인터페이스, 도크타입(DocType), 필드 라벨, 메시지의 한국어 자연어 표준화
- **용어 현지화**: 국내 기업 실무진에게 익숙한 세무·회계·인사·재고 용어로 체계적 번역 개편 및 가독성 향상

### 2. 한국화 (Korean Business Compliance & Custom App)
국내 ERP 제공사가 제공하는 세무, 회계, 급여계산 등 주요 법정/비즈니스 기능을 독립된 **Custom App** 형태로 개발하여 연동 및 제공합니다.
- **세무 / 회계 (Taxation & Accounting)**:
  - 한국식 계정과목체계(COA) 및 차대변 분개 처리 표준화
  - 원천징수, 부가가치세(VAT) 신고 데이터 생성
  - 국세청 홈택스 전자세금계산서 연동 및 매입/매출 대사 기능
- **급여계산 및 인사관리 (Payroll & HR)**:
  - 국내 근로기준법 기반 급여 계산 엔진 (통상임금, 연장·야간·휴일수당 등)
  - 4대 보험(국민연금, 건강보험, 고용보험, 산재보험) 요율 자동 계산 및 공제 처리
  - 퇴직금 추계액 및 연말정산 지원 모듈
- **국내 전용 기능 (Local Business Integrations)**:
  - 국내 금융기관 계좌 내역 연동 및 무통장 입금 자동 대사 기능 지원

### 3. 온톨로지 스키마 정의 (Ontology Schema Definition)
- **도메인 온톨로지 설계**: ERP 내 존재하는 엔티티(고객, 품목, 계정, 조직, 프로세스 등) 간의 개념 및 관계 구조 명시적 정의
- **데이터 구조화 & AI 확장성**: 지식 그래프(Knowledge Graph) 및 AI 엔진 연동을 위한 온톨로지 기반 스키마 메타데이터 구축

---

## 배포 및 운영 전략 (Deployment & Operations)

```
[ Base Source Repository (본 리포지토리: erpnext-16.33.0 Fork) ]
                           │
                           ▼ (원격지 이관 / Client Repository Sync)
[ 원격지 개발/빌드 환경 (Remote / Client Instance Workspace) ]
                           │
                           ▼ (고객 요구사항 반영 커스텀 빌드)
[ 클라우드 배포 (Cloud Deployment - Frappe Cloud / AWS / K8s) ]
```

1. **기준 소스 관리 (Base Repository)**:
   - 본 리포지토리는 ERPNext 16.33.0 포크 버전으로, 한글화, 한국화 커스텀 앱, 온톨로지 스키마의 표준 코드를 통합 관리하는 기준 소스(Base Source)입니다.
2. **원격지 이관 및 고객별 커스텀 빌드**:
   - 각 고객사 요청 발생 시, 기준 소스를 원격지로 이관(Sync/Transfer)합니다.
   - 원격지 소스 상에서 해당 고객사의 세부 요구사항에 맞추어 소스를 기준으로 빌드 작업을 수행합니다.
3. **클라우드 배포 (Cloud Deployment)**:
   - 각 고객 요청별로 빌드된 소스는 클라우드 인프라에 독립된 서비스로 배포되어 가동됩니다.

---

## ⚡ 프로젝트 기동 가이드 (Launch Guide)

IDE의 **실행 및 디버그 (Run and Debug / `F5`)** 메뉴에서 **`⚡ SETIVE ERP (Docker)`** 항목을 실행하면 팝업 선택 창에서 아래 옵션을 선택하여 구동할 수 있습니다 (설정 파일: [`docker/development/docker-compose.yml`](./docker/development/docker-compose.yml)):

- **기동**: `docker compose -f docker/development/docker-compose.yml up` 실행
- **중지**: `docker compose -f docker/development/docker-compose.yml down` 실행
- **재시작**: `docker compose -f docker/development/docker-compose.yml restart` 실행
- **초기화**: `docker compose -f docker/development/docker-compose.yml down -v` 실행