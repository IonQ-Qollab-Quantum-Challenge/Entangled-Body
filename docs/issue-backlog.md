# Entangled Body — GitHub Issues Backlog Draft

> 목적: 현재 코드 구조를 기준으로 파일 단위 우선순위를 정하고, 바로 GitHub Issues로 등록 가능한 초안을 제공합니다.

## 권장 Label 세트

- `priority:P0` (MVP blocker)
- `priority:P1` (MVP 핵심)
- `priority:P2` (개선)
- `area:web`
- `area:api`
- `area:quantum`
- `area:docs`
- `area:devops`
- `type:feature`
- `type:bug`
- `type:chore`
- `type:docs`
- `status:ready`

---

## P0 — 먼저 개발해야 하는 이슈 (MVP blocker)

### 1) [P0][api][feature] FastAPI 앱 기동/헬스체크/기본 라우팅 구현
- **Files**: `apps/api/main.py`, `apps/api/routes/quantum.py`
- **Goal**: `/health`, `/quantum/health` 동작 + CORS 설정
- **Acceptance**:
  - `GET /health` → `200 {"ok": true}`
  - `GET /quantum/health` → simulator/ionq 설정 상태 반환

### 2) [P0][quantum][feature] 기본 양자 회로 생성기 구현
- **Files**: `apps/api/quantum/circuits.py`
- **Goal**: hover/click/hold 시나리오용 6~8 qubit 회로 팩토리 제공
- **Acceptance**:
  - `build_hover_circuit(region, intensity)`
  - `build_click_circuit(region)`
  - `build_hold_circuit()`

### 3) [P0][quantum][feature] 시뮬레이터 실행 및 결과 표준화
- **Files**: `apps/api/quantum/run_simulator.py`
- **Goal**: counts/probabilities 표준 JSON 반환
- **Acceptance**:
  - shots 파라미터 처리
  - 예외 시 fallback 응답

### 4) [P0][quantum][feature] 양자 결과→바디 상태 매핑 핵심 로직
- **Files**: `apps/api/quantum/mapper.py`, `apps/api/data/body_region_map.json`
- **Goal**: bitstring을 region activation/coherence/displacement로 변환
- **Acceptance**:
  - deterministic mode(seed) 제공
  - region map 유효성 검증

### 5) [P0][web][feature] 3D 씬 골격 렌더링 + 포인트 클라우드 표시
- **Files**: `apps/web/components/BodyScene.tsx`, `apps/web/components/PointCloudBody.tsx`
- **Goal**: 최소 point cloud 시각화 및 카메라/조명 구성
- **Acceptance**:
  - 앱 접속 시 body point cloud 렌더링
  - 성능 저하 없이 기본 인터랙션 가능

### 6) [P0][web][feature] 사용자 인터랙션(hover/click/hold) 파이프라인 연결
- **Files**: `apps/web/components/InteractionLayer.tsx`, `apps/web/components/CollapseController.tsx`, `apps/web/lib/quantumClient.ts`
- **Goal**: UI 이벤트 → API 요청 → 상태 반영
- **Acceptance**:
  - hover 시 약한 반응
  - click/hold 시 collapse 트리거

---

## P1 — MVP 핵심 완성

### 7) [P1][api][feature] precompute 파이프라인 구현
- **Files**: `apps/api/quantum/precompute.py`, `apps/api/data/precomputed_samples.json`
- **Goal**: region/intensity 조합 샘플 생성 및 저장

### 8) [P1][api][feature] IonQ 실행 어댑터 + timeout/retry
- **Files**: `apps/api/quantum/run_ionq.py`
- **Goal**: 실제 IonQ 호출 어댑터 및 안전한 실패 처리

### 9) [P1][web][feature] 프론트 매핑 로직 구현
- **Files**: `apps/web/lib/mapQuantumToBody.ts`, `apps/web/lib/bodyRegions.ts`
- **Goal**: API 결과를 시각 파라미터(opacity/size/pulse)로 매핑

### 10) [P1][web][feature] 접근성 옵션 구현
- **Files**: `apps/web/lib/accessibility.ts`
- **Goal**: reduced motion, contrast, keyboard fallback

### 11) [P1][devops][chore] 로컬 개발 환경 스크립트 완성
- **Files**: `scripts/setup.sh`, `scripts/dev.sh`, `docker-compose.yml`, `package.json`, `apps/api/requirements.txt`
- **Goal**: 원커맨드 실행 보장

---

## P2 — 문서/예제/운영 고도화

### 12) [P2][docs][docs] 아키텍처/양자설계/인터랙션 문서 구체화
- **Files**: `docs/architecture.md`, `docs/quantum-design.md`, `docs/interaction-model.md`

### 13) [P2][docs][docs] 접근성/출처 문서 정리
- **Files**: `docs/accessibility.md`, `docs/attribution.md`

### 14) [P2][examples][feature] 실행 가능한 예제 스크립트 제공
- **Files**: `examples/run_local_simulation.py`, `examples/generate_precomputed_samples.py`, `examples/sample_quantum_output.json`

---

## GitHub 등록용 템플릿 (복붙)

### Issue Title
`[P0][area:web][feature] 3D 씬 골격 렌더링 + 포인트 클라우드 표시`

### Issue Body
```md
## 배경
MVP에서 사용자에게 즉시 보여줄 수 있는 최소 시각화가 필요합니다.

## 작업 범위
- BodyScene에 카메라/조명/컨트롤 구성
- PointCloudBody에 샘플 point cloud 렌더링

## 완료 기준 (Acceptance Criteria)
- [ ] 앱 최초 로드 시 point cloud가 렌더링된다.
- [ ] FPS 급락 없이 마우스 인터랙션이 가능하다.
- [ ] 타입/런타임 오류 없이 빌드된다.

## 관련 파일
- apps/web/components/BodyScene.tsx
- apps/web/components/PointCloudBody.tsx
```
