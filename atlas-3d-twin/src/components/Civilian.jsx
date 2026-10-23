import React, { useState, useMemo } from 'react';
import { Box, Cylinder, Sphere } from '@react-three/drei';
import { CyberRing, HoloScreen, EnergyFlowLine } from './CyberPunkUI';

const Building = ({ args, position, color, isXRay, ...props }) => (
  <Box args={args} position={position} castShadow={!isXRay} receiveShadow={!isXRay} {...props}>
    <meshStandardMaterial color={color} roughness={0.8} wireframe={isXRay} transparent={isXRay} opacity={isXRay ? 0.6 : 1} />
  </Box>
);

// Critical Load: Hospital
const Hospital = ({ position, isXRay }) => (
  <group position={position}>
    <Building args={[6, 4, 8]} position={[0, 2, 0]} color="#cbd5e1" isXRay={isXRay} />
    <Building args={[8, 2, 4]} position={[0, 1, 0]} color="#94a3b8" isXRay={isXRay} />
    {/* Helipad / Roof */}
    <Cylinder args={[1.5, 1.5, 0.2]} position={[0, 4.1, -2]} castShadow={!isXRay}>
      <meshStandardMaterial color="#475569" wireframe={isXRay} />
    </Cylinder>
    {/* Critical Status Indicator */}
    {!isXRay && <Box args={[0.5, 0.5, 0.5]} position={[0, 4.5, 2]}>
      <meshBasicMaterial color="#0ea5e9" toneMapped={false} />
    </Box>}
    {isXRay && <HoloScreen position={[0, 6, 0]} text="HOSPITAL" scale={0.4} />}
  </group>
);

// Critical Load: Data Center
const DataCenter = ({ position, isXRay }) => (
  <group position={position}>
    <Building args={[7, 5, 7]} position={[0, 2.5, 0]} color="#1e293b" isXRay={isXRay} />
    {/* HVAC / Cooling Units */}
    {[-2, 0, 2].map(x => (
      <Building key={x} args={[1.5, 0.5, 1.5]} position={[x, 5.25, 0]} color="#334155" isXRay={isXRay} />
    ))}
    {/* Data Core Glow */}
    {!isXRay && <Box args={[6, 0.2, 0.1]} position={[0, 2.5, 3.55]}>
      <meshBasicMaterial color="#00f0ff" toneMapped={false} />
    </Box>}
    {isXRay && <HoloScreen position={[0, 8, 0]} text="DATACENTER" scale={0.4} />}
  </group>
);

// Industrial Load: Factory
const Factory = ({ position, isXRay, isAnomaly }) => (
  <group position={position}>
    <Building args={[10, 3, 6]} position={[0, 1.5, 0]} color="#475569" isXRay={isXRay} />
    <Building args={[4, 4, 6]} position={[-3, 2, 0]} color="#334155" isXRay={isXRay} />
    {/* Smokestacks / Exhausts */}
    {[-1, 1].map(z => (
      <Cylinder key={z} args={[0.4, 0.6, 5]} position={[3, 2.5, z]} castShadow={!isXRay}>
        <meshStandardMaterial color="#1e293b" wireframe={isXRay} />
      </Cylinder>
    ))}
    {/* Non-critical status light (dims during anomaly) */}
    {!isXRay && <Box args={[0.2, 2, 0.1]} position={[4.9, 1.5, 0]}>
      <meshBasicMaterial color={isAnomaly ? "#fbbf24" : "#10b981"} toneMapped={false} />
    </Box>}
  </group>
);

// Commercial / Apartments
const Apartment = ({ position, isXRay }) => (
  <group position={position}>
    <Building args={[3, 8, 3]} position={[0, 4, 0]} color="#64748b" isXRay={isXRay} />
    <Building args={[1.5, 9, 1.5]} position={[0, 4.5, 0]} color="#475569" isXRay={isXRay} />
  </group>
);

// Small Residential House (With subtle rooftop solar)
const House = ({ position, isXRay, hasSolar }) => (
  <group position={position}>
    <Building args={[2, 1.5, 2.5]} position={[0, 0.75, 0]} color="#94a3b8" isXRay={isXRay} />
    {/* Roof */}
    <Cylinder args={[0, 1.5, 1, 4]} position={[0, 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={!isXRay}>
      <meshStandardMaterial color="#334155" wireframe={isXRay} />
    </Cylinder>
    {hasSolar && !isXRay && (
      <Box args={[1, 0.1, 1.5]} position={[0.7, 1.8, 0]} rotation={[0, 0, Math.PI / 6]}>
        <meshStandardMaterial color="#020617" roughness={0.1} />
      </Box>
    )}
  </group>
);

export const Village = ({ position, scale=1, id="CITY-ALPHA", simulationState='OVERVIEW', isDigitalTwin=false }) => {
  const isAnomaly = simulationState === 'ANOMALY' || simulationState === 'RESPONSE';

  // Road network
  const roads = (
    <group position={[0, 0.05, 0]} receiveShadow>
      <Box args={[40, 0.1, 6]} position={[0, 0, 0]}><meshStandardMaterial color="#0f172a" /></Box>
      <Box args={[6, 0.1, 40]} position={[0, 0, 0]}><meshStandardMaterial color="#0f172a" /></Box>
      <Box args={[30, 0.1, 4]} position={[10, 0, 10]}><meshStandardMaterial color="#0f172a" /></Box>
    </group>
  );

  return (
    <group position={position} scale={scale}>

      
      {/* City Ground Pad */}
      <Box args={[45, 0.2, 45]} position={[0, -0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#08101a" roughness={1} />
      </Box>
      {roads}

      {/* Local Distribution Substation */}
      <group position={[-16, 0, -16]}>
        <Box args={[4, 2, 4]} position={[0, 1, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" wireframe={isDigitalTwin} />
        </Box>
        <Cylinder args={[0.2, 0.2, 3]} position={[0, 1.5, 0]}>
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </Cylinder>
      </group>

      {/* Critical Infrastructure */}
      <Hospital position={[-10, 0, 10]} isXRay={isDigitalTwin} />
      <DataCenter position={[10, 0, -10]} isXRay={isDigitalTwin} />
      
      {/* Industrial Facilities */}
      <Factory position={[15, 0, 12]} isXRay={isDigitalTwin} isAnomaly={isAnomaly} />
      
      {/* Commercial Blocks */}
      <Apartment position={[-8, 0, -8]} isXRay={isDigitalTwin} />
      <Apartment position={[-4, 0, -12]} isXRay={isDigitalTwin} />
      <Apartment position={[4, 0, -8]} isXRay={isDigitalTwin} />

      {/* Residential Neighborhood */}
      <House position={[-15, 0, 5]} isXRay={isDigitalTwin} hasSolar={true} />
      <House position={[-15, 0, -2]} isXRay={isDigitalTwin} hasSolar={false} />
      <House position={[-18, 0, 2]} isXRay={isDigitalTwin} hasSolar={true} />
      <House position={[5, 0, 15]} isXRay={isDigitalTwin} hasSolar={false} />
      <House position={[8, 0, 18]} isXRay={isDigitalTwin} hasSolar={true} />

      {/* City Energy Distribution Grid (Branching from local substation) */}
      <group>
        {/* Main Feed to Critical Loads (Fast, strong particles) */}
        <EnergyFlowLine points={[[-16, 1, -16], [-10, 1, 10]]} color="#00ffaa" speed={2} particleCount={8} dataType="power" />
        <EnergyFlowLine points={[[-16, 1, -16], [10, 1, -10]]} color="#00ffaa" speed={2} particleCount={8} dataType="power" />
        
        {/* Feed to Industrial (Slows/Dims during Anomaly) */}
        <EnergyFlowLine 
          points={[[-16, 1, -16], [15, 1, 12]]} 
          color={isAnomaly ? "#fbbf24" : "#00ffaa"} 
          speed={isAnomaly ? 0.5 : 1.5} 
          particleCount={isAnomaly ? 4 : 10} 
        />

        {/* Local Feed to Residential/Commercial */}
        <EnergyFlowLine points={[[-16, 1, -16], [-8, 1, -8]]} color="#00f0ff" speed={1} particleCount={5} />
        <EnergyFlowLine points={[[-16, 1, -16], [-15, 1, 5]]} color="#00f0ff" speed={1} particleCount={3} />
      </group>

      {/* Sensor Data Flowing Back to Hub */}
      <EnergyFlowLine points={[[-10, 5, 10], [-16, 5, -16]]} color="#ffffff" speed={4} particleCount={4} dataType="data" />
      <EnergyFlowLine points={[[-8, 5, -8], [-16, 5, -16]]} color="#ffffff" speed={4} particleCount={4} dataType="data" />

      {/* City HUD Panel */}
      {!isDigitalTwin ? (
        <HoloScreen position={[0, 22, 0]} text={id} subtext={isAnomaly ? "LOAD SHEDDING ACTIVE" : "LOAD: 18.7 MW"} efficiency="SYS 99.4%" />
      ) : (
        <HoloScreen position={[0, 22, 0]} text={`${id} - MONITORED`} subtext="CRITICAL: 4.8MW" />
      )}
    </group>
  );
};
