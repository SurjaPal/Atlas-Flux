import React, { useState, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import { CyberRing, HoloScreen } from './CyberPunkUI';

export const SolarFarm = ({ position, id="SOLAR-01", scale=1, isDigitalTwin=false }) => {
  const [hovered, setHovered] = useState(false);

  // InstancedMesh refs
  const panelRef = useRef();
  const frameRef = useRef();
  const postRef = useRef();

  // 4 blocks of arrays
  const blocks = [
    { xOffset: -12, zOffset: -12 },
    { xOffset: 12, zOffset: -12 },
    { xOffset: -12, zOffset: 12 },
    { xOffset: 12, zOffset: 12 },
  ];

  const rowsPerBlock = 5;
  const panelsPerRow = 8;
  const instanceCount = blocks.length * rowsPerBlock * panelsPerRow;

  useLayoutEffect(() => {
    if (!panelRef.current || !frameRef.current || !postRef.current) return;
    
    let i = 0;
    const temp = new THREE.Object3D();
    
    blocks.forEach(block => {
      for (let r = 0; r < rowsPerBlock; r++) {
        for (let p = 0; p < panelsPerRow; p++) {
          const x = block.xOffset + (p - panelsPerRow/2 + 0.5) * 2.8;
          const z = block.zOffset + (r - rowsPerBlock/2 + 0.5) * 4.5;
          
          // Post Support
          temp.position.set(x, 0.8, z);
          temp.rotation.set(0, 0, 0);
          temp.updateMatrix();
          postRef.current.setMatrixAt(i, temp.matrix);

          // Angled PV Panel and Frame
          temp.position.set(x, 1.8, z);
          temp.rotation.set(Math.PI / 7, 0, 0); // 25 degree tilt facing sun
          temp.updateMatrix();
          
          panelRef.current.setMatrixAt(i, temp.matrix);
          frameRef.current.setMatrixAt(i, temp.matrix);

          i++;
        }
      }
    });

    panelRef.current.instanceMatrix.needsUpdate = true;
    frameRef.current.instanceMatrix.needsUpdate = true;
    postRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group 
      position={position} 
      scale={scale} 
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >

      
      {/* Central Substation / Collector */}
      <group position={[0, 1.5, 0]}>
        <Box args={[6, 3, 4]} castShadow receiveShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </Box>
        <Box args={[4, 1.5, 2]} position={[0, 2.25, 0]} castShadow>
          <meshStandardMaterial color="#334155" />
        </Box>
        <Cylinder args={[0.2, 0.2, 2]} position={[-2, 3, 0]} castShadow>
           <meshStandardMaterial color="#94a3b8" />
        </Cylinder>
      </group>

      {/* Block Inverters */}
      {blocks.map((b, idx) => (
        <Box key={idx} args={[2, 2, 1.5]} position={[b.xOffset, 1, b.zOffset - 10]} castShadow receiveShadow>
          <meshStandardMaterial color="#475569" roughness={0.6} />
        </Box>
      ))}

      {/* Service Corridors (Gravel paths) */}
      <Box args={[40, 0.1, 4]} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#0f172a" roughness={1.0} />
      </Box>
      <Box args={[4, 0.1, 40]} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#0f172a" roughness={1.0} />
      </Box>

      {/* Instanced Geometry for massive performance */}
      {/* 1. Support Posts */}
      <instancedMesh ref={postRef} args={[null, null, instanceCount]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.6]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </instancedMesh>

      {/* 2. Metal Frames */}
      <instancedMesh ref={frameRef} args={[null, null, instanceCount]} castShadow receiveShadow>
        <boxGeometry args={[2.7, 0.15, 4.0]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.7} wireframe={isDigitalTwin} />
      </instancedMesh>

      {/* 3. Photovoltaic Glass Surfaces */}
      <instancedMesh ref={panelRef} args={[null, null, instanceCount]}>
        <boxGeometry args={[2.6, 0.17, 3.9]} />
        {/* Dark blue-black glass, high gloss, catches the sun dynamically */}
        <meshPhysicalMaterial 
          color="#020617" 
          metalness={0.5} 
          roughness={0.15} 
          clearcoat={1.0} 
          clearcoatRoughness={0.1}
          wireframe={isDigitalTwin}
        />
      </instancedMesh>

      {/* Hover Info (Single source of truth for the entire farm) */}
      {hovered ? (
        <HoloScreen position={[0, 20, 0]} text={id} subtext="5.27 MW" efficiency="91.8% EFFICIENCY" />
      ) : (
        <HoloScreen position={[0, 20, 0]} text={id} />
      )}
      
      {/* Sensor Nodes */}
      {blocks.map((b, idx) => (
         <group key={`sensor-${idx}`} position={[b.xOffset, 5, b.zOffset]}>
           {isDigitalTwin && <HoloScreen position={[0,0,0]} text={`SNS-${idx+1}`} scale={0.5} />}
         </group>
      ))}

    </group>
  );
};
