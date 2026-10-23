import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Cinematic Camera Director
// Transitions between: OVERVIEW -> GENERATION -> HUB -> DIGITAL_TWIN -> ANOMALY -> RECOVERY -> OVERVIEW
export const CameraDirector = ({ targetNodes, onStateChange, isPaused }) => {
  const { camera } = useThree();
  const timeRef = useRef(0);
  
  const sequence = [
    { name: 'OVERVIEW', pos: [0, 250, 350], target: [0, 0, 0], duration: 5 },
    { name: 'GENERATION', pos: [-180, 50, -100], target: [-140, 40, -60], duration: 5 }, // Pass foreground turbine
    { name: 'TRANSMISSION', pos: [-80, 25, -20], target: [80, 10, 40], duration: 5 }, // Follow the power lines
    { name: 'HUB', pos: [60, 20, 100], target: [0, 40, 0], duration: 5 }, // Looking up at the Hub
    { name: 'DIGITAL_TWIN', pos: [40, 70, 160], target: [0, 10, 0], duration: 6 }, // Subtle push-in for scan
    { name: 'ANOMALY_DETECTED', pos: [-100, 50, -60], target: [-160, 20, -40], duration: 2 }, // Precise push to affected node
    { name: 'ANALYZING', pos: [-50, 40, -20], target: [0, 20, 0], duration: 2 }, // Telemetry to Hub
    { name: 'REROUTING', pos: [30, 40, 70], target: [80, 10, 40], duration: 3 }, // Follow new active route
    { name: 'BATTERY_DISPATCH', pos: [90, 40, 130], target: [60, 10, 20], duration: 2 }, // Focus on active storage
    { name: 'RECOVERY', pos: [30, 140, 150], target: [0, 0, 0], duration: 4 }, // Calmer pull back
    { name: 'OVERVIEW_RETURN', pos: [0, 250, 350], target: [0, 0, 0], duration: 3 } // Match opening frame perfectly
  ];

  const totalDuration = sequence.reduce((sum, seq) => sum + seq.duration, 0);

  useFrame((state, delta) => {
    if (isPaused) {
      return; // Yield control to OrbitControls
    }

    timeRef.current = (timeRef.current + delta) % totalDuration;
    
    // Find current sequence
    let elapsed = 0;
    let currentIdx = 0;
    for (let i = 0; i < sequence.length; i++) {
      if (timeRef.current < elapsed + sequence[i].duration) {
        currentIdx = i;
        break;
      }
      elapsed += sequence[i].duration;
    }

    const currentSeq = sequence[currentIdx];
    const nextSeq = sequence[(currentIdx + 1) % sequence.length];
    
    // Local progress within the current sequence (0 to 1)
    const localProgress = (timeRef.current - elapsed) / currentSeq.duration;
    
    // Smooth easing function (easeInOutSine)
    const ease = -(Math.cos(Math.PI * localProgress) - 1) / 2;

    // Interpolate Position
    const currentPos = new THREE.Vector3(...currentSeq.pos);
    const nextPos = new THREE.Vector3(...nextSeq.pos);
    camera.position.lerpVectors(currentPos, nextPos, ease);

    // Interpolate LookAt Target
    const currentTarget = new THREE.Vector3(...currentSeq.target);
    const nextTarget = new THREE.Vector3(...nextSeq.target);
    const interpolatedTarget = new THREE.Vector3().lerpVectors(currentTarget, nextTarget, ease);
    camera.lookAt(interpolatedTarget);

    // Broadcast state change when sequence changes
    if (localProgress < 0.05) {
       onStateChange(currentSeq.name);
    }
  });

  return null;
};
