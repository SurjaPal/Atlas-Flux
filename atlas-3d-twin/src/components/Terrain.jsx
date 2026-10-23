import React, { useMemo } from 'react';
import * as THREE from 'three';

export const getTerrainHeight = (x, y) => {
  // Drastically reduce amplitude so wide components don't clip into slopes
  const z = Math.sin(x * 0.01) * 4 + Math.cos(y * 0.015) * 4 + Math.sin(x * 0.05 + y * 0.05) * 2;
  const distFromCenter = Math.sqrt(x * x + y * y);
  const flattenFactor = Math.min(1, Math.max(0, (distFromCenter - 50) / 150));
  return z * flattenFactor - 0.5; // Slight downward offset
};

export const Terrain = ({ isDigitalTwin = false }) => {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1000, 1000, 128, 128);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, getTerrainHeight(x, y));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial 
        color={isDigitalTwin ? "#004455" : "#0d1b1e"} 
        roughness={0.95} 
        metalness={0.05} 
        wireframe={isDigitalTwin} 
        transparent={isDigitalTwin}
        opacity={isDigitalTwin ? 0.15 : 1}
      />
    </mesh>
  );
};
