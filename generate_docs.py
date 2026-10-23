import os
from fpdf import FPDF
from fpdf.enums import XPos, YPos

# --- GENERATE PDF ---
class PDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 15)
        self.cell(0, 10, 'Atlas Flux - Complete System Report', border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align='C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', border=0, align='C')

pdf = PDF()
pdf.add_page()
pdf.set_font("Helvetica", size=11)

report_text = """The Atlas Flux architecture is a masterclass in combining AI, blockchain, and real-time 3D visualization to solve grid reliability and renewable intermittency.

PART 1: THE CORE 5-LAYER PIPELINE
The backend pipeline simulates a full day of energy grid operations, including a mid-day coordinated cyber-physical attack, processing everything through five distinct layers:

Layer 0: Trust, Attestation & Threat Mesh
This is the security brain. It uses a custom-built Neural Network (Multi-Layer Perceptron) that has been hyperparameter-tuned against logistic-regression baselines. It analyzes the grid as a graph to detect "MadIoT" style coordinated attacks. It includes the Federated Attack Signature Mesh (FASM), allowing different grid feeders to share "attack signatures" using a privacy-preserving hashing protocol (SimHash).

Layer 1: Chit-Fund & Thermal Storage
Handles community fairness and physical storage physics. Households pool resources via a Chit-Fund Smart Contract. If the grid needs to cut power, this contract mathematically guarantees that power cuts rotate fairly among households. It also models physical constraints of Thermal and Battery Energy Storage Systems.

Layer 2: Forecasting Engine
The predictive engine looks at weather data and seasonal load profiles to forecast the gap between renewable energy generation and household demand. It calculates the Cumulative Energy Deficit Risk against the current battery buffer.

Layer 3: Dispatch & Fairness
The active decision-maker. It takes predictions from Layer 2, fairness rules from Layer 1, and security trust-gates from Layer 0 to execute physical actions: charging batteries, discharging, or load shedding.

Layer 4: Blockchain Audit Ledger
The immutable source of truth. It uses Merkle-root anchoring to batch thousands of telemetry readings into a single cryptographic hash, acting as a permanent, fraud-proof ledger of every dispatch decision.

PART 2: THE INTERFACES

1. The Atlas 3D Twin
The Premium Executive Visualization Layer built with React and Three.js. It visualizes the physical infrastructure and seamlessly transitions to a "Digital Twin" topology view. It orchestrates the anomaly visually: distressed assets turn amber, telemetry packets route to the Hub, grid flow reroutes, and Battery Storage discharges.

2. The Gods Eye View
The Macro-Level Command Center. It allows operators to look down upon the entire federated network (multiple feeders) to track where the Federated Attack Signature Mesh is detecting threats regionally.

3. The Layer 5 Dashboards
The Hard-Data Engineering UI. Split into DISCOM (Distribution Company) View and Household View to show raw summary stats, hourly risk, dispatch timelines, and cryptographic proofs of fairness.
"""

# FPDF2 standard multi_cell usage
pdf.multi_cell(w=0, h=6, text=report_text.encode('latin-1', 'replace').decode('latin-1'))

pdf.output("Atlas_Flux_Final_Report.pdf")
print("Saved PDF.")
