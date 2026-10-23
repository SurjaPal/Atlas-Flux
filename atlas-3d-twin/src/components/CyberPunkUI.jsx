import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Plane, Text, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Cyberpunk glowing ring at the base of structures
export const CyberRing = ({ radius = 4, color = "#00f0ff" }) => {
  const ringRef = useRef();
  useFrame((state) => {
    if (ringRef.current) ringRef.current.rotation.z = state.clock.elapsedTime * 0.5;
  });
  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.5, 0]}>
      <torusGeometry args={[radius, 0.1, 16, 64]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.6} depthTest={false} />
    </mesh>
  );
};

export const ScanningWave = ({ scanRef }) => {
  const ref = useRef();
  useFrame(() => {
    if (ref.current && scanRef?.current !== undefined) {
      ref.current.position.x = scanRef.current;
      ref.current.visible = scanRef.current > -290 && scanRef.current < 290;
    }
  });

  return (
    <group ref={ref}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1000, 200]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1000, 2]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

export const HoloScreen = ({ position, text = "A1", subtext = "", efficiency = "", showGraph = true, scale = 1 }) => {
  const floatRef = useRef();
  useFrame((state) => {
    if (floatRef.current) {
      floatRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.5;
    }
  });
  
  return (
    <group position={position} ref={floatRef} scale={scale}>
      {/* Connector Line */}
      <Line points={[[0, -position[1], 0], [0, -1, 0]]} color="#0ea5e9" lineWidth={1} transparent opacity={0.4} />

      <Billboard>
        {/* Background Panels */}
        <Plane args={[7, 4]} position={[0, 0, 0]}>
          <meshBasicMaterial color="#001122" transparent opacity={0.7} depthWrite={false} side={THREE.DoubleSide} />
        </Plane>
        <Plane args={[7.2, 4.2]} position={[0, 0, -0.01]}>
          <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.4} toneMapped={false} />
        </Plane>
        
        {/* Title */}
        <Text position={[-3.2, 1.4, 0.1]} fontSize={0.5} color="#00f0ff" anchorX="left" anchorY="middle">
          {text}
        </Text>
        {subtext && (
          <Text position={[-3.2, 0.6, 0.1]} fontSize={0.6} color="#ffffff" anchorX="left" anchorY="middle">
            {subtext}
          </Text>
        )}
        {efficiency && (
          <Text position={[-3.2, -0.2, 0.1]} fontSize={0.4} color="#10b981" anchorX="left" anchorY="middle">
            {efficiency}
          </Text>
        )}
        <Plane args={[6.6, 0.05]} position={[0, 1.0, 0.1]}>
          <meshBasicMaterial color="#0ea5e9" toneMapped={false} opacity={0.5} transparent />
        </Plane>
        
        {/* Animated Data Bars */}
        {showGraph && Array.from({ length: 4 }).map((_, i) => (
          <group key={i} position={[-2.5 + i * 1.5, -0.8, 0.1]}>
            <Plane args={[1, 0.1]} position={[0, -1, 0]}>
               <meshBasicMaterial color="#334155" />
            </Plane>
            <Plane args={[1, 0.8 + (i % 2 === 0 ? 0.3 : 0)]} position={[0, -0.4 + (i % 2 === 0 ? 0.15 : 0), 0]}>
               <meshBasicMaterial color={i === 3 ? "#10b981" : "#0ea5e9"} toneMapped={false} transparent opacity={0.6} />
            </Plane>
          </group>
        ))}
      </Billboard>
    </group>
  );
};

export const SensorNode = ({ position, status="healthy", label="", isDigitalTwin=false }) => {
  const color = status === "warning" ? "#fbbf24" : status === "critical" ? "#ef4444" : status === "offline" ? "#64748b" : "#00ffaa";
  const ref = useRef();
  
  // Heartbeat pulse with random offset
  const offset = React.useMemo(() => Math.random() * Math.PI, []);
  
  useFrame((state) => {
    if (ref.current) {
      const t = (state.clock.elapsedTime + offset) * 3;
      // Double beat pattern: sin(t) * sin(t*1.5) clamped
      const beat = Math.max(0, Math.sin(t) * Math.sin(t * 1.5));
      ref.current.scale.setScalar(1 + beat * 0.8);
      ref.current.material.opacity = 0.4 + beat * 0.6;
    }
  });

  return (
    <group position={position}>
      {/* Outer pulsing aura */}
      <mesh ref={ref}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* Inner solid core */}
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      
      {/* Geo-Spatial Annotations in Digital Twin Mode */}
      {isDigitalTwin && label && (
        <Billboard position={[1, 0, 0]}>
          <Text fontSize={0.6} color={color} anchorX="left" anchorY="middle">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
};

export const EnergyFlowLine = ({ points, color = "#00f0ff", speed = 1, particleCount = 5, dataType = "power" }) => {
  const lineRef = useRef();
  const particlesRef = useRef();
  
  // Calculate vector from start to end
  const start = new THREE.Vector3(...points[0]);
  const end = new THREE.Vector3(...points[1]);
  const direction = new THREE.Vector3().subVectors(end, start);
  
  const particles = React.useMemo(() => {
    return Array.from({ length: particleCount }).map((_, i) => ({
      offset: i / particleCount, // 0 to 1
    }));
  }, [particleCount]);

  useFrame((state, delta) => {
    // Animate dashed line
    if (lineRef.current?.material) {
      lineRef.current.material.dashOffset -= 0.02 * speed;
    }
    
    // Animate particles
    if (particlesRef.current) {
      let i = 0;
      particles.forEach((p) => {
        p.offset += (delta * 0.2 * speed);
        if (p.offset > 1) p.offset = 0;
        
        const currentPos = new THREE.Vector3().copy(start).addScaledVector(direction, p.offset);
        
        const dummy = new THREE.Object3D();
        dummy.position.copy(currentPos);
        dummy.updateMatrix();
        particlesRef.current.setMatrixAt(i++, dummy.matrix);
      });
      particlesRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {dataType === "power" && (
        <Line 
          ref={lineRef}
          points={points}
          color={color}
          lineWidth={4}
          dashed={true}
          dashSize={5}
          gapSize={2}
          dashOffset={0}
          toneMapped={false}
          opacity={0.6}
          transparent
        />
      )}
      <instancedMesh ref={particlesRef} args={[null, null, particleCount]}>
        <sphereGeometry args={[dataType === "power" ? 0.6 : 0.2, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
    </group>
  );
};

export const WarningScreen = ({ position, text="ALERT" }) => (
  <group position={position}>
    <Plane args={[5, 1.5]} position={[0, 0, 0]}>
      <meshBasicMaterial color="#330000" transparent opacity={0.8} toneMapped={false} />
    </Plane>
    <Plane args={[5.2, 1.7]} position={[0, 0, -0.01]}>
      <meshBasicMaterial color="#ff0055" wireframe transparent opacity={0.9} toneMapped={false} />
    </Plane>
    <Text position={[0, 0, 0.1]} fontSize={0.5} color="#ff0055" anchorX="center" anchorY="middle">
      {text}
    </Text>
  </group>
);

export const BatteryIcon = ({ position }) => (
  <group position={position} scale={3}>
    <Plane args={[1, 1]} position={[0, 0, 0]}>
      <meshBasicMaterial color="#001122" transparent opacity={0.8} />
    </Plane>
    {/* Battery body */}
    <Plane args={[0.5, 0.7]} position={[0, 0, 0.01]}>
      <meshBasicMaterial color="#00f0ff" wireframe />
    </Plane>
    {/* Battery cap */}
    <Plane args={[0.2, 0.1]} position={[0, 0.4, 0.01]}>
      <meshBasicMaterial color="#00f0ff" wireframe />
    </Plane>
    {/* Charge fill */}
    <Plane args={[0.4, 0.5]} position={[0, -0.05, 0.02]}>
      <meshBasicMaterial color="#00ffaa" toneMapped={false} />
    </Plane>
  </group>
);
