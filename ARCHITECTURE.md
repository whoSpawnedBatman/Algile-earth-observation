# ORBITAL — System Architecture & Scheduling Algorithm Specification

## 1. High-Level System Architecture

ORBITAL separates **Offline/Online ML Feasibility Inference** from **Deterministic Combinatorial Constraint Scheduling**:

```text
+-------------------------------------------------------------------------+
|                   FRONTEND MISSION CONTROL (React + Vite)               |
|  1. Overview | 2. Scheduler | 3. ML Metrics | 4. Timeline | 5. Resources|
+------------------------------------+------------------------------------+
                                     | REST JSON (/api/*)
                                     v
+-------------------------------------------------------------------------+
|                    BACKEND API LAYER (Python / FastAPI)                 |
|     Input Validation -> OrbitalSimulationService -> History Archive     |
+------------------+-----------------------------------+------------------+
                   |                                   |
                   v                                   v
+------------------------------------+   +--------------------------------+
|   CLASSICAL ML FEASIBILITY ENGINE  |   |  CONSTRAINT-AWARE SCHEDULER    |
| - Synthetic Pass Generator (N=600) |   | - ML-Assisted Strategy         |
| - 13-Feature Engineering Pipeline  |   | - Priority-Based Strategy      |
| - Z-Score FeatureScaler            |   | - Reward-Efficiency Strategy   |
| - Random Forest Classifier (CART)  |   | - Hard Bus & Window Invariants |
+------------------------------------+   +--------------------------------+
```

---

## 2. Constraint-Aware Scheduling Algorithm

Given a set of candidate observation tasks $\mathcal{T} = \{t_1, t_2, \dots, t_M\}$ over a single orbital pass $[0, H]$:

### Hard Physical Constraints Enforced for Every Task $t_i$:

1. **Visibility Window & Attitude Slew Containment**:
   Let $w_{\text{start}}(t_i)$ and $w_{\text{end}}(t_i)$ be the target visibility window boundaries, $d_{\text{slew}}(t_i)$ be the attitude manoeuvre duration, and $d_{\text{img}}(t_i)$ be the imaging duration. A scheduled task is assigned a manoeuvre start time $s_i$ and execution end time $e_i = s_i + d_{\text{slew}}(t_i) + d_{\text{img}}(t_i)$ such that:
   $$w_{\text{start}}(t_i) \le s_i < e_i \le w_{\text{end}}(t_i)$$
2. **Reaction Wheel Slew Torque Envelope**:
   $$\frac{\theta_{\text{slew}}(t_i)}{\max(d_{\text{slew}}(t_i), 1)} \le \omega_{\max} = 2.35^\circ/\text{s}$$
3. **Strict Mutual Exclusion (Zero Simultaneous Task Conflicts)**:
   For any pair of scheduled tasks $t_i \neq t_j$:
   $$[s_i, e_i) \cap [s_j, e_j) = \emptyset$$
4. **Electrical Power Subsystem (EPS) Energy Limit**:
   $$\sum_{t_i \in \mathcal{S}} E(t_i) \le E_{\max} \quad (\text{default } 320\text{ Wh})$$
5. **Solid-State Recorder (SSR) Storage Capacity Limit**:
   $$\sum_{t_i \in \mathcal{S}} S(t_i) \le S_{\max} \quad (\text{default } 165\text{ GB})$$

### Comparative Ranking Strategies:

- **Strategy 1 — ML-Assisted Scheduling (`ml_assisted`)**:
  Screens out candidate tasks with Random Forest feasibility probability $P_{\text{RF}}(t_i) < \tau_{\text{ML}}$ or optical cloud cover above threshold, then ranks tasks by:
  $$\text{Score}_{\text{ML}}(t_i) = \frac{P_{\text{RF}}(t_i)^{1.35} \cdot R(t_i) \cdot (1 + 0.085 \cdot \text{Priority}(t_i))}{\left(0.55 \cdot E(t_i) + 0.45 \cdot S(t_i)\right)^{0.42}}$$
- **Strategy 2 — Priority-Based Scheduling (`priority_based`)**:
  Ranks strictly by descending `Priority` tier ($10 \to 1$), breaking ties by nominal reward $R(t_i)$ and earliest window start $w_{\text{start}}(t_i)$.
- **Strategy 3 — Reward-Efficiency Scheduling (`reward_efficiency`)**:
  Ranks greedily by reward per unit of resource consumption:
  $$\text{Score}_{\text{Eff}}(t_i) = \frac{R(t_i)}{0.55 \cdot E(t_i) + 0.45 \cdot S(t_i) + 0.15 \cdot (d_{\text{img}}(t_i) + d_{\text{slew}}(t_i))}$$

---

## 3. Known Engineering Limitations

1. **Sequence-Independent Slew Approximation**: Attitude slew duration $d_{\text{slew}}(t_i)$ is pre-computed relative to the nominal nadir ground-track pointing vector rather than solving a quadratic 3-axis quaternion boundary-value problem between every pair $(t_i, t_j)$.
2. **Single-Pass Horizon**: Each simulation models a single 90-minute LEO sun-synchronous orbital pass (`5400s`) rather than multi-day orbital decay or X-band ground station downlink dumps.
3. **Synthetic Training Domain**: The Random Forest classifier is trained on physics-informed synthetic historical pass logs (`N=600`) with Gaussian atmospheric/attitude noise rather than proprietary telemetry from a commercial spacecraft operator.
