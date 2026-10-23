import React, { useRef, useState, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import { CyberRing, HoloScreen } from './CyberPunkUI';

export const BatteryStorage = ({ position, scale = 1, id = "STORAGE-01", chargeLevel = "82%", simulationState = 'OVERVIEW', isDigitalTwin = false }) => {
  const [hovered, setHovered] = useState(false);
  
  // Instanced references
  const containerRef = useRef();
  const hvacRef = useRef();
  
  // Layout parameters for BESS rows
  const rows = 3;
  const cols = 4;
  const instanceCount = rows * cols;
  
  // Determine state
  let statusText = "STANDBY";
  let statusColor = "#10b981"; // Green
  let ledColor = "#10b981"; // Normal LED
  
  if (simulationState === 'ANOMALY' || simulationState === 'RESPONSE') {
    statusText = "DISCHARGING";
    statusColor = "#ef4444"; // Red / Active
    ledColor = "#ef4444";
  } else if (simulationState === 'RECOVERY') {
    statusText = "BALANCING";
    statusColor = "#0ea5e9";
    ledColor = "#0ea5e9";
  } else if (simulationState === 'DIGITAL_TWIN') {
    statusText = "MONITORED";
  }

  useLayoutEffect(() => {
    if (!containerRef.current || !hvacRef.current) return;
    const temp = new THREE.Object3D();
    let i = 0;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - cols/2 + 0.5) * 5.5; // Spacing along X
        const z = (r - rows/2 + 0.5) * 14; // Spacing along Z
        
        // Main Container
        temp.position.set(x, 2, z);
        temp.rotation.set(0, 0, 0);
        temp.updateMatrix();
        containerRef.current.setMatrixAt(i, temp.matrix);
        
        // HVAC Unit on top
        temp.position.set(x, 4.25, z + 3);
        temp.updateMatrix();
        hvacRef.current.setMatrixAt(i, temp.matrix);
        
        i++;
      }
    }
    containerRef.current.instanceMatrix.needsUpdate = true;
    hvacRef.current.instanceMatrix.needsUpdate = true;
  }, [rows, cols]);

  return (
    <group 
      position={position} 
      scale={scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >


      {/* Facility Ground Pad */}
      <Box args={[28, 0.2, 48]} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </Box>

      {/* Perimeter Fencing */}
      {[-24, 24].map(z => (
        <Box key={`f-z-${z}`} args={[28, 2, 0.1]} position={[0, 1, z]} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </Box>
      ))}
      {[-14, 14].map(x => (
        <Box key={`f-x-${x}`} args={[0.1, 2, 48]} position={[x, 1, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </Box>
      ))}

      {/* Power Conversion System (PCS) Zone */}
      <group position={[0, 0, -20]}>
        {/* Inverter cabinets */}
        {[-4, 0, 4].map(x => (
          <Box key={`inv-${x}`} args={[3, 3.5, 2]} position={[x, 1.75, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#334155" roughness={0.6} />
          </Box>
        ))}
        {/* Step-up Transformer to Grid */}
        <Box args={[4, 4, 3]} position={[0, 2, -3]} castShadow receiveShadow>
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </Box>
        {/* Connection Busbars */}
        <Cylinder args={[0.1, 0.1, 6]} rotation={[0, 0, Math.PI/2]} position={[0, 4.5, -3]} castShadow>
          <meshStandardMaterial color="#94a3b8" />
        </Cylinder>
      </group>

      {/* Instanced BESS Containers */}
      <instancedMesh ref={containerRef} args={[null, null, instanceCount]} castShadow receiveShadow>
        <boxGeometry args={[4, 4, 12]} />
        <meshStandardMaterial 
          color="#1e293b" 
          roughness={0.7} 
          metalness={0.2} 
          wireframe={isDigitalTwin} 
        />
      </instancedMesh>

      {/* Instanced HVAC Units */}
      <instancedMesh ref={hvacRef} args={[null, null, instanceCount]} castShadow>
        <boxGeometry args={[3, 0.5, 3]} />
        <meshStandardMaterial color="#475569" roughness={0.5} wireframe={isDigitalTwin} />
      </instancedMesh>

      {/* Active State / LED Indication across Containers */}
      {/* We represent active status via small emissive strips on the end of the containers */}
      {!isDigitalTwin && Array.from({ length: instanceCount }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = (c - cols/2 + 0.5) * 5.5;
        const z = (r - rows/2 + 0.5) * 14;
        return (
          <Box key={`led-${i}`} args={[0.2, 3, 0.1]} position={[x - 2.05, 2, z - 5]} castShadow={false}>
            <meshBasicMaterial color={ledColor} toneMapped={false} />
          </Box>
        )
      })}

      {/* Sensor Nodes and Topology overlays (Digital Twin) */}
      {isDigitalTwin && Array.from({ length: instanceCount }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = (c - cols/2 + 0.5) * 5.5;
        const z = (r - rows/2 + 0.5) * 14;
        // Only label the first column for clean topology
        if (c === 0) {
          return (
            <HoloScreen key={`sns-${i}`} position={[x, 6, z]} text={`BESS-${i+1}`} scale={0.4} />
          )
        }
        return null;
      })}

      {/* Facility Hover Info & Status Board */}
      {hovered ? (
        <HoloScreen position={[0, 16, 0]} text={`${id}`} subtext={`SOC: ${chargeLevel} | ${statusText}`} />
      ) : (
        <HoloScreen position={[0, 16, 0]} text={id} />
      )}
    </group>
  );
};
