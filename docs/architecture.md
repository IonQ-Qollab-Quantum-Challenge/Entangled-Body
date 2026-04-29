# Entangled Body — System Architecture

## 1. Overview

Entangled Body is a full-stack interactive system that combines:

- A **real-time 3D frontend**
- A **Python-based API backend**
- A **quantum computation layer (Qiskit + IonQ)**

The system is designed to treat the human body as a **non-local quantum system**, where interactions (measurement) affect distributed regions through entanglement.

---

## 2. High-Level Architecture
User Interaction
↓
Frontend (Next.js + Three.js)
↓
API Layer (FastAPI)
↓
Quantum Layer (Qiskit / IonQ)
↓
Processed State (JSON)
↓
Frontend Rendering (Point Cloud)

---

## 3. System Components

### 3.1 Frontend (`apps/web/`)

The frontend is responsible for:

- Rendering the 3D human body
- Capturing user interactions
- Visualizing quantum states

#### Core Components

##### 1. `BodyScene.tsx`

- Central scene manager
- Initializes:
  - Three.js canvas
  - Camera
  - Lighting
  - Controls
- Composes all visual layers

---

##### 2. `PointCloudBody.tsx`

- Renders the human body as a point cloud
- Applies quantum-derived visual states:
  - Opacity
  - Size
  - Displacement
  - Coherence

- Handles:
  - Collapse (localization)
  - Dispersion (superposition)

---

##### 3. `InteractionLayer.tsx`

- Captures user input:
  - Hover → weak measurement
  - Click → strong measurement

- Detects:
  - Target body region
  - Interaction intensity

- Sends requests to backend

---

##### 4. `CollapseController.tsx`

- Controls animation state transitions
- Receives quantum measurement results
- Handles:
  - Measuring state
  - Collapse timing
  - Global vs local transitions

---

### 3.2 Frontend Logic Layer (`apps/web/lib/`)

#### `bodyRegions.ts`

- Defines body regions:
  - head, chest, arm, leg, spine
- Maps regions → qubits
- Defines entanglement relationships

---

#### `quantumClient.ts`

- Handles API communication
- Sends:
  - Hover → precomputed request
  - Click → live quantum request
- Manages:
  - Timeout
  - Error fallback
  - Response parsing

---

#### `mapQuantumToBody.ts`

- Converts quantum output → visual state

Processes:

- Bitstring decoding
- Probability distribution
- Region activation
- Coherence & displacement mapping

---

#### `accessibility.ts`

- Ensures accessibility compliance:
  - Color contrast
  - Reduced motion mode
  - Keyboard interaction support

---

### 3.3 Static Assets (`apps/web/public/`)

- `models/` → 3D geometry
- `textures/` → particle & visual effects
- `data/` → lightweight frontend datasets

---

## 4. Backend (`apps/api/`)

Built with **FastAPI**, the backend serves as a bridge between:

- Frontend interaction
- Quantum computation

---

### 4.1 Core Entry

#### `main.py`

- Initializes FastAPI app
- Configures:
  - Routes
  - CORS
  - Health check

---

### 4.2 API Routes

#### `routes/quantum.py`

Provides endpoints:

- `POST /quantum/measure`
  - Executes live quantum measurement

- `GET /quantum/precomputed`
  - Returns precomputed results (low latency)

- `GET /quantum/health`
  - System status check

---

### 4.3 Quantum Layer (`apps/api/quantum/`)

---

#### `circuits.py`

Defines quantum circuits:

- 6–8 qubits representing body regions
- Entanglement structure
- Interaction-specific variants:
  - hover
  - click
  - hold

---

#### `run_simulator.py`

- Runs local Qiskit Aer simulation
- Used for:
  - Development
  - Fallback execution

---

#### `run_ionq.py`

- Connects to IonQ backend
- Handles:
  - Job submission
  - Result retrieval
  - Timeout & error handling

---

#### `mapper.py`

Transforms quantum output into frontend-ready data:

- Dominant bitstring extraction
- Probability distribution analysis
- Region-level activation calculation
- JSON response generation

---

#### `precompute.py`

- Generates precomputed samples
- Used for:
  - Hover interactions
  - Demo stability
  - Cost reduction (IonQ credits)

---

### 4.4 Backend Data (`apps/api/data/`)

#### `precomputed_samples.json`

- Pre-generated quantum outputs
- Enables:
  - Instant interaction
  - Reduced latency

---

#### `body_region_map.json`

- Defines:
  - Region ↔ qubit mapping
  - Entangled relationships
- Ensures frontend/backend consistency

---

## 5. Data Flow

### 5.1 Hover Interaction (Weak Measurement)
User hover
→ Frontend detects region
→ Request precomputed sample
→ Backend returns cached result
→ Frontend maps to visual state
→ Subtle body response

---

### 5.2 Click Interaction (Strong Measurement)
User click
→ Frontend sends measurement request
→ Backend builds quantum circuit
→ IonQ execution
→ Result returned
→ Mapper transforms output
→ Frontend triggers collapse animation

---

## 6. Deployment Architecture

### Frontend

- Deployed on:
  - Vercel (recommended)
- Provides:
  - Static + dynamic rendering

---

### Backend

- Deployed on:
  - AWS / container environment
- Runs:
  - FastAPI server
  - Quantum execution layer

---

### Containerization

#### `docker-compose.yml`

- Runs:
  - frontend
  - backend

- Enables:
  - Local development
  - Environment consistency

---

## 7. Design Principles

### 7.1 Quantum as System Logic

- Quantum mechanics is not visual decoration
- It **drives system behavior**

---

### 7.2 Non-local Interaction

- One interaction affects multiple regions
- Achieved via entanglement mapping

---

### 7.3 Probabilistic Output

- Each interaction produces different results
- No deterministic state

---

### 7.4 Accessibility-first Design

- Visual alternatives
- Reduced motion
- Keyboard support

---

## 8. Summary

This architecture enables:

- Real-time interactive experience
- Hybrid quantum-classical computation
- Scalable and modular system design
- Reproducibility and extensibility

---