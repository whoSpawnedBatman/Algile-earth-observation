# ORBITAL — Machine Learning-Based Task Scheduling for Agile Earth Observation Satellites

**ORBITAL** is an academic aerospace & machine learning engineering platform demonstrating how **Classical Machine Learning (Random Forest Classification)** combined with a **Constraint-Aware Combinatorial Scheduler** optimizes observation task scheduling for an Agile Earth Observation Satellite (AEOS) in a 620 km Sun-Synchronous Low Earth Orbit.

---

## 1. Key Capabilities

- **Classical Machine Learning Engine (`backend/app/ml/`)**:
  - Generates a reproducible synthetic dataset ($N = 600$, `seed = 42`) of historical satellite observation passes.
  - Engineers 13 domain-specific physical features (kinematic slack time, window utilization ratio, attitude slew angular velocity in $\text{deg/s}$, sensor-adjusted cloud obscuration, SSR write bandwidth in $\text{GB/s}$, and reward-per-Wh efficiency).
  - Performs Z-score standardization and an 80% / 20% stratified train/test split.
  - Trains a **Random Forest Classifier** (CART decision tree ensemble using Gini impurity splitting) to predict task feasibility probability $P(\text{feasible} \mid \mathbf{x})$ and computes Accuracy, Precision, Recall, F1-Score, Specificity, ROC-AUC, and the $2 \times 2$ Confusion Matrix.
- **Constraint-Aware Multi-Strategy Scheduler (`backend/app/scheduler/`)**:
  - Evaluates three scheduling strategies on the exact same candidate mission scenario:
    1. **ML-Assisted Scheduling (`ml_assisted`)**
    2. **Priority-Based Scheduling (`priority_based`)**
    3. **Reward-Efficiency-Based Scheduling (`reward_efficiency`)**
  - Strictly enforces hard spacecraft bus constraints:
    - Visibility time windows (`[window_start, window_end]`)
    - Attitude control reaction wheel slew rate limit ($2.35^\circ/\text{s}$)
    - Zero simultaneous task conflicts (`[manoeuvre_start, execution_end]` intervals never overlap)
    - Electrical Power Subsystem (EPS) energy budget ceiling ($\text{Wh}$)
    - Solid-State Recorder (SSR) onboard data storage ceiling ($\text{GB}$)
- **Aerospace Mission-Control Frontend (`src/`)**:
  - 7 interactive sections: **Mission Overview**, **Task Scheduling**, **ML Model Performance**, **Orbital Timeline**, **Resource Monitoring**, **Task Manifest**, and **Simulation History**.
  - Interactive J2 LEO Ground-Track Visualizer, Gantt attitude-slew/lock timeline, Recharts telemetry curves, custom task injector, and RFC-4180 CSV exporter.

---

## 2. Project Structure

```text
orbital/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI + Standard-Library HTTP Server entrypoint
│   │   ├── api/
│   │   │   └── routes.py            # REST API endpoint handlers & validation
│   │   ├── ml/
│   │   │   ├── dataset.py           # Synthetic Earth Observation pass generator
│   │   │   ├── preprocessing.py     # 13-feature engineering & Z-score scaler
│   │   │   └── classifier.py        # Classical Random Forest Classifier & metrics
│   │   ├── scheduler/
│   │   │   └── engine.py            # Constraint-aware 3-strategy scheduling engine
│   │   ├── models/
│   │   │   └── schemas.py           # Task dataclasses & payload validators
│   │   └── services/
│   │       └── simulation_service.py# Mission simulation & history orchestration
│   ├── tests/
│   │   └── test_orbital.py          # Automated Python test suite (Pytest / unittest)
│   └── requirements.txt
├── src/
│   ├── components/                  # 7 Mission Control sections + Orbital Ground Track Map
│   ├── services/api.ts              # Frontend REST API client
│   ├── types/orbital.ts             # TypeScript telemetry & ML interfaces
│   ├── utils/
│   │   ├── orbitalLogic.ts          # Pure scheduling verification & CSV helpers
│   │   └── orbitalLogic.test.ts     # Node built-in unit tests
│   └── App.tsx
├── e2e/
│   └── orbital.spec.ts              # Playwright browser E2E test suite
├── server.ts                        # Full-stack Express + Vite server bridging Python backend
├── README.md
├── ARCHITECTURE.md
├── MODEL_REPORT.md
└── SAMPLE_DATASET.csv
```

---

## 3. Windows Local Setup Instructions

### Prerequisites
- **Python 3.10+** (with `pip` enabled)
- **Node.js 18+** (with `npm`)

### Step 1: Set Up and Run the Python Backend (Windows PowerShell / CMD)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# Run the automated Python backend tests
pytest -v
# Or using standard library unittest:
python -m unittest discover -s tests -v

# Start the FastAPI server on port 8000
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Step 2: Set Up and Run the Frontend & Full-Stack Server

Open a second terminal in the root project folder:

```powershell
npm install

# Run frontend unit tests
npm run test:unit

# Start the full-stack application on http://localhost:3000
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 4. REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Returns backend service status, trained model flag, and recorded run count. |
| `GET` | `/api/model` | Returns Random Forest hyperparameters, 80/20 train/test metrics, confusion matrix, feature importances, calibration curve, and synthetic dataset preview. |
| `POST` | `/api/schedule` | Accepts a custom array of candidate tasks and bus constraints (`max_energy_wh`, `max_storage_gb`, `ml_threshold`), runs all 3 strategies, and returns scheduled/rejected manifests. |
| `POST` | `/api/simulation` | Generates a synthetic orbital pass scenario (or resets via `{"action": "reset"}`) and compares `ml_assisted`, `priority_based`, and `reward_efficiency`. |
| `GET` | `/api/history` | Returns the audit log of executed simulation runs and the latest active simulation state. |

---

## 5. Viva Preparation Notes (Simple Engineering Summary)

1. **Problem Statement**: Agile Earth Observation Satellites (AEOS) receive many more ground imaging requests per pass than they can execute due to overlapping visibility windows, finite attitude slew agility, onboard battery limits (Wh), storage limits (GB), and cloud cover.
2. **Role of Machine Learning**: We use a classical **Random Forest Classifier** (not Deep Learning or LLMs) trained on 13 physical features to predict the probability $P(\text{feasible} \mid \mathbf{x})$ that an observation request will succeed both kinematically and radiometrically.
3. **Role of the Constraint Scheduler**: The scheduler combines the Random Forest's feasibility probability with a deterministic constraint solver. It guarantees **zero conflicting tasks** and ensures energy and storage limits are never violated.
4. **Key Experimental Finding**: Under identical orbital scenarios, **ML-Assisted Scheduling** achieves higher realized science reward and higher average imagery quality than naive Priority-Based scheduling because it avoids wasting timeline slots and battery power on cloud-obscured high-priority targets.
