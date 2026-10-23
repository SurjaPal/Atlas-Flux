import * as Cesium from 'cesium';

export function installEnergyComponents(viewer) {
  console.log('[Atlas Flux] Installing 3D Energy Grid Components...');
  
  const dataSource = new Cesium.CustomDataSource('AtlasFluxEnergyGrid');
  viewer.dataSources.add(dataSource);

  // BANER-12 Coordinates
  const baseLat = 18.5590;
  const baseLon = 73.7868;

  // 1. Create a Solar Farm (Removed per user request)

  // 2. Add Wind Turbines
  const numTurbines = 5;
  for (let i = 0; i < numTurbines; i++) {
    const tLat = baseLat - 0.003;
    const tLon = baseLon + (i * 0.0015);
    
    // Tower
    dataSource.entities.add({
      name: `Wind Turbine Tower ${i}`,
      position: Cesium.Cartesian3.fromDegrees(tLon, tLat, 25),
      cylinder: {
        length: 50.0,
        topRadius: 1.0,
        bottomRadius: 2.0,
        material: Cesium.Color.WHITE
      }
    });

    // Rotor Hub
    dataSource.entities.add({
      name: `Wind Turbine Hub ${i}`,
      position: Cesium.Cartesian3.fromDegrees(tLon, tLat, 50),
      box: {
        dimensions: new Cesium.Cartesian3(4.0, 4.0, 4.0),
        material: Cesium.Color.LIGHTGRAY
      }
    });
  }

  // 3. Add High-Voltage Transmission Lines (Polylines)
  const linePositions = [];
  for (let i = 0; i < 6; i++) {
    linePositions.push(Cesium.Cartesian3.fromDegrees(baseLon + (i * 0.002), baseLat - (i * 0.001), 20));
    
    // Add Transmission Tower
    dataSource.entities.add({
      name: `Transmission Tower ${i}`,
      position: Cesium.Cartesian3.fromDegrees(baseLon + (i * 0.002), baseLat - (i * 0.001), 10),
      cylinder: {
        length: 20.0,
        topRadius: 0.5,
        bottomRadius: 3.0,
        material: Cesium.Color.DARKGRAY,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      }
    });
  }

  // High Voltage Line (Removed per user request)

  console.log('[Atlas Flux] 3D Energy Grid Components Initialized.');
}
