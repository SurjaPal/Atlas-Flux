import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Cylinder, Torus } from '@react-three/drei';
import * as THREE from 'three';
import { CyberRing, HoloScreen } from './CyberPunkUI';

// Procedural Aerodynamic Wind Turbine Blade Geometry
const createBladeGeometry = () => {
  const spanSegments = 24;
  const radialSegments = 16;
  const length = 20;
  
  const profile = [];
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    // x_n from 0 (leading edge) to 1 (trailing edge)
    const x_n = (1 - Math.cos(theta)) / 2;
    
    // NACA thickness approximation
    const t_c = 0.2; 
    const thickness = 5 * t_c * (0.2969 * Math.sqrt(Math.max(0, x_n)) - 0.126 * x_n - 0.3516 * Math.pow(x_n, 2) + 0.2843 * Math.pow(x_n, 3) - 0.1015 * Math.pow(x_n, 4));
    
    const x = 0.5 - x_n; // LE at x=0.5, TE at x=-0.5
    const camber = 0.05 * x_n * (1 - x_n);
    const z = (theta < Math.PI ? thickness : -thickness) + camber;
    
    profile.push(new THREE.Vector2(x, z));
  }
  
  const vertices = [];
  const indices = [];
  const uvs = [];

  for (let s = 0; s <= spanSegments; s++) {
    const spanT = s / spanSegments; 
    const y = spanT * length;
    
    // Taper
    let chord;
    if (spanT < 0.1) chord = 0.6 + (spanT / 0.1) * 1.2; // Expand from root
    else chord = 1.8 - ((spanT - 0.1) / 0.9) * 1.5;     // Taper to tip
    
    // Twist (Pitch)
    const twist = THREE.MathUtils.degToRad(30 - Math.pow(spanT, 0.7) * 35);
    
    for (let r = 0; r <= radialSegments; r++) {
      const p = profile[r];
      let px = p.x;
      let pz = p.y;
      
      // Root cylindrical transition
      if (spanT < 0.1) {
        const factor = 1 - (spanT / 0.1); 
        const angle = (r / radialSegments) * Math.PI * 2;
        const circleX = 0.6 * Math.cos(angle) / chord;
        const circleZ = 0.6 * Math.sin(angle) / chord;
        px = THREE.MathUtils.lerp(px, circleX, factor);
        pz = THREE.MathUtils.lerp(pz, circleZ, factor);
      }
      
      px *= chord;
      pz *= chord;
      
      const rx = px * Math.cos(twist) - pz * Math.sin(twist);
      const rz = px * Math.sin(twist) + pz * Math.cos(twist);
      
      vertices.push(rx, y, rz);
      uvs.push(r / radialSegments, spanT);
    }
  }
  
  for (let s = 0; s < spanSegments; s++) {
    for (let r = 0; r < radialSegments; r++) {
      const v1 = s * (radialSegments + 1) + r;
      const v2 = v1 + 1;
      const v3 = (s + 1) * (radialSegments + 1) + r;
      const v4 = v3 + 1;
      indices.push(v1, v2, v3, v2, v4, v3);
    }
  }
  
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

// Singleton Geometry
const sharedBladeGeometry = createBladeGeometry();

// Sci-Fi Wind Turbine
export const WindTurbine = ({ position, scale = 1, phaseOffset = 0, id="WT-01" }) => {
  const [hovered, setHovered] = useState(false);
  const rotorRef = useRef();
  
  useFrame((state) => {
    if (rotorRef.current) rotorRef.current.rotation.z = (state.clock.elapsedTime * 1.5) + phaseOffset;
  });

  return (
    <group 
      position={position} 
      scale={scale} 
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
    >

      {/* Concrete Base */}
      <Cylinder args={[3, 4, 2]} position={[0, 1, 0]} receiveShadow>
        <meshStandardMaterial color="#94a3b8" />
      </Cylinder>
      {/* Tower */}
      <Cylinder args={[1.2, 2.5, 40]} position={[0, 20, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </Cylinder>
      
      {/* Yaw Bearing & Transition Collar */}
      <Cylinder args={[1.3, 1.3, 0.5]} position={[0, 40.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.5} />
      </Cylinder>
      
      {/* Nacelle & Rotor Assembly */}
      <group position={[0, 41, 0]}>
        
        {/* Aerodynamic Nacelle */}
        <group position={[0, 0, -1.5]}>
          {/* Main Body */}
          <Cylinder args={[1.6, 1.4, 6]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </Cylinder>
          {/* Rounded Rear Housing */}
          <mesh position={[0, 0, -3]} castShadow receiveShadow>
            <sphereGeometry args={[1.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          {/* Service Vents / Details */}
          <Box args={[1.8, 0.4, 2]} position={[0, 1.5, 0]} castShadow receiveShadow>
             <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
          </Box>
        </group>

        {/* Rotor Hub & Blades */}
        <group position={[0, 0, 2]} ref={rotorRef}>
          {/* Aerodynamic Hub Spinner */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <sphereGeometry args={[1.5, 32, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
          </mesh>
          {/* Flat back plate for hub */}
          <Cylinder args={[1.5, 1.5, 0.2]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]} castShadow receiveShadow>
            <meshStandardMaterial color="#94a3b8" />
          </Cylinder>

          {/* Blades and Pitch Bearings */}
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
              <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
                <primitive object={sharedBladeGeometry} attach="geometry" />
                <meshPhysicalMaterial 
                  color="#e2e8f0" 
                  roughness={0.65} 
                  metalness={0.05} 
                  clearcoat={0.2} 
                  clearcoatRoughness={0.4}
                />
              </mesh>
              {/* Pitch Bearing Ring / Root Collar */}
              <Cylinder args={[0.8, 0.8, 0.4]} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.2, 0]} castShadow receiveShadow>
                 <meshStandardMaterial color="#475569" roughness={0.8} metalness={0.6} />
              </Cylinder>
              <Cylinder args={[0.65, 0.8, 0.8]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.6, 0]} castShadow receiveShadow>
                 <meshStandardMaterial color="#94a3b8" roughness={0.6} />
              </Cylinder>
            </group>
          ))}
        </group>
        {/* Holographic Target Aura */}
        <Torus args={[4, 0.05, 16, 64]} rotation={[0, 0, 0]} position={[0, 0, 1]}>
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.3} toneMapped={false} />
        </Torus>

      </group>
      {hovered ? (
        <HoloScreen position={[-6, 30, 0]} text={id} subtext="2.84 MW" efficiency="99.2% HEALTH" />
      ) : (
        <HoloScreen position={[-6, 30, 0]} text={id} />
      )}
    </group>
  );
};
