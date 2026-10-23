import React, { useState } from 'react';
import { Box, Cylinder } from '@react-three/drei';
import { CyberRing, HoloScreen } from './CyberPunkUI';

// Highly Detailed Solar Panel Array Block
export const SolarBlock = ({ position }) => {
  const [isXRay, setIsXRay] = useState(false);
  const matProps = isXRay ? { color: "#00f0ff", wireframe: true, transparent: true, opacity: 0.8 } : {};
  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); setIsXRay(!isXRay); }}>

      {Array.from({ length: 3 }).map((_, r) => 
        Array.from({ length: 4 }).map((_, c) => (
          <group key={`${r}-${c}`} position={[-3 + c * 2, 0, -2 + r * 2]}>
            <Box args={[1.8, 1.2, 0.05]} position={[0, 0.8, 0]} rotation={[0.4, 0, 0]} castShadow={!isXRay}>
              <meshStandardMaterial color={isXRay ? undefined : "#0a3a6a"} metalness={isXRay ? 0 : 0.8} roughness={isXRay ? 1 : 0.1} {...matProps} />
            </Box>
            <Cylinder args={[0.05, 0.05, 0.8]} position={[0, 0.4, 0]}>
              <meshStandardMaterial color={isXRay ? undefined : "#888"} {...matProps} />
            </Cylinder>
          </group>
        ))
      )}
    </group>
  );
};

// Massive Solar Panel Farm (Hero Asset)
export const MassiveSolarFarm = ({ position }) => {
  const [isXRay, setIsXRay] = useState(false);
  const matProps = isXRay ? { color: "#00f0ff", wireframe: true, transparent: true, opacity: 0.8 } : {};
  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); setIsXRay(!isXRay); }}>

      {Array.from({ length: 8 }).map((_, r) => 
        Array.from({ length: 15 }).map((_, c) => (
          <group key={`farm-${r}-${c}`} position={[-14 + c * 2, 0, -7 + r * 2]}>
            <Box args={[1.8, 1.2, 0.05]} position={[0, 0.8, 0]} rotation={[0.4, 0, 0]} castShadow={!isXRay}>
              <meshStandardMaterial color={isXRay ? undefined : "#0a3a6a"} metalness={isXRay ? 0 : 0.9} roughness={isXRay ? 1 : 0.05} {...matProps} />
            </Box>
            <Cylinder args={[0.05, 0.05, 0.8]} position={[0, 0.4, 0]}>
              <meshStandardMaterial color={isXRay ? undefined : "#888"} {...matProps} />
            </Cylinder>
          </group>
        ))
      )}
      <HoloScreen position={[0, 8, 0]} text="SOLAR-A1" />
    </group>
  );
};
