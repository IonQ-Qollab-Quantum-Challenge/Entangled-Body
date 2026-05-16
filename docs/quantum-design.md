# Entangled Body Quantum Hardware Design

## Purpose

Entangled Body must treat every blue point in the body visualization as a quantum node that can be mapped to a real qubit, connected to other nodes through an entangling circuit, and rendered from actual measurement statistics.

The visual layer may be expressive, but the scientific layer must be strict:

- A blue point is a `QuantumNode`.
- A connected pair of blue points is a candidate entanglement edge.
- A visible entanglement edge is shown only when circuit-derived correlation data supports it.
- Activation, coherence, measured bit, collapse state, and link strength are derived from shot counts.
- IonQ hardware is used only when a real IonQ backend executes the circuit.
- Qiskit Aer remains the default local backend because real hardware has queue latency, cost, credentials, and availability constraints.

This design supports the current 14-node blue-point graph and can scale to a denser node graph later.

## Current Repository Context

The project already contains the required base structure:

- `apps/api/quantum/circuits.py`: builds Qiskit circuits for hover, click, and hold interactions.
- `apps/api/quantum/run_simulator.py`: runs Qiskit Aer measurements.
- `apps/api/quantum/run_ionq.py`: contains the IonQ adapter placeholder and credential detection.
- `apps/api/quantum/mapper.py`: converts counts into marginals, correlations, body states, node states, and entanglement links.
- `apps/api/routes/quantum.py`: exposes `/quantum/health`, `/quantum/precomputed`, and `/quantum/measure`.
- `apps/web/lib/quantumClient.ts`: calls the backend from the browser.

The next step is to replace the placeholder IonQ path with a real hardware job adapter while keeping the same response contract used by the frontend.

## Blue Point Quantum Node Model

Each blue point rendered on the body should be represented by a stable node object.

```json
{
  "id": "torso",
  "region": "torso",
  "qubitIndex": 1,
  "position": [0.0, 1.2, 0.0],
  "candidateLinks": ["chest", "oxygenTank", "rightLeg", "leftLeg"],
  "activation": 0.503906,
  "coherence": 0.994,
  "measuredBit": 1,
  "backend": "ionq_qpu"
}
```

For the current version, each visible blue point is represented as one stable region and one logical qubit. A future high-density version can group many blue points into logical clusters and submit only the selected cluster anchors to hardware.

### Region-to-Qubit Register

```text
q0 = head
q1 = chest
q2 = torso
q3 = oxygenTank
q4 = rightShoulder
q5 = leftShoulder
q6 = rightArm
q7 = leftArm
q8 = rightHand
q9 = leftHand
q10 = rightLeg
q11 = leftLeg
q12 = rightFoot
q13 = leftFoot
```

The register order must stay stable across the frontend, API, circuit builder, and result mapper. A change to this mapping changes the meaning of every measured bitstring.

## Entanglement Circuit Families

The app should use three circuit families. Each family creates real quantum correlations through gates, then projects the result into the blue-point graph.

| Interaction | Circuit | Hardware Use | Visual Meaning |
| --- | --- | --- | --- |
| Hover | `local_probe` | Simulator or precomputed by default | A light probe of a node and its nearby candidate links |
| Click | `bell_pair` | Good IonQ QPU candidate | Strong pairwise entanglement between selected blue node and target node |
| Hold | `ghz_body` | Good IonQ QPU candidate when queue/cost allow | Body-wide multipartite entanglement and global collapse |

### Local Probe Circuit

Use this circuit for hover or fast previews. It entangles the selected region with its candidate neighbors, then applies a small intensity rotation.

```text
H(selected)
for target in linked_targets:
  CX(selected, target)
RY(intensity * pi / 6, selected)
MEASURE all
```

Expected behavior:

- The selected node has a marginal probability affected by the probe intensity.
- Candidate links show measurable correlation when the selected node fans out to nearby targets.
- This path should normally run on Aer or precomputed samples because hover interactions need low latency.

### Bell Pair Circuit

Use this circuit when a user clicks a blue point. It creates a two-node entangled pair.

```text
H(source)
CX(source, target)
MEASURE all
```

Ideal result:

```text
P(00) ~= 0.5
P(11) ~= 0.5
P(01) ~= 0.0
P(10) ~= 0.0
```

The UI should render the source and target as an entangled blue-node pair when their mutual information and absolute ZZ correlation pass the link threshold.

### GHZ Body Circuit

Use this circuit when the user holds a blue point or triggers body-wide collapse.

```text
H(torso)
CX(torso, head)
CX(torso, chest)
CX(torso, oxygenTank)
CX(torso, rightShoulder)
CX(torso, leftShoulder)
CX(torso, rightArm)
CX(torso, leftArm)
CX(torso, rightHand)
CX(torso, leftHand)
CX(torso, rightLeg)
CX(torso, leftLeg)
CX(torso, rightFoot)
CX(torso, leftFoot)
MEASURE all
```

Ideal result:

```text
P(00000000000000) ~= 0.5
P(11111111111111) ~= 0.5
```

The UI should render all selected body nodes as globally correlated when the dominant outcomes are the all-zero and all-one families. On hardware, noise will introduce additional bitstrings, so the acceptance check should use correlation strength and dominant support rather than expecting perfect counts.

## IonQ Hardware Backend Design

IonQ execution should be implemented as a backend adapter behind the same API contract as Aer.

IonQ's official Qiskit workflow uses:

- Python package: `qiskit-ionq`
- Provider class: `qiskit_ionq.IonQProvider`
- Simulator backend: `ionq_simulator`
- QPU backend: `ionq_qpu` or a specific QPU backend name such as an Aria/Forte target when available to the account
- Credential source: an IonQ API key, preferably from an environment variable

Reference:

- IonQ Qiskit SDK docs: https://docs.ionq.com/sdks/qiskit
- Qiskit IonQ provider usage: https://qiskit-community.github.io/qiskit-ionq/guides/usage.html

### Required Configuration

Add `qiskit-ionq` to the backend dependencies when hardware execution is enabled.

```text
qiskit-ionq>=1.0.0
```

Runtime environment:

```bash
IONQ_API_KEY=...
IONQ_BACKEND=ionq_qpu
IONQ_SIMULATOR_BACKEND=ionq_simulator
IONQ_QPU_BACKEND=ionq_qpu
IONQ_SHOTS=1024
IONQ_ENABLE_HARDWARE=false
IONQ_TIMEOUT_SECONDS=120
```

`IONQ_ENABLE_HARDWARE` must default to `false`. This prevents accidental paid hardware submissions during local development, demos, CI, and automated tests.

The backend loads configuration from the process environment first, then `apps/api/.env`, then the repo-root `.env`. API keys must never be committed. Use `apps/api/.env.example` as the committed template.

### Backend Selector

The API should accept an explicit backend request.

```json
{
  "region": "torso",
  "interaction": "click",
  "intensity": 1,
  "shots": 1024,
  "backend": "ionq_hardware",
  "seed": 42
}
```

Supported backend values:

| Value | Meaning |
| --- | --- |
| `aer` | Local Qiskit Aer execution |
| `ionq_simulator` | IonQ cloud simulator through `qiskit-ionq` |
| `ionq_hardware` | Real IonQ QPU execution |
| `precomputed` | Saved real circuit samples |
| `fallback` | Emergency local payload when execution fails |

The response must report the backend that actually ran the circuit, not only the backend requested by the user.

```json
{
  "requestedBackend": "ionq_hardware",
  "backend": "ionq_qpu",
  "hardware": true,
  "provider": "ionq",
  "jobId": "job-id-from-provider",
  "jobStatus": "completed"
}
```

If the request falls back, the response must say so clearly.

```json
{
  "requestedBackend": "ionq_hardware",
  "backend": "aer",
  "hardware": false,
  "source": "fallback",
  "fallbackReason": "IONQ_ENABLE_HARDWARE is false."
}
```

The implemented safety policy is:

- `aer` never requires IonQ credentials and remains the default.
- `ionq_simulator` uses `qiskit-ionq` only when `IONQ_API_KEY` and the package are available; otherwise it returns an Aer fallback payload with `fallbackReason`.
- `ionq_hardware` submits to the QPU only when `IONQ_API_KEY` is available and `IONQ_ENABLE_HARDWARE=true`; otherwise it returns an Aer fallback payload and does not call IonQ.
- `/quantum/health` exposes configuration booleans and backend names, but never exposes the API key.

### Curl Examples

Local Aer:

```bash
curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"torso","interaction":"click","shots":128,"backend":"aer","seed":42}'
```

IonQ simulator:

```bash
curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"rightHand","interaction":"click","shots":128,"backend":"ionq_simulator"}'
```

IonQ hardware:

```bash
curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"leftFoot","interaction":"click","shots":128,"backend":"ionq_hardware"}'
```

## IonQ Adapter Implementation

The hardware adapter should live in `apps/api/quantum/run_ionq.py`.

### Synchronous Path

Use synchronous execution only for simulator jobs or small hardware jobs where waiting is acceptable.

```python
from qiskit_ionq import IonQProvider

from quantum.circuits import build_measurement_circuit, circuit_type_for_interaction


def run_ionq_measurement(region: str, intensity: float, shots: int, interaction: str) -> dict:
    provider = IonQProvider()
    backend = provider.get_backend("ionq_qpu")
    circuit = build_measurement_circuit(region, intensity, interaction)
    job = backend.run(circuit, shots=shots)
    result = job.result()
    counts = result.get_counts()

    return {
        "backend": backend.name,
        "provider": "ionq",
        "hardware": True,
        "jobId": job.job_id(),
        "jobStatus": str(job.status()),
        "circuitType": circuit_type_for_interaction(interaction),
        "shots": shots,
        "counts": counts,
    }
```

The production implementation should wrap this with credential checks, `IONQ_ENABLE_HARDWARE`, error handling, and explicit fallback metadata.

### Asynchronous Hardware Path

Real QPU jobs can sit in a queue. For production, split hardware execution into three endpoints.

```text
POST /quantum/jobs
  -> validates request
  -> builds circuit
  -> submits IonQ job
  -> returns jobId immediately

GET /quantum/jobs/{jobId}
  -> returns provider status

GET /quantum/jobs/{jobId}/result
  -> retrieves counts
  -> computes marginals, correlations, node states, and links
```

The existing `/quantum/measure` endpoint can continue to support Aer and precomputed results. It may also submit IonQ jobs only when the caller explicitly requests synchronous hardware behavior.

## API Response Contract

Every backend must normalize into this response shape.

```json
{
  "backend": "ionq_qpu",
  "requestedBackend": "ionq_hardware",
  "provider": "ionq",
  "hardware": true,
  "jobId": "provider-job-id",
  "jobStatus": "completed",
  "circuitType": "bell_pair",
  "region": "torso",
  "shots": 1024,
  "qubits": 6,
  "counts": {
    "000000": 508,
    "111111": 516
  },
  "probabilities": {
    "000000": 0.496094,
    "111111": 0.503906
  },
  "marginals": {
    "torso": {
      "p0": 0.496094,
      "p1": 0.503906,
      "expectationZ": -0.007812,
      "entropy": 0.999956
    }
  },
  "correlations": [
    {
      "source": "torso",
      "target": "head",
      "zz": 0.992188,
      "mutualInformation": 0.958
    }
  ],
  "regionStates": {},
  "nodeStates": [],
  "entanglementLinks": [],
  "analysisVersion": 1
}
```

The frontend must never infer that hardware was used from animation style. It should trust only `hardware: true`, `provider: "ionq"`, and a completed provider job result.

## Counts-to-Blue-Node Projection

The mapper must convert raw counts into deterministic quantum statistics.

| Field | Formula | Blue-Point Use |
| --- | --- | --- |
| `p1` | shots where node qubit is `1` divided by total shots | Node activation |
| `expectationZ` | `P(0) - P(1)` | Signed displacement or collapse direction |
| `entropy` | binary entropy of the marginal | Uncertainty |
| `coherence` | `1 - entropy`, optionally capped by pair correlation | Node sharpness |
| `zz` | `P(00) + P(11) - P(01) - P(10)` | Pair correlation |
| `mutualInformation` | joint distribution compared with marginals | Link visibility |

Recommended link rule:

```text
show_link(source, target) =
  pair is in candidate graph
  and abs(zz) >= 0.50
  and mutualInformation >= 0.04
```

For noisy IonQ hardware results, the UI should use graded strength rather than binary perfection:

```text
link_strength = clamp(max(abs(zz), mutualInformation), 0, 1)
```

## Frontend Behavior

The frontend should treat every rendered blue point as a quantum node with hardware-aware metadata.

Required display values:

- Backend: `Aer`, `IonQ Simulator`, `IonQ QPU`, `Precomputed`, or `Fallback`.
- Hardware status: `Queued`, `Running`, `Completed`, `Failed`, or `Fallback`.
- Circuit type: `local_probe`, `bell_pair`, or `ghz_body`.
- Shot count.
- Dominant bitstring.
- Top measured bitstrings.
- Selected node qubit index.
- Selected node measured bit probability.
- Visible entanglement link strength.

Rendering rules:

- Draw a blue node for every body point or region anchor.
- Draw an entanglement line only when it is returned in `entanglementLinks`.
- Use line brightness from `link.strength`.
- Use node glow from marginal `p1` or `activation`.
- Use node steadiness from `coherence`.
- Show a clear fallback label whenever `source: "fallback"` appears.
- Do not label a run as hardware unless `hardware` is `true`.

## Hardware Safety Rules

IonQ hardware execution must be opt-in.

- Do not run hardware jobs in CI.
- Do not run hardware jobs when `IONQ_ENABLE_HARDWARE` is missing or `false`.
- Do not run hardware jobs from hover events.
- Prefer click and hold events for hardware submission.
- Limit default hardware shots to a conservative value such as `100`, `256`, or `1024`.
- Store API keys only in environment variables or secret managers.
- Never send an IonQ API key to the browser.
- Always expose queue state and fallback reason in the API response.

## Implementation Plan

### Phase 1: Keep Aer Scientifically Honest

- Keep `aer` as the default backend.
- Ensure `/quantum/measure` returns counts, probabilities, marginals, correlations, `regionStates`, `nodeStates`, and `entanglementLinks`.
- Keep visual treatment out of scientific fields.
- Verify Bell and GHZ circuits against ideal simulator outputs.

### Phase 2: Add Backend Selection

- Add `backend` to `MeasurementRequest`.
- Route `aer` to `run_aer_measurement`.
- Route `ionq_simulator` and `ionq_hardware` to `run_ionq_measurement`.
- Return `requestedBackend`, actual `backend`, `provider`, `hardware`, and fallback metadata.
- Add `qiskit-ionq` as an optional or documented hardware dependency.

### Phase 3: Replace IonQ Placeholder With Real Submission

- Load `IonQProvider` only inside the IonQ adapter so local Aer remains usable without `qiskit-ionq`.
- Check `IONQ_API_KEY`.
- Check `IONQ_ENABLE_HARDWARE`.
- Select `IONQ_BACKEND`, defaulting to `ionq_qpu` for hardware and `ionq_simulator` for cloud simulation.
- Submit the Qiskit circuit with `backend.run(circuit, shots=shots)`.
- Normalize `job.result().get_counts()` into the existing mapper pipeline.

### Phase 4: Add Async Job Endpoints

- Add a job table or lightweight persistent store for submitted IonQ job IDs.
- Add `/quantum/jobs`, `/quantum/jobs/{jobId}`, and `/quantum/jobs/{jobId}/result`.
- Let the frontend show queued/running state on the selected blue nodes.
- Map the final counts back into node states when the job completes.

### Phase 5: Dense Blue-Point Scaling

- Keep the hardware circuit limited to a small logical register.
- Group many visual blue points into logical qubit clusters.
- Assign one anchor node per logical qubit for hardware execution.
- Broadcast the measured logical state back to all visual points in that cluster.

## Verification Checklist

- A Bell pair click produces high correlation for the selected pair on Aer.
- A GHZ hold run is dominated by `000000` and `111111` on Aer.
- IonQ simulator returns the same normalized response shape as Aer.
- IonQ hardware response includes `provider: "ionq"`, `hardware: true`, `jobId`, and `jobStatus`.
- Hardware fallback includes `hardware: false` and `fallbackReason`.
- The frontend never draws links that are missing from `entanglementLinks`.
- The dashboard displays the actual backend that executed the circuit.
- Repeated seeded Aer requests are deterministic.

## Non-Goals

- Do not claim that the human body is physically quantum-entangled.
- Do not claim that blue points are physical qubits. They are visual nodes mapped to logical circuit qubits.
- Do not make IonQ hardware the default path.
- Do not submit hardware jobs from high-frequency hover events.
- Do not hide noise. Hardware noise is part of the result and should be visible through measured counts and weaker correlations.
