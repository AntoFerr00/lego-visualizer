import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== LEGO BRICK GENERATOR =====
const STUD_RADIUS = 0.25;
const STUD_HEIGHT = 0.18;
const PLATE_HEIGHT = 0.32;
const BRICK_HEIGHT = 0.96;
const UNIT_SIZE = 0.8;

const COLORS = {
  red: 0xc91a09, blue: 0x0055bf, yellow: 0xf2cd37, green: 0x237841,
  black: 0x05131d, white: 0xffffff, gray: 0x9ba19d, orange: 0xfe8a18,
  purple: 0x81007b, brown: 0x583927
};

let currentColor = COLORS.red;
let currentPiece = '2x4';
let pieces = [];
let selectedPiece = null;

// Create a Lego piece geometry
function createLegoPiece(width, depth, isPlate = false) {
  const height = isPlate ? PLATE_HEIGHT : BRICK_HEIGHT;
  const group = new THREE.Group();

  // Main brick body
  const bodyGeo = new THREE.BoxGeometry(
    width * UNIT_SIZE - 0.04,
    height,
    depth * UNIT_SIZE - 0.04
  );
  const bodyMat = new THREE.MeshStandardMaterial({
    color: currentColor,
    roughness: 0.4,
    metalness: 0.1
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Add studs on top
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      const studGeo = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16);
      const studMat = new THREE.MeshStandardMaterial({
        color: currentColor,
        roughness: 0.4
      });
      const stud = new THREE.Mesh(studGeo, studMat);
      stud.position.set(
        (x - (width - 1) / 2) * UNIT_SIZE,
        height / 2 + STUD_HEIGHT / 2,
        (z - (depth - 1) / 2) * UNIT_SIZE
      );
      stud.castShadow = true;
      group.add(stud);
    }
  }

  // Add tubes underneath for hollow bricks (2x+)
  if (width > 1 || depth > 1) {
    for (let x = 0; x < width - 1; x++) {
      for (let z = 0; z < depth - 1; z++) {
        const tubeGeo = new THREE.CylinderGeometry(0.32, 0.32, height * 0.8, 16);
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.position.set(
          (x - (width - 2) / 2) * UNIT_SIZE,
          -height * 0.1,
          (z - (depth - 2) / 2) * UNIT_SIZE
        );
        group.add(tube);
      }
    }
  }

  group.userData = { width, depth, height, isPlate };
  return group;
}

// ===== SCENE SETUP =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(45, (window.innerWidth - 280) / window.innerHeight, 0.1, 1000);
camera.position.set(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
renderer.setSize(window.innerWidth - 280, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 10, 5);
dir.castShadow = true;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
scene.add(dir);

// Base plate grid
const gridHelper = new THREE.GridHelper(20, 20, 0x4ecdc4, 0x333333);
scene.add(gridHelper);
const planeGeo = new THREE.PlaneGeometry(20, 20);
const planeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
const plane = new THREE.Mesh(planeGeo, planeMat);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.01;
plane.receiveShadow = true;
scene.add(plane);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Raycaster for placement
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let previewMesh = null;
let rotateMode = false; // When true, clicking rotates instead of placing bricks
let deleteMode = false; // When true, clicking deletes the hovered brick
let hoveredPiece = null; // Currently hovered piece in delete mode
let lastOrbitState = { enableRotate: true };

function createPreview() {
  if (previewMesh) scene.remove(previewMesh);
  const [w, d] = currentPiece.split('x').map(Number);
  previewMesh = createLegoPiece(w, d, false);
  previewMesh.traverse(c => {
    if (c.material) {
      c.material = c.material.clone();
      c.material.opacity = 0.5;
      c.material.transparent = true;
    }
  });
  scene.add(previewMesh);
}

// Reset hover effect on a piece
function resetHover() {
  if (hoveredPiece) {
    hoveredPiece.traverse(c => {
      if (c.isMesh && c.material) {
        c.material.emissive.setHex(0x000000);
      }
    });
    hoveredPiece = null;
  }
}

// Placement logic
function snapToGrid(pos) {
  const [w, d] = currentPiece.split('x').map(Number);
  const snap = UNIT_SIZE;
  return new THREE.Vector3(
    Math.round(pos.x / snap) * snap,
    pieces.length * BRICK_HEIGHT * 0.5, // Stack height
    Math.round(pos.z / snap) * snap
  );
}

function placeBrick(point) {
  const [w, d] = currentPiece.split('x').map(Number);
  const pos = snapToGrid(point);
  const brick = createLegoPiece(w, d, false);
  brick.position.copy(pos);
  scene.add(brick);
  pieces.push(brick);
}

// Mouse events
// Keyboard shortcut for rotate mode (hold R to rotate)
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    rotateMode = true;
    controls.enabled = true; // Ensure orbit controls get mouse
    previewMesh && (previewMesh.visible = false);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === "r" || e.key === "R") {
    rotateMode = false;
    previewMesh && (previewMesh.visible = true);
  }
});

window.addEventListener('mousemove', (e) => {
  if (rotateMode) return; // Skip preview updates when rotating
  const rect = document.getElementById('canvas').getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  if (deleteMode) {
    const intersects = raycaster.intersectObjects(pieces, true);
    if (intersects.length > 0) {
      // Find the group (the Lego brick)
      let object = intersects[0].object;
      while (object.parent && object.parent.type !== 'Scene') {
        object = object.parent;
      }

      if (object !== hoveredPiece) {
        resetHover();
        hoveredPiece = object;
        hoveredPiece.traverse(c => {
          if (c.isMesh && c.material) {
            c.material.emissive.setHex(0x333333);
          }
        });
      }
    } else {
      resetHover();
    }
  } else {
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && previewMesh) {
      const point = snapToGrid(intersects[0].point);
      point.y += BRICK_HEIGHT / 2;
      previewMesh.position.copy(point);
    }
  }
});

window.addEventListener('click', (e) => {
  if (rotateMode) return; // Disable brick placement when rotating
  if (e.target.tagName !== 'CANVAS') return;

  raycaster.setFromCamera(mouse, camera);

  if (deleteMode) {
    if (hoveredPiece) {
      scene.remove(hoveredPiece);
      pieces = pieces.filter(p => p !== hoveredPiece);
      resetHover();
      // Force a new intersection check to update hover state if another brick is under the mouse
      const rect = document.getElementById('canvas').getBoundingClientRect();
      const tempEvent = new MouseEvent('mousemove', {
        clientX: e.clientX,
        clientY: e.clientY
      });
      window.dispatchEvent(tempEvent);
    }
  } else {
    const intersects = raycaster.intersectObjects([plane, ...pieces], true);
    if (intersects.length > 0) {
      placeBrick(intersects[0].point);
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = (window.innerWidth - 280) / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth - 280, window.innerHeight);
});

// ===== UI SETUP =====
const PIECES = [
  { id: '1x1', name: '1×1', icon: '▪' },
  { id: '1x2', name: '1×2', icon: '▭' },
  { id: '1x4', name: '1×4', icon: '▭' },
  { id: '2x2', name: '2×2', icon: '■' },
  { id: '2x3', name: '2×3', icon: '■' },
  { id: '2x4', name: '2×4', icon: '■' },
  { id: '4x4', name: '4×4', icon: '□' },
];

const pieceGrid = document.getElementById('piece-grid');
PIECES.forEach(p => {
  const btn = document.createElement('button');
  btn.className = 'piece-btn';
  if (p.id === currentPiece) btn.classList.add('active');
  btn.innerHTML = `<div class="piece-preview">${p.icon}</div><div class="piece-name">${p.name}</div>`;
  btn.onclick = () => {
    document.querySelectorAll('.piece-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPiece = p.id;
    createPreview();
  };
  pieceGrid.appendChild(btn);
});

// Color picker
const colorPicker = document.getElementById('color-picker');
Object.entries(COLORS).forEach(([name, hex]) => {
  const btn = document.createElement('div');
  btn.className = 'color-btn';
  btn.style.backgroundColor = '#' + hex.toString(16).padStart(6, '0');
  if (hex === currentColor) btn.classList.add('active');
  btn.onclick = () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = hex;
    createPreview();
  };
  colorPicker.appendChild(btn);
});

// Controls
document.getElementById('clear-btn').onclick = () => {
  pieces.forEach(p => scene.remove(p));
  pieces = [];
  resetHover();
};

document.getElementById('delete-mode').onclick = (e) => {
  deleteMode = !deleteMode;
  e.target.classList.toggle('active', deleteMode);

  if (deleteMode) {
    previewMesh && (previewMesh.visible = false);
    // Ensure rotate mode is off when entering delete mode
    if (rotateMode) {
      rotateMode = false;
    }
  } else {
    previewMesh && (previewMesh.visible = !rotateMode);
    resetHover();
  }
};

document.getElementById('rotate-mode').onclick = () => {
  // Toggle auto-rotate
  controls.autoRotate = !controls.autoRotate;
};

// Init
createPreview();

// Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
