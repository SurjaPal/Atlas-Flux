import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Box, Cylinder, Torus, QuadraticBezierLine } from '@react-three/drei';
import { CyberRing, HoloScreen } from './CyberPunkUI';

// Sci-Fi Substation
export const SciFiSubstation = ({ position, scale=1, id="SUB-1" }) => {
  const [hovered, setHovered] = useState(false);
  
  return (
    <group 
      position={position} 
      scale={scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >

      
      {/* Substation Ground Pad */}
      <Box args={[20, 0.5, 16]} position={[0, 0.25, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.9} />
      </Box>

      {/* Perimeter Fencing */}
      {[-9.8, 9.8].map(z => (
        <Box key={`f-z-${z}`} args={[19.6, 2, 0.1]} position={[0, 1.5, z]} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </Box>
      ))}
      {[-9.8, 9.8].map(x => (
        <Box key={`f-x-${x}`} args={[0.1, 2, 19.6]} position={[x, 1.5, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </Box>
      ))}

      {/* Control Building */}
      <group position={[6, 0.5, 5]}>
        <Box args={[5, 4, 3]} position={[0, 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </Box>
        {/* Door */}
        <Box args={[0.8, 1.5, 0.1]} position={[-1, 0.75, 1.55]}>
           <meshStandardMaterial color="#475569" />
        </Box>
        {/* HVAC */}
        <Box args={[1.5, 0.5, 1]} position={[0, 4.25, 0]} castShadow>
           <meshStandardMaterial color="#94a3b8" />
        </Box>
      </group>

      {/* Main Transformers */}
      {[-4, 2].map(x => (
        <group key={`tx-${x}`} position={[x, 0.5, -3]}>
          {/* Main Body */}
          <Box args={[3, 3, 2.5]} position={[0, 1.5, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#475569" roughness={0.6} />
          </Box>
          {/* Radiator Fins */}
          {[-1, 0, 1].map(rx => (
            <Box key={`fin-${rx}`} args={[0.2, 2.5, 3]} position={[rx, 1.5, 0]} castShadow>
               <meshStandardMaterial color="#334155" />
            </Box>
          ))}
          {/* Top Bushings */}
          {[-0.8, 0, 0.8].map(bx => (
            <group key={`bushing-${bx}`} position={[bx, 3, 0]}>
              <Cylinder args={[0.15, 0.2, 1]} position={[0, 0.5, 0]} castShadow>
                <meshStandardMaterial color="#94a3b8" />
              </Cylinder>
              <Cylinder args={[0.25, 0.25, 0.1]} position={[0, 0.8, 0]}>
                <meshStandardMaterial color="#cbd5e1" />
              </Cylinder>
            </group>
          ))}
        </group>
      ))}

      {/* High-Voltage Busbar System */}
      <group position={[-2, 0.5, 3]}>
        {/* Steel Support Frames */}
        {[-3, 0, 3].map(sx => (
          <group key={`frame-${sx}`} position={[sx, 0, 0]}>
            <Box args={[0.2, 5, 0.2]} position={[-1, 2.5, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#64748b" metalness={0.5} />
            </Box>
            <Box args={[0.2, 5, 0.2]} position={[1, 2.5, 0]} castShadow receiveShadow>
              <meshStandardMaterial color="#64748b" metalness={0.5} />
            </Box>
            <Box args={[2.2, 0.2, 0.2]} position={[0, 5, 0]} castShadow>
              <meshStandardMaterial color="#64748b" metalness={0.5} />
            </Box>
            {/* Hanging Insulators */}
            {[-0.8, 0, 0.8].map(ix => (
              <Cylinder key={`ins-${ix}`} args={[0.1, 0.1, 0.8]} position={[ix, 4.5, 0]} castShadow>
                 <meshStandardMaterial color="#cbd5e1" roughness={0.2} />
              </Cylinder>
            ))}
          </group>
        ))}
        {/* Horizontal Conductors (Busbars) */}
        {[-0.8, 0, 0.8].map(bx => (
          <Cylinder key={`bus-${bx}`} args={[0.05, 0.05, 6]} rotation={[0, 0, Math.PI/2]} position={[0, 4, 0]} castShadow>
             <meshStandardMaterial color="#e2e8f0" metalness={0.8} />
          </Cylinder>
        ))}
      </group>

      {hovered ? (
        <HoloScreen position={[0, 15, 0]} text={id} subtext="NORMAL" efficiency="ACTIVE" />
      ) : (
        <HoloScreen position={[0, 15, 0]} text={id} />
      )}
    </group>
  );
};

export const SciFiTransmissionTower = ({ position, scale=1, id="TWR-1" }) => {
  const [hovered, setHovered] = useState(false);
  
  return (
    <group 
      position={position} 
      scale={scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >

      
      {/* Tapered Lattice Body Approximation */}
      <group position={[0, 15, 0]}>
        <Cylinder args={[0.5, 3, 30]} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" wireframe wireframeLinewidth={2} roughness={0.8} metalness={0.6} />
        </Cylinder>
        <Cylinder args={[0.4, 2.8, 30]} castShadow>
          <meshStandardMaterial color="#475569" roughness={0.8} metalness={0.6} />
        </Cylinder>
      </group>

      {/* Crossarms and Insulators */}
      {[25, 20, 15].map((y, i) => {
        const width = 12 + (i * 2);
        return (
          <group key={y} position={[0, y, 0]}>
            {/* Crossarm Steel */}
            <Box args={[width, 0.4, 0.4]} castShadow receiveShadow>
              <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.8} />
            </Box>
            {/* Insulator Strings (Left & Right) */}
            {[-1, 1].map(side => (
               <group key={`ins-${side}`} position={[(width/2 - 0.5) * side, -1.5, 0]}>
                 <Cylinder args={[0.15, 0.15, 3]} castShadow>
                   <meshStandardMaterial color="#cbd5e1" roughness={0.2} />
                 </Cylinder>
                 {/* Insulator disks */}
                 {[0, 0.5, 1, 1.5, 2].map(dy => (
                   <Cylinder key={dy} args={[0.3, 0.3, 0.05]} position={[0, dy - 1, 0]}>
                     <meshStandardMaterial color="#94a3b8" />
                   </Cylinder>
                 ))}
               </group>
            ))}
          </group>
        );
      })}
      
      {/* Top Shield Wire Peak */}
      <Cylinder args={[0.1, 0.5, 5]} position={[0, 32.5, 0]} castShadow>
        <meshStandardMaterial color="#475569" />
      </Cylinder>

      {hovered ? (
        <HoloScreen position={[0, 38, 0]} text={id} subtext="138kV" />
      ) : (
        <HoloScreen position={[0, 38, 0]} text={id} />
      )}
    </group>
  );
};

// Catenary Conductor Cable Component
export const PhysicalCable = ({ start, end, sag = 5, color = "#475569" }) => {
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;
  const midY = Math.min(start[1], end[1]) - sag;
  
  return (
    <QuadraticBezierLine
      start={start}
      end={end}
      mid={[midX, midY, midZ]}
      color={color}
      lineWidth={3}
      transparent
      opacity={0.8}
    />
  );
};

// Massive Central Energy Intelligence Hub
export const EnergySpire = ({ position, id="CORE-NEXUS", scale=1 }) => {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef();
  const particlesRef = useRef();
  
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      ringRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group 
      position={position} 
      scale={scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >
      <CyberRing radius={15} color="#00f0ff" opacity={0.3} />

      {/* Central Cylindrical Base */}
      <Cylinder args={[15, 18, 4]} position={[0, 2, 0]} castShadow>
        <meshStandardMaterial color="#020813" metalness={0.8} />
      </Cylinder>
      
      {/* Secondary Tech Base */}
      <Cylinder args={[12, 14, 8]} position={[0, 6, 0]} castShadow>
        <meshStandardMaterial color="#0f172a" />
      </Cylinder>
      
      {/* Glowing Cyan Core */}
      <Cylinder args={[5, 5, 10]} position={[0, 10, 0]}>
        <meshBasicMaterial color="#00aaff" transparent opacity={0.4} toneMapped={false} />
      </Cylinder>
      
      {/* Vertical Energy Beam (Reduced Intensity) */}
      <Cylinder args={[1.5, 1.5, 200]} position={[0, 100, 0]}>
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.1} toneMapped={false} />
      </Cylinder>
      <Cylinder args={[0.3, 0.3, 200]} position={[0, 100, 0]}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} toneMapped={false} />
      </Cylinder>

      {/* Rotating Technical Rings */}
      <group ref={ringRef} position={[0, 20, 0]}>
        {[1, 2, 3].map((ring, i) => (
          <Torus key={i} args={[16 + (i * 2), 0.15 + (i * 0.05), 16, 64]} rotation={[Math.PI / 2, 0, 0]} position={[0, i * 1.5, 0]}>
            <meshBasicMaterial color="#00f0ff" transparent opacity={0.4} toneMapped={false} wireframe />
          </Torus>
        ))}
      </group>

      {/* Orbiting Particles */}
      <group ref={particlesRef} position={[0, 20, 0]}>
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const r = 20;
          return (
            <mesh key={i} position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshBasicMaterial color="#00ffaa" toneMapped={false} />
            </mesh>
          );
        })}
      </group>

      {/* Radial Connections inside Base */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <Box key={i} args={[10, 1, 1]} position={[Math.cos(angle) * 10, 10, Math.sin(angle) * 10]} rotation={[0, -angle, 0]}>
             <meshStandardMaterial color="#334155" />
          </Box>
        );
      })}

      {/* Sensor Nodes */}
      {Array.from({ length: 4 }).map((_, i) => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(angle) * 16, 12, Math.sin(angle) * 16]}>
            <Cylinder args={[1, 1, 2]}>
               <meshStandardMaterial color="#1e293b" />
            </Cylinder>
            <HoloScreen position={[0, 4, 0]} text={`SNS-${i}`} />
          </group>
        );
      })}

      {/* Hero HoloScreen */}
      {hovered ? (
        <HoloScreen position={[0, 40, 0]} text={`${id} | STATUS: OPTIMAL`} />
      ) : (
        <HoloScreen position={[0, 40, 0]} text={id} />
      )}
    </group>
  );
};
