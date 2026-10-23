import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Environment, ContactShadows, Line, Grid, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, DepthOfField } from '@react-three/postprocessing';
import './index.css';

import { CameraDirector } from './components/CameraDirector';

import { WindTurbine } from './components/WindPower';
import { BatteryStorage } from './components/EnergyStorage';
import { SciFiSubstation, SciFiTransmissionTower, EnergySpire, PhysicalCable } from './components/Distribution';
import { Village } from './components/Civilian';
import { SolarFarm } from './components/SolarFarm';
import { Terrain, getTerrainHeight } from './components/Terrain';
import { SensorNode, ScanningWave } from './components/CyberPunkUI';
import { EnergyFlowLine } from './components/CyberPunkUI';
import { useFrame } from '@react-three/fiber';

// Global context for the scanning wave position
export const ScanContext = React.createContext({ current: -300 });

// Progresses the scanning wave across the map when digital twin is active
const ScanManager = ({ simulationState, scanRef, onSyncProgress }) => {
  const localTime = React.useRef(0);
  useFrame((state, delta) => {
    const isDigitalTwin = ['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState);
    if (isDigitalTwin) {
      if (localTime.current < 6) {
        localTime.current += delta;
      }
      // Scan moves from x = -300 to x = 300 over 6 seconds
      const progress = Math.min(localTime.current / 6, 1);
      scanRef.current = -300 + (progress * 600);
      
      // Update HUD progress (only during the transition phase)
      if (simulationState === 'DIGITAL_TWIN' && onSyncProgress) {
         onSyncProgress(Math.floor(progress * 100));
      }
    } else {
      localTime.current = 0;
      scanRef.current = -300;
      if (onSyncProgress) onSyncProgress(0);
    }
  });
  return null;
};

// Wraps an asset and turns on its digital twin mode only when the scan wave passes it
const ScannedAsset = ({ xPos, children, baseDigitalTwin }) => {
  const scanRef = React.useContext(ScanContext);
  const [scanned, setScanned] = React.useState(false);
  
  useFrame(() => {
    if (scanRef.current > xPos && !scanned) setScanned(true);
    else if (scanRef.current <= -290 && scanned) setScanned(false);
  });

  const active = baseDigitalTwin && scanned;

  return React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { isDigitalTwin: active });
    }
    return child;
  });
};

export default function App() {
  const [simulationState, setSimulationState] = useState('OVERVIEW');
  const [anomalyActive, setAnomalyActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const scanRef = React.useRef(-300);

  useEffect(() => {
    if (simulationState === 'ANOMALY') {
      setAnomalyActive(true);
    } else if (simulationState === 'RECOVERY' || simulationState === 'OVERVIEW_RETURN') {
      setAnomalyActive(false);
    }
  }, [simulationState]);

  const isDigitalTwin = ['DIGITAL_TWIN', 'ANOMALY_DETECTED', 'ANALYZING', 'REROUTING', 'BATTERY_DISPATCH', 'RECOVERY'].includes(simulationState);

  // Deriving the Intelligence Data state
  let intelligenceState = "MONITORING";
  let intelligenceColor = "#10b981"; // Green
  let networkHealth = "98.7%";
  
  if (simulationState === 'ANOMALY_DETECTED') {
    intelligenceState = "WARNING";
    intelligenceColor = "#fbbf24"; // Amber
    networkHealth = "92.6%";
  } else if (simulationState === 'ANALYZING') {
    intelligenceState = "ANALYZING";
    intelligenceColor = "#fff"; // White
    networkHealth = "92.6%";
  } else if (simulationState === 'REROUTING' || simulationState === 'BATTERY_DISPATCH') {
    intelligenceState = "OPTIMIZING";
    intelligenceColor = "#0ea5e9"; // Cyan
    networkHealth = "95.0%";
  } else if (simulationState === 'RECOVERY') {
    intelligenceState = "RECOVERING";
    intelligenceColor = "#10b981";
    networkHealth = "97.4%";
  } else if (simulationState === 'DIGITAL_TWIN') {
    intelligenceState = "SYNCHRONIZED";
  }

  // Derive system state for HUD
  let systemStatus = 'OPTIMAL';
  let systemStatusColor = '#10b981';
  let gridLoad = '76.4%';
  let gridLoadColor = '#fff';
  let windOutput = '100%';
  let windOutputColor = '#0ea5e9';
  let anomalyText = '';
  let responseText = '';

  if (['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState)) {
    systemStatus = 'WARNING';
    systemStatusColor = '#fbbf24';
    gridLoad = '87.4%';
    gridLoadColor = '#fbbf24';
    windOutput = '82%';
    windOutputColor = '#fbbf24';
    anomalyText = 'DETECTED';
  } else if (['REROUTING', 'BATTERY_DISPATCH'].includes(simulationState)) {
    systemStatus = 'OPTIMIZING';
    systemStatusColor = '#0ea5e9';
    gridLoad = '84.0%';
    windOutput = '82%';
    responseText = 'ACTIVE';
  } else if (simulationState === 'RECOVERY') {
    systemStatus = 'OPTIMAL';
    gridLoad = '80.0%';
    windOutput = '90%';
    responseText = 'COMPLETE';
  }
  // Define node coordinates to draw glowing network lines between them
  // Array maps to [x, y, z] by calculating terrain height dynamically
  const nodes = [
    [-80, -40],  // Node 0: WT-01
    [-30, -50],  // Node 1: SolarBlock
    [60, -70],   // Node 2: H2 Tanks
    [-50, 30],   // Node 3: SolarBlock
    [60, 40],    // Node 4: H2 Tanks
    [20, 70],    // Node 5: WT-02
    [0, 0],      // Node 6: Central Solar Farm/Core Nexus
    [-120, -80], // Node 7: WT-04
    [90, -20],   // Node 8: WT-05
    [-50, 60],   // Node 9: WT-06
    [100, 70],   // Node 10: WT-07
    [-40, -10],  // Node 11: Substation BANER
    [30, 20],    // Node 12: Substation HINJAWADI
    [-20, 30],   // Node 13: Tower KOTHRUD
    [40, -40],   // Node 14: Tower
    [-60, -10],  // Node 15: Village A
    [80, 20]     // Node 16: Village B
  ].map(([x, z]) => {
    // Spread them out by multiplying by 2
    const scaledX = x * 2;
    const scaledZ = z * 2;
    return [scaledX, getTerrainHeight(scaledX, -scaledZ), scaledZ];
  });

  const windStatus = (['ANOMALY_DETECTED', 'ANALYZING', 'REROUTING'].includes(simulationState)) ? 'warning' : 'healthy';
  const bessStatus = (simulationState === 'BATTERY_DISPATCH') ? 'warning' : 'healthy';
  const defaultStatus = 'healthy';

  return (
    <div className="canvas-container" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020813' }}>
      
      {/* DOM Overlay - Cinematic HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: 'none', display: 'flex', justifyContent: 'space-between', padding: '40px', boxSizing: 'border-box' }}>
        
        {/* Left Messaging */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          maxWidth: '400px', 
          pointerEvents: 'auto',
          opacity: ['OVERVIEW', 'GENERATION', 'GRID', 'HUB'].includes(simulationState) ? 1 : 0.4,
          transform: `scale(${['OVERVIEW', 'GENERATION', 'GRID', 'HUB'].includes(simulationState) ? 1 : 0.97})`,
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <h1 style={{ color: '#fff', fontSize: '3rem', margin: 0, fontFamily: '"JetBrains Mono", sans-serif', fontWeight: 700, letterSpacing: '-1px' }}>Atlas Flux</h1>
          <p style={{ color: '#0ea5e9', fontSize: '1.2rem', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}>AI Energy Network Digital Twin</p>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginTop: '20px', lineHeight: '1.6' }}>
            An intelligent energy ecosystem being continuously monitored, simulated, optimized and controlled in real time.
          </p>

        </div>

        {/* Right / HUD Data */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-end', 
          gap: '12px',
          opacity: simulationState === 'OVERVIEW' ? 0 : 1,
          transform: `translateX(${simulationState === 'OVERVIEW' ? '20px' : '0'})`,
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          
          {/* DIGITAL TWIN SYNC HUD */}
          {['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState) && (
            <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #00f0ff', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(10px)', width: '250px', textAlign: 'right' }}>
              <div style={{ color: '#00f0ff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                {syncProgress < 100 ? 'SYNCING DIGITAL TWIN...' : 'NETWORK MODEL SYNCHRONIZED'}
              </div>
              <div style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 'bold', marginTop: '5px', fontFamily: 'monospace' }}>
                {syncProgress}%
              </div>
              {syncProgress === 100 && (
                 <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: '5px' }}>ACTIVE NODES: 1,248</div>
              )}
            </div>
          )}

          <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(8px)', width: '250px' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>System State</div>
            <div style={{ color: systemStatusColor, fontSize: '1.5rem', fontWeight: 'bold', marginTop: '5px' }}>
              {systemStatus}
            </div>
            {anomalyText && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '5px' }}>ANOMALY: {anomalyText}</div>
            )}
            {responseText && (
              <div style={{ color: '#0ea5e9', fontSize: '0.9rem', marginTop: '5px' }}>AI RESPONSE: {responseText}</div>
            )}
            {simulationState === 'RESPONSE' && (
              <div style={{ color: '#0ea5e9', fontSize: '0.9rem', marginTop: '5px' }}>BATTERY DISPATCH ACTIVE</div>
            )}
          </div>
          
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(8px)', width: '250px' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Grid Load</div>
            <div style={{ color: gridLoadColor, fontSize: '2rem', fontWeight: 'bold', marginTop: '5px' }}>{gridLoad}</div>
            <div style={{ width: '100%', height: '4px', background: '#334155', marginTop: '10px', borderRadius: '2px' }}>
               <div style={{ width: gridLoad, height: '100%', background: gridLoadColor, borderRadius: '2px' }} />
            </div>
            <div style={{ color: windOutputColor, fontSize: '0.9rem', marginTop: '10px' }}>Wind Output: {windOutput}</div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(51, 65, 85, 0.5)', padding: '15px', borderRadius: '8px', backdropFilter: 'blur(8px)', width: '250px' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Renewable Share</div>
            <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold', marginTop: '5px' }}>68.2%</div>
            <div style={{ color: '#10b981', fontSize: '0.9rem', marginTop: '5px' }}>System Health: {networkHealth}</div>
          </div>
          
          <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: `1px solid ${intelligenceColor}`, padding: '15px', borderRadius: '8px', backdropFilter: 'blur(8px)', width: '250px' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>Intelligence State</div>
            <div style={{ color: intelligenceColor, fontSize: '1.2rem', fontWeight: 'bold', marginTop: '10px', letterSpacing: '1px' }}>
              {intelligenceState}
            </div>
            {['ANOMALY_DETECTED'].includes(simulationState) && <div style={{ color: '#fbbf24', fontSize: '0.8rem', marginTop: '5px' }}>WIND-01 Output Drop Detected</div>}
            {['ANALYZING'].includes(simulationState) && <div style={{ color: '#fff', fontSize: '0.8rem', marginTop: '5px' }}>Calculating Optimal Route...</div>}
            {['REROUTING'].includes(simulationState) && <div style={{ color: '#0ea5e9', fontSize: '0.8rem', marginTop: '5px' }}>Rerouting Grid Path...</div>}
            {['BATTERY_DISPATCH'].includes(simulationState) && <div style={{ color: '#0ea5e9', fontSize: '0.8rem', marginTop: '5px' }}>Executing Battery Dispatch</div>}
          </div>
        </div>

        {/* Bottom Right Controls */}
        <div style={{ position: 'absolute', bottom: '40px', right: '40px', pointerEvents: 'auto', zIndex: 20 }}>
          <button 
            onClick={() => setIsPaused(!isPaused)} 
            style={{ 
              background: isPaused ? 'rgba(56, 189, 248, 0.1)' : 'rgba(56, 189, 248, 0.2)', 
              color: isPaused ? '#38bdf8' : '#38bdf8', 
              border: `1px solid rgba(56, 189, 248, 0.5)`, 
              padding: '6px 12px', 
              borderRadius: '4px', 
              fontSize: '0.8rem',
              fontWeight: '600', 
              cursor: 'pointer',
              letterSpacing: '1px',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease'
            }}
          >
            {isPaused ? '▶ RESUME SEQUENCE' : '⏸ PAUSE SEQUENCE'}
          </button>
        </div>

        {/* Bottom Sequence Indicator */}
        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', padding: '10px 20px', borderRadius: '20px', border: '1px solid #334155', color: '#0ea5e9', fontSize: '0.8rem', letterSpacing: '2px', opacity: 0.6 }}>
          SEQUENCE: {simulationState}
        </div>
      </div>

      <Canvas shadows camera={{ position: [0, 250, 350], fov: 45 }} dpr={[1, 2]}>
        <fog attach="fog" args={['#020813', 100, 600]} />
        <CameraDirector onStateChange={setSimulationState} isPaused={isPaused} />
        {isPaused && <OrbitControls makeDefault />}

        <color attach="background" args={['#020813']} />
        <Sky sunPosition={[100, 20, -100]} turbidity={0.9} rayleigh={0.02} exposure={0.05} />
        
        {/* Soft Environmental Fill */}
        <hemisphereLight skyColor={isDigitalTwin ? "#0ea5e9" : "#ffffff"} groundColor="#020813" intensity={0.15} />
        
        {/* Strong Directional Sunlight for Physical Shadows */}
        <directionalLight 
          castShadow 
          position={[80, 40, -80]} 
          intensity={1.2} 
          color={isDigitalTwin ? "#e0f2fe" : "#fffbeb"}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={10}
          shadow-camera-far={400}
          shadow-bias={-0.0005}
        >
          <orthographicCamera attach="shadow-camera" args={[-200, 200, 200, -200]} />
        </directionalLight>
        
        <Environment preset="city" background={false} />

        <ScanContext.Provider value={scanRef}>
          <ScanManager simulationState={simulationState} scanRef={scanRef} onSyncProgress={setSyncProgress} />
          <ScanningWave scanRef={scanRef} />

          {/* Topographic Rolling Hills Terrain - Becomes wireframe in Digital Twin */}
          <ScannedAsset xPos={-200} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <Terrain />
          </ScannedAsset>

          {/* Assets Placement */}
          <WindTurbine position={[nodes[0][0], nodes[0][1], nodes[0][2]]} scale={1.5} id="WT-01" />
          
          <ScannedAsset xPos={nodes[1][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <SolarFarm position={[nodes[1][0], nodes[1][1], nodes[1][2]]} scale={1.2} id="SOLAR-ALPHA" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[2][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <BatteryStorage position={[nodes[2][0], nodes[2][1], nodes[2][2]]} scale={1.5} id="STORAGE-MAIN" simulationState={simulationState} />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[3][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <SolarFarm position={[nodes[3][0], nodes[3][1], nodes[3][2]]} scale={1.2} id="SOLAR-BETA" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[4][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <BatteryStorage position={[nodes[4][0], nodes[4][1], nodes[4][2]]} scale={1.5} id="STORAGE-SEC" chargeLevel="64%" simulationState={simulationState} />
          </ScannedAsset>
          
          <WindTurbine position={[nodes[5][0], nodes[5][1], nodes[5][2]]} scale={1.8} id="WT-02" phaseOffset={1} />
          <WindTurbine position={[-200, getTerrainHeight(-200, -60), 60]} scale={1.6} id="WT-03" phaseOffset={2} />
          
          {/* Additional Wind Turbines */}
          <WindTurbine position={[nodes[7][0], nodes[7][1], nodes[7][2]]} scale={1.6} id="WT-04" phaseOffset={0.5} />
          <WindTurbine position={[nodes[8][0], nodes[8][1], nodes[8][2]]} scale={1.9} id="WT-05" phaseOffset={1.5} />
          <WindTurbine position={[nodes[9][0], nodes[9][1], nodes[9][2]]} scale={1.7} id="WT-06" phaseOffset={2.5} />
          <WindTurbine position={[nodes[10][0], nodes[10][1], nodes[10][2]]} scale={1.5} id="WT-07" phaseOffset={3.5} />
          
          {/* Core Distribution Infrastructure (Atlas Flux) */}
          <SciFiSubstation position={[nodes[11][0], nodes[11][1], nodes[11][2]]} scale={1.5} id="SUB-BANER" />
          <SciFiSubstation position={[nodes[12][0], nodes[12][1], nodes[12][2]]} scale={1.5} id="SUB-HINJAWADI" />
          <SciFiTransmissionTower position={[nodes[13][0], nodes[13][1], nodes[13][2]]} scale={1.5} id="TWR-KOTHRUD" />
          <SciFiTransmissionTower position={[nodes[14][0], nodes[14][1], nodes[14][2]]} scale={1.5} id="TWR-MAIN" />

          {/* Central Energy Spire Hub */}
          <EnergySpire position={[nodes[6][0], nodes[6][1], nodes[6][2]]} scale={2} />

          {/* Civilian Consumption Nodes (Smart Cities) */}
          <ScannedAsset xPos={nodes[15][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <Village position={[nodes[15][0], nodes[15][1], nodes[15][2]]} scale={1.5} id="CITY-ALPHA" simulationState={simulationState} />
          </ScannedAsset>
          <ScannedAsset xPos={nodes[16][0]} baseDigitalTwin={['DIGITAL_TWIN', 'ANOMALY', 'RESPONSE', 'RECOVERY'].includes(simulationState)}>
            <Village position={[nodes[16][0], nodes[16][1], nodes[16][2]]} scale={1.5} id="CITY-BETA" simulationState={simulationState} />
          </ScannedAsset>

        {/* Glowing Network Power Lines (With Flowing Particles) */}
        <group>
          {/* Dynamic pulsing power lines connecting Wind Turbines to Hub */}
          <EnergyFlowLine points={[[nodes[7][0], nodes[7][1] + 1, nodes[7][2]], [nodes[0][0], nodes[0][1] + 1, nodes[0][2]]]} color="#00ffaa" speed={0.8} />
          <EnergyFlowLine points={[[nodes[8][0], nodes[8][1] + 1, nodes[8][2]], [nodes[14][0], nodes[14][1] + 1, nodes[14][2]]]} color="#00ffaa" speed={1.2} />
          <EnergyFlowLine points={[[nodes[9][0], nodes[9][1] + 1, nodes[9][2]], [nodes[13][0], nodes[13][1] + 1, nodes[13][2]]]} color="#00ffaa" speed={1.5} />
          <EnergyFlowLine points={[[nodes[10][0], nodes[10][1] + 1, nodes[10][2]], [nodes[12][0], nodes[12][1] + 1, nodes[12][2]]]} color="#00ffaa" speed={1.0} />

          {/* Solar Farm connections */}
          <EnergyFlowLine points={[[nodes[1][0], nodes[1][1] + 1, nodes[1][2]], [nodes[11][0], nodes[11][1] + 1, nodes[11][2]]]} color="#00ffaa" particleCount={8} />
          <EnergyFlowLine points={[[nodes[3][0], nodes[3][1] + 1, nodes[3][2]], [nodes[13][0], nodes[13][1] + 1, nodes[13][2]]]} color="#00ffaa" particleCount={8} />

          {/* Battery Storage connections */}
          <EnergyFlowLine points={[[nodes[2][0], nodes[2][1] + 1, nodes[2][2]], [nodes[6][0], nodes[6][1] + 1, nodes[6][2]]]} color="#00f0ff" speed={2.0} particleCount={10} />
          <EnergyFlowLine points={[[nodes[4][0], nodes[4][1] + 1, nodes[4][2]], [nodes[14][0], nodes[14][1] + 1, nodes[14][2]]]} color="#00f0ff" speed={2.0} />

          <EnergyFlowLine points={[[nodes[0][0], nodes[0][1] + 1, nodes[0][2]], [nodes[11][0], nodes[11][1] + 1, nodes[11][2]]]} color="#00f0ff" />
          <EnergyFlowLine points={[[nodes[5][0], nodes[5][1] + 1, nodes[5][2]], [nodes[12][0], nodes[12][1] + 1, nodes[12][2]]]} color="#00f0ff" />
          <EnergyFlowLine points={[[nodes[11][0], nodes[11][1] + 1, nodes[11][2]], [nodes[6][0], nodes[6][1] + 1, nodes[6][2]]]} color="#00f0ff" speed={3} particleCount={15} />
          <EnergyFlowLine points={[[nodes[12][0], nodes[12][1] + 1, nodes[12][2]], [nodes[6][0], nodes[6][1] + 1, nodes[6][2]]]} color="#00f0ff" speed={3} particleCount={15} />
          <EnergyFlowLine points={[[nodes[13][0], nodes[13][1] + 1, nodes[13][2]], [nodes[6][0], nodes[6][1] + 1, nodes[6][2]]]} color="#00f0ff" speed={3} particleCount={15} />
          <EnergyFlowLine points={[[nodes[14][0], nodes[14][1] + 1, nodes[14][2]], [nodes[6][0], nodes[6][1] + 1, nodes[6][2]]]} color="#00f0ff" speed={3} particleCount={15} />

          {/* Power delivery to Civilian Villages (Yellow and Red for Fault Simulation) */}
          <EnergyFlowLine points={[[nodes[11][0], nodes[11][1] + 1, nodes[11][2]], [nodes[15][0], nodes[15][1] + 1, nodes[15][2]]]} color="#ffcc00" speed={1.5} particleCount={12} dataType="power" />
          <EnergyFlowLine points={[[nodes[12][0], nodes[12][1] + 1, nodes[12][2]], [nodes[16][0], nodes[16][1] + 1, nodes[16][2]]]} color={(simulationState === 'ANOMALY') ? "#ff0055" : (simulationState === 'RESPONSE' ? "#ffcc00" : "#00ffaa")} speed={(simulationState === 'ANOMALY') ? 0.2 : 1.5} particleCount={12} dataType="power" />

          {/* DATA FLOW LINES (Fast, small, white/cyan particles representing intelligence) */}
          <EnergyFlowLine points={[[nodes[6][0], nodes[6][1] + 5, nodes[6][2]], [nodes[1][0], nodes[1][1] + 5, nodes[1][2]]]} color="#ffffff" speed={5} particleCount={20} dataType="data" />
          <EnergyFlowLine points={[[nodes[6][0], nodes[6][1] + 5, nodes[6][2]], [nodes[2][0], nodes[2][1] + 5, nodes[2][2]]]} color="#ffffff" speed={5} particleCount={20} dataType="data" />
        </group>

        {/* Physical Conductor Cables */}
        <group>
          {/* Main transmission corridors between towers and substations */}
          <PhysicalCable start={[nodes[11][0], nodes[11][1] + 30, nodes[11][2]]} end={[nodes[13][0], nodes[13][1] + 30, nodes[13][2]]} sag={15} />
          <PhysicalCable start={[nodes[13][0], nodes[13][1] + 30, nodes[13][2]]} end={[nodes[6][0], nodes[6][1] + 30, nodes[6][2]]} sag={15} />
          <PhysicalCable start={[nodes[12][0], nodes[12][1] + 30, nodes[12][2]]} end={[nodes[6][0], nodes[6][1] + 30, nodes[6][2]]} sag={15} />
          <PhysicalCable start={[nodes[14][0], nodes[14][1] + 30, nodes[14][2]]} end={[nodes[6][0], nodes[6][1] + 30, nodes[6][2]]} sag={15} />
          
          {/* Collection lines from generation to substations */}
          <PhysicalCable start={[nodes[0][0], nodes[0][1] + 20, nodes[0][2]]} end={[nodes[11][0], nodes[11][1] + 15, nodes[11][2]]} sag={10} />
          <PhysicalCable start={[nodes[1][0], nodes[1][1] + 10, nodes[1][2]]} end={[nodes[11][0], nodes[11][1] + 15, nodes[11][2]]} sag={5} />
          <PhysicalCable start={[nodes[5][0], nodes[5][1] + 20, nodes[5][2]]} end={[nodes[12][0], nodes[12][1] + 15, nodes[12][2]]} sag={10} />
          
          {/* Distribution to villages */}
          <PhysicalCable start={[nodes[11][0], nodes[11][1] + 15, nodes[11][2]]} end={[nodes[15][0], nodes[15][1] + 10, nodes[15][2]]} sag={5} />
          <PhysicalCable start={[nodes[12][0], nodes[12][1] + 15, nodes[12][2]]} end={[nodes[16][0], nodes[16][1] + 10, nodes[16][2]]} sag={5} />
        </group>

        {/* TELEMETRY & SENSOR LAYER (The Invisible Nervous System) */}
        <group name="DataIntelligenceLayer">
          <ScannedAsset xPos={nodes[0][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[0][0], 45, nodes[0][2]]} status={['ANOMALY_DETECTED', 'ANALYZING', 'REROUTING'].includes(simulationState) ? 'warning' : 'healthy'} label="WIND-01" />
          </ScannedAsset>
          <ScannedAsset xPos={nodes[5][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[5][0], 45, nodes[5][2]]} status={defaultStatus} label="WIND-02" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[1][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[1][0], 8, nodes[1][2]]} status={defaultStatus} label="SOLAR-A" />
          </ScannedAsset>
          <ScannedAsset xPos={nodes[3][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[3][0], 8, nodes[3][2]]} status={defaultStatus} label="SOLAR-B" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[2][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[2][0], 12, nodes[2][2]]} status={defaultStatus} label="BESS-MAIN" />
          </ScannedAsset>
          <ScannedAsset xPos={nodes[4][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[4][0], 12, nodes[4][2]]} status={simulationState === 'BATTERY_DISPATCH' ? 'warning' : 'healthy'} label="BESS-SEC" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[11][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[11][0], 15, nodes[11][2]]} status={['ANOMALY_DETECTED', 'ANALYZING', 'REROUTING'].includes(simulationState) ? 'warning' : 'healthy'} label="SUB-01" />
          </ScannedAsset>
          <ScannedAsset xPos={nodes[12][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[12][0], 15, nodes[12][2]]} status={defaultStatus} label="SUB-02" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[15][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[15][0], 10, nodes[15][2]]} status={['ANOMALY_DETECTED', 'ANALYZING', 'REROUTING'].includes(simulationState) ? 'warning' : 'healthy'} label="CITY-D04" />
          </ScannedAsset>
          
          <ScannedAsset xPos={nodes[6][0]} baseDigitalTwin={isDigitalTwin}>
             <SensorNode position={[nodes[6][0], 25, nodes[6][2]]} status={simulationState === 'ANALYZING' ? 'warning' : 'healthy'} label="INTELLIGENCE-HUB" />
          </ScannedAsset>

          {/* TELEMETRY ROUTING (Fast, lightweight white data packets) */}
          {syncProgress > 20 && (
            <group>
              <EnergyFlowLine points={[[nodes[0][0], 45, nodes[0][2]], [nodes[11][0], 15, nodes[11][2]]]} color={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? "#fbbf24" : "#ffffff"} speed={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? 12 : 6} particleCount={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? 8 : 3} dataType="data" />
              <EnergyFlowLine points={[[nodes[1][0], 8, nodes[1][2]], [nodes[11][0], 15, nodes[11][2]]]} color="#ffffff" speed={6} particleCount={3} dataType="data" />
              <EnergyFlowLine points={[[nodes[5][0], 45, nodes[5][2]], [nodes[12][0], 15, nodes[12][2]]]} color="#ffffff" speed={6} particleCount={3} dataType="data" />
              <EnergyFlowLine points={[[nodes[3][0], 8, nodes[3][2]], [nodes[12][0], 15, nodes[12][2]]]} color="#ffffff" speed={6} particleCount={3} dataType="data" />
            </group>
          )}
          
          {syncProgress > 50 && (
            <group>
              <EnergyFlowLine points={[[nodes[11][0], 15, nodes[11][2]], [nodes[6][0], 25, nodes[6][2]]]} color={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? "#fbbf24" : "#ffffff"} speed={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? 10 : 5} particleCount={['ANOMALY_DETECTED', 'ANALYZING'].includes(simulationState) ? 8 : 5} dataType="data" />
              <EnergyFlowLine points={[[nodes[12][0], 15, nodes[12][2]], [nodes[6][0], 25, nodes[6][2]]]} color="#ffffff" speed={5} particleCount={5} dataType="data" />
              <EnergyFlowLine points={[[nodes[2][0], 12, nodes[2][2]], [nodes[6][0], 25, nodes[6][2]]]} color="#0ea5e9" speed={8} particleCount={4} dataType="data" />
              <EnergyFlowLine points={[[nodes[4][0], 12, nodes[4][2]], [nodes[6][0], 25, nodes[6][2]]]} color={simulationState === 'BATTERY_DISPATCH' ? "#fbbf24" : "#0ea5e9"} speed={simulationState === 'BATTERY_DISPATCH' ? 12 : 8} particleCount={simulationState === 'BATTERY_DISPATCH' ? 8 : 4} dataType="data" />
            </group>
          )}
          
          {syncProgress > 80 && (
            <group>
              <EnergyFlowLine points={[[nodes[15][0], 10, nodes[15][2]], [nodes[6][0], 25, nodes[6][2]]]} color="#ffffff" speed={7} particleCount={4} dataType="data" />
              <EnergyFlowLine points={[[nodes[16][0], 10, nodes[16][2]], [nodes[6][0], 25, nodes[6][2]]]} color="#ffffff" speed={7} particleCount={4} dataType="data" />
            </group>
          )}
        </group>

        {/* Soft Contact Shadows */}
        </ScanContext.Provider>

        {/* Post-Processing for Cinematic Depth and Bloom */}
        <EffectComposer disableNormalPass multisampling={4}>
          <DepthOfField 
            focusDistance={['ANOMALY_DETECTED', 'ANALYZING', 'REROUTING'].includes(simulationState) ? 0.05 : 0.08} 
            focalLength={0.15} 
            bokehScale={2.5} 
            height={480} 
          />
          <Bloom 
            luminanceThreshold={0.7} 
            luminanceSmoothing={0.9} 
            height={300} 
            opacity={isDigitalTwin ? 1.5 : 1.0} 
          />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>

      </Canvas>
    </div>
  );
}
