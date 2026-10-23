const fs = require('fs');
const path = 'src/locations.js';
let content = fs.readFileSync(path, 'utf8');

const newCityPois = `export const CITY_POIS = {
  pune: {
    name: 'PUNE NODE',
    groundElevation: 560,
    viewBounds: {
      southwest: { lat: 18.4, lng: 73.7 },
      northeast: { lat: 18.7, lng: 74.0 },
    },
    pois: [
      {
        name: 'Shivajinagar Control Center',
        lat: 18.5314,
        lon: 73.8446,
        alt: 600,
        pitch: -35,
        heading: 45,
        buildingHeight: 15,
      },
      {
        name: 'Swargate Substation',
        lat: 18.4984,
        lon: 73.8587,
        alt: 450,
        pitch: -30,
        heading: 90,
        buildingHeight: 10,
      }
    ],
  },
  baner: {
    name: 'BANER-12',
    groundElevation: 570,
    viewBounds: {
      southwest: { lat: 18.54, lng: 73.76 },
      northeast: { lat: 18.57, lng: 73.80 },
    },
    pois: [
      {
        name: 'Feeder-12 Substation',
        lat: 18.5590,
        lon: 73.7868,
        alt: 350,
        pitch: -40,
        heading: 180,
        buildingHeight: 12,
      },
      {
        name: 'Baner Battery Farm',
        lat: 18.5610,
        lon: 73.7890,
        alt: 300,
        pitch: -25,
        heading: 270,
        buildingHeight: 5,
      }
    ],
  },
  kothrud: {
    name: 'KOTHRUD',
    groundElevation: 580,
    viewBounds: {
      southwest: { lat: 18.49, lng: 73.79 },
      northeast: { lat: 18.52, lng: 73.82 },
    },
    pois: [
      {
        name: 'Kothrud Grid Node',
        lat: 18.5074,
        lon: 73.8077,
        alt: 400,
        pitch: -30,
        heading: 0,
        buildingHeight: 8,
      }
    ],
  },
  aundh: {
    name: 'AUNDH',
    groundElevation: 565,
    viewBounds: {
      southwest: { lat: 18.54, lng: 73.79 },
      northeast: { lat: 18.57, lng: 73.82 },
    },
    pois: [
      {
        name: 'Aundh Smart Meter Array',
        lat: 18.5583,
        lon: 73.8078,
        alt: 350,
        pitch: -20,
        heading: 30,
        buildingHeight: 10,
      }
    ],
  },
  hinjawadi: {
    name: 'HINJAWADI',
    groundElevation: 600,
    viewBounds: {
      southwest: { lat: 18.57, lng: 73.71 },
      northeast: { lat: 18.61, lng: 73.76 },
    },
    pois: [
      {
        name: 'Hinjawadi IT Park Load',
        lat: 18.5913,
        lon: 73.7389,
        alt: 800,
        pitch: -45,
        heading: 120,
        buildingHeight: 40,
      }
    ],
  }
};`;

content = content.replace(/export const CITY_POIS = \{[\s\S]*?^\};\n/m, newCityPois + '\n');
fs.writeFileSync(path, content);
console.log('Patched CITY_POIS');
