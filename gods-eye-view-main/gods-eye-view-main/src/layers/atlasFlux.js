import * as Cesium from 'cesium';

const BANER_LAT = 18.5590;
const BANER_LON = 73.7868;

export function createApplicationAtlasFlux({ surface }) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _count = 0;
  let _pollTimeout = null;

  const renderGrid = (state) => {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    _count = 0;

    const batteryCharge = state.rounds && state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].batteryStateOfChargeKWh : 0;
    _dataSource.entities.add({
      id: 'feeder-12-substation',
      position: Cesium.Cartesian3.fromDegrees(BANER_LON, BANER_LAT, 50),
      point: {
        pixelSize: 20,
        color: Cesium.Color.fromCssColorString('#059669'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `Feeder-12 Substation\nBattery: ${batteryCharge.toFixed(1)} kWh`,
        font: '14px JetBrains Mono',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -30),
      }
    });
    _count++;

    if (!state.devices) return;

    state.devices.forEach((device, index) => {
      if (device.type !== 'RELAY') return;
      
      const angle = (index / 6) * Math.PI * 2;
      const radius = 0.005;
      const hLat = BANER_LAT + (Math.sin(angle) * radius);
      const hLon = BANER_LON + (Math.cos(angle) * radius);

      const isIsolated = device.isolated;
      const color = isIsolated ? '#ef4444' : '#0ea5e9';

      _dataSource.entities.add({
        id: device.deviceHumanId,
        position: Cesium.Cartesian3.fromDegrees(hLon, hLat, 10),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString(color),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
        },
        label: {
          text: `${device.deviceHumanId.replace('feeder-12-', '')}\nTrust: ${device.trustScore}`,
          font: '12px JetBrains Mono',
          fillColor: Cesium.Color.fromCssColorString(color),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20),
        }
      });
      _count++;

      if (!isIsolated) {
        _dataSource.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              BANER_LON, BANER_LAT, 50,
              hLon, hLat, 10
            ]),
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.5)
            })
          }
        });
      }
    });
  };

  const pollApi = async () => {
    if (!_enabled) return;
    try {
      const response = await fetch('http://localhost:3000/api/state');
      if (response.ok) {
        const state = await response.json();
        renderGrid(state);
        _lastUpdate = Date.now();
        _lastError = null;
      }
    } catch (error) {
      _lastError = 'Atlas Flux Backend Not Reachable';
    } finally {
      if (_enabled) {
        _pollTimeout = setTimeout(pollApi, 2000);
      }
    }
  };

  return {
    id: 'atlas-flux',
    name: 'Atlas Flux Smart Grid',
    icon: '⚡',
    source: 'localhost:3000/api/state',
    updateInterval: 2000,

    init(viewer) {
      if (_viewer) return;
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('atlas-flux');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _enabled = false;
      _count = 0;
    },

    enable(viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      
      // Jump to Pune immediately!
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(BANER_LON, BANER_LAT - 0.02, 1500),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-20.0),
        }
      });

      pollApi();
    },

    disable(viewer) {
      _enabled = false;
      if (_pollTimeout) {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
      }
      if (_dataSource) _dataSource.show = false;
    },

    async update(viewer) {
      // Handled by our internal pollApi loop instead of GEV's animator, 
      // but returning true tells the UI it's active.
      return true;
    },

    destroy(viewer = _viewer) {
      _enabled = false;
      if (_pollTimeout) {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
      }
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    }
  };
}
