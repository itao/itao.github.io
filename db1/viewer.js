import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { model } from './model.js';

const viewport = document.querySelector('#viewport');
const detail = document.querySelector('#detail');
const roomSelect = document.querySelector('#room');
const levelButtons = document.querySelector('#levels');
const roofToggle = document.querySelector('#roof');
const xrayToggle = document.querySelector('#xray');
const ceilingToggle = document.querySelector('#ceilings');
const loading = document.querySelector('#loading');
const sheet = document.querySelector('#sheet');
const sheetToggle = document.querySelector('#sheet-toggle');
const sheetSummary = document.querySelector('#sheet-summary');
const resetView = document.querySelector('#reset-view');
const gestureTip = document.querySelector('#gesture-tip');
const gestureDismiss = document.querySelector('#gesture-dismiss');
document.querySelector('#provenance').textContent =
  `Pascal scene ${model.provenance.sceneId}, checkpoint v${model.provenance.version}. ${model.note}`;

try {
  start();
  loading.remove();
} catch (error) {
  console.error(error);
  loading.className = 'loading error';
  loading.textContent = 'The 3D view could not start. Try a current browser with WebGL enabled, or check the browser console.';
}

function start() {
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileQuery.matches ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewport.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xeaf2eb, 90, 160);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8da49a, 2.5));
  const sun = new THREE.DirectionalLight(0xfff3db, 2.1);
  sun.position.set(-20, 34, -15);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 180;
  controls.maxPolarAngle = Math.PI * 0.49;
  const levelByIndex = new Map(model.levels.map((level) => [level.index, level]));
  const floorLevels = model.levels.filter((level) => !level.roof);
  const groupByLevel = new Map(model.levels.map((level) => [level.index, {
    walls: new THREE.Group(), floors: new THREE.Group(), ceilings: new THREE.Group(),
    zones: new THREE.Group(), stairs: new THREE.Group(), roofs: new THREE.Group(),
  }]));
  for (const groups of groupByLevel.values()) Object.values(groups).forEach((group) => scene.add(group));

  const wallMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xc4d2c6, roughness: 0.91, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xe2dfd0, roughness: 0.94, side: THREE.DoubleSide }),
  ];
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x31564e, roughness: 0.77 });
  const glazingMaterial = new THREE.MeshStandardMaterial({ color: 0x80c7d0, metalness: 0.09,
    transparent: true, opacity: 0.43, side: THREE.DoubleSide, depthWrite: false });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x917b60, roughness: 0.88 });
  const exteriorDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x497163, roughness: 0.7 });
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xddd7c5, roughness: 0.95, side: THREE.DoubleSide });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xaa9878, roughness: 0.9, side: THREE.DoubleSide });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf1ecde, roughness: 0.95, side: THREE.DoubleSide });
  const stairMaterial = new THREE.MeshStandardMaterial({ color: 0xa78e6a, roughness: 0.87 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x365953, roughness: 0.88, side: THREE.DoubleSide });
  const roofEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0x244641, roughness: 0.85 });
  const zoneMaterials = new Map();
  const zoneMeshes = [];
  const markers = [];
  let selectedZone = null;
  let activeFloor = 'all';

  const siteShape = makeShape(model.siteBoundary);
  const site = new THREE.Mesh(new THREE.ShapeGeometry(siteShape),
    new THREE.MeshStandardMaterial({ color: 0x9db9a1, roughness: 1, side: THREE.DoubleSide }));
  site.rotation.x = Math.PI / 2;
  // Pascal's Level 1 is the shared ground-floor datum; Level 0 sits 2.93 m below it.
  const gradeY = levelByIndex.get(1)?.base ?? levelByIndex.get(0).height;
  site.position.y = gradeY - 0.035;
  viewport.dataset.gradeY = gradeY.toFixed(3);
  scene.add(site);
  const bounds = new THREE.Box3().setFromObject(site);
  const center = bounds.getCenter(new THREE.Vector3());
  center.y = 4;
  const overviewDirection = new THREE.Vector3(0.58, 0.62, 0.64).normalize();
  camera.position.set(center.x + 28, 30, center.z + 29);
  controls.target.copy(center);
  controls.update();

  for (const wall of model.walls) {
    const level = levelByIndex.get(wall.level);
    const group = groupByLevel.get(wall.level).walls;
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    const local = new THREE.Group();
    local.position.set(wall.start[0], level.base, wall.start[1]);
    local.rotation.y = -Math.atan2(dz, dx);
    group.add(local);
    const cuts = wall.openings.filter((opening) => opening.width > 0 && opening.height > 0)
      .map((opening) => ({ opening,
        left: clamp(opening.along - opening.width / 2, 0, length),
        right: clamp(opening.along + opening.width / 2, 0, length),
        bottom: clamp(opening.centerY - opening.height / 2, 0, wall.height),
        top: clamp(opening.centerY + opening.height / 2, 0, wall.height) }))
      .filter((cut) => cut.right - cut.left > 0.001 && cut.top - cut.bottom > 0.001);
    const xs = breaks(0, length, cuts.flatMap((cut) => [cut.left, cut.right]));
    const ys = breaks(0, wall.height, cuts.flatMap((cut) => [cut.bottom, cut.top]));
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      const y = (ys[j] + ys[j + 1]) / 2;
      if (cuts.some((cut) => x > cut.left && x < cut.right && y > cut.bottom && y < cut.top)) continue;
      addBox(local, [xs[i + 1] - xs[i], ys[j + 1] - ys[j], wall.thickness],
        [x, y, 0], wall.exterior ? wallMaterials[0] : wallMaterials[1]);
    }
    for (const cut of cuts) {
      const { opening } = cut;
      const width = cut.right - cut.left;
      const height = cut.top - cut.bottom;
      const x = (cut.left + cut.right) / 2;
      const y = (cut.bottom + cut.top) / 2;
      const trim = Math.min(0.055, width / 7, height / 7);
      addBox(local, [trim, height, wall.thickness + 0.025], [cut.left + trim / 2, y, 0], frameMaterial);
      addBox(local, [trim, height, wall.thickness + 0.025], [cut.right - trim / 2, y, 0], frameMaterial);
      addBox(local, [width, trim, wall.thickness + 0.025], [x, cut.top - trim / 2, 0], frameMaterial);
      if (opening.type === 'window') {
        addBox(local, [width - 2 * trim, height - 2 * trim, 0.018], [x, y, 0], glazingMaterial);
        addBox(local, [width + 0.06, 0.035, wall.thickness + 0.11], [x, cut.bottom, 0], frameMaterial);
      } else {
        addBox(local, [width - 2 * trim, height - trim - 0.035, 0.035],
          [x, (cut.bottom + cut.top - 0.035) / 2, wall.thickness / 2 + 0.01],
          opening.category === 'exterior' ? exteriorDoorMaterial : doorMaterial);
      }
    }
  }

  for (const surface of model.surfaces) {
    const level = levelByIndex.get(surface.level);
    const material = surface.type === 'ceiling' ? ceilingMaterial : surface.deck ? deckMaterial : slabMaterial;
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(makeShape(surface.polygon, surface.holes),
      { depth: surface.thickness, bevelEnabled: false, curveSegments: 1 }), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = level.base + surface.elevation;
    groupByLevel.get(surface.level)[surface.type === 'ceiling' ? 'ceilings' : 'floors'].add(mesh);
  }

  for (const stair of model.stairs) {
    const group = new THREE.Group();
    group.position.set(...stair.position);
    group.rotation.y = stair.rotation;
    groupByLevel.get(stair.level).stairs.add(group);
    for (let i = 0; i < stair.steps; i++) {
      const run = stair.length / stair.steps;
      const rise = stair.rise / stair.steps;
      // The source describes a schematic flight envelope, not detailed stair joinery.
      addBox(group, [stair.width, Math.max(0.045, rise * 0.28), run],
        [0, (i + 1) * rise, -stair.length / 2 + (i + 0.5) * run], stairMaterial);
    }
  }

  for (const roof of model.roofs) {
    const group = new THREE.Group();
    group.position.set(roof.x, roof.y, roof.z);
    group.rotation.y = roof.rotation;
    groupByLevel.get(roof.level).roofs.add(group);
    const halfX = roof.width / 2 + roof.overhang;
    const halfZ = roof.depth / 2 + roof.overhang;
    const eave = roof.heel;
    if (roof.type === 'gable') {
      const ridge = eave + Math.tan(THREE.MathUtils.degToRad(roof.pitch)) * roof.depth / 2;
      addPanel(group, [[-halfX, eave, -halfZ], [halfX, eave, -halfZ],
        [halfX, ridge, 0], [-halfX, ridge, 0]], roofMaterial);
      addPanel(group, [[-halfX, ridge, 0], [halfX, ridge, 0],
        [halfX, eave, halfZ], [-halfX, eave, halfZ]], roofMaterial);
      for (const x of [-roof.width / 2, roof.width / 2]) {
        // Pascal's roof wall-shell is represented schematically as a filled gable end.
        addTriangle(group, [[x, eave, -roof.depth / 2], [x, ridge, 0],
          [x, eave, roof.depth / 2]], wallMaterials[0]);
        if (eave > 0.02) addBox(group, [0.12, eave, roof.depth],
          [x, eave / 2, 0], wallMaterials[0]);
      }
      for (const z of [-halfZ, halfZ]) {
        const edge = addBox(group, [roof.width + roof.overhang * 2, 0.06, 0.075],
          [0, eave - 0.025, z], roofEdgeMaterial);
        edge.userData.roofId = roof.id;
      }
    } else {
      const slope = Math.tan(THREE.MathUtils.degToRad(roof.pitch)) * roof.depth / 2;
      addPanel(group, [[-halfX, eave + slope, -halfZ], [halfX, eave + slope, -halfZ],
        [halfX, eave - slope, halfZ], [-halfX, eave - slope, halfZ]], roofMaterial);
    }
  }

  for (const zone of model.zones) {
    const level = levelByIndex.get(zone.level);
    const material = new THREE.MeshBasicMaterial({ color: zone.building === 'ADU' ? 0xd0b987 :
      zone.building === 'Garage' ? 0xa0bac1 : 0x9fc6ae,
      transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
    zoneMaterials.set(zone.id, material);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(makeShape(zone.polygon)), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = level.base + 0.035;
    mesh.userData.zone = zone;
    groupByLevel.get(zone.level).zones.add(mesh);
    zoneMeshes.push(mesh);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.textContent = zone.name;
    marker.title = `${zone.building} · ${zone.name}`;
    marker.addEventListener('click', () => chooseZone(zone));
    viewport.append(marker);
    const centroid = polygonCentroid(zone.polygon);
    markers.push({ zone, element: marker, world: new THREE.Vector3(centroid[0], level.base + 0.1, centroid[1]) });
  }

  const fullButton = document.createElement('button');
  fullButton.type = 'button';
  fullButton.textContent = 'Whole house';
  fullButton.dataset.floor = 'all';
  levelButtons.append(fullButton);
  for (const level of floorLevels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.floor = String(level.index);
    button.textContent = level.index === 0 ? 'Basement · L0' :
      level.index === 1 ? 'Ground · L1' : level.name;
    levelButtons.append(button);
  }
  levelButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-floor]');
    if (!button) return;
    activeFloor = button.dataset.floor === 'all' ? 'all' : Number(button.dataset.floor);
    selectedZone = null;
    roomSelect.value = '';
    detail.textContent = activeFloor === 'all' ? 'Whole house · switch off roofs to see the upper floor.'
      : activeFloor === 0 ? 'Basement cutaway · ground hidden so you can orbit into Level 0.'
        : `${levelByIndex.get(activeFloor).name} · choose a room or click a room label.`;
    setVisibility();
    if (activeFloor === 'all') resetCamera();
    else focusFloor(activeFloor);
    if (mobileQuery.matches) setSheetExpanded(false);
  });
  resetView.addEventListener('click', () => fullButton.click());
  sheetToggle.addEventListener('click', () => setSheetExpanded(sheet.dataset.expanded !== 'true'));
  function setSheetExpanded(open) {
    sheet.dataset.expanded = String(open);
    sheetToggle.setAttribute('aria-expanded', String(open));
    if (!open) sheet.scrollTop = 0;
  }
  function dismissGesture() {
    gestureTip.hidden = true;
    try { window.sessionStorage.setItem('digital-build-gestures-v1', 'seen'); } catch { /* Storage may be unavailable in an iframe. */ }
  }
  try {
    gestureTip.hidden = !mobileQuery.matches ||
      window.sessionStorage.getItem('digital-build-gestures-v1') === 'seen';
  } catch { gestureTip.hidden = !mobileQuery.matches; }
  gestureDismiss.addEventListener('click', dismissGesture);
  renderer.domElement.addEventListener('pointerdown', dismissGesture, { once: true });
  for (const level of floorLevels) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = level.name;
    for (const zone of model.zones.filter((item) => item.level === level.index)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const option = document.createElement('option');
      option.value = zone.id;
      option.textContent = `${zone.building} · ${zone.name}`;
      optgroup.append(option);
    }
    roomSelect.append(optgroup);
  }
  roomSelect.addEventListener('change', () => {
    const zone = model.zones.find((item) => item.id === roomSelect.value);
    if (zone) chooseZone(zone);
  });
  for (const input of [roofToggle, xrayToggle, ceilingToggle]) input.addEventListener('change', setVisibility);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  renderer.domElement.addEventListener('pointerdown', (event) => { pointerDown = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(zoneMeshes.filter((mesh) => mesh.parent.visible))[0];
    if (hit) chooseZone(hit.object.userData.zone);
  });

  function chooseZone(zone) {
    activeFloor = zone.level;
    selectedZone = zone;
    roomSelect.value = zone.id;
    detail.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = zone.name;
    detail.append(title, document.createTextNode(`${zone.building} · ${levelByIndex.get(zone.level).name}. Room boundary is schematic where source dimensions are unresolved.`));
    setVisibility();
    if (mobileQuery.matches) setSheetExpanded(false);
    const [x, z] = polygonCentroid(zone.polygon);
    const xs = zone.polygon.map((point) => point[0]);
    const zs = zone.polygon.map((point) => point[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const distance = mobileQuery.matches ? clamp(span * 2.8, 18, 38) : 11;
    focus(new THREE.Vector3(x, levelByIndex.get(zone.level).base + 1.1, z), distance);
  }

  function focus(target, distance) {
    const direction = camera.position.clone().sub(controls.target).normalize();
    if (direction.lengthSq() < 0.01) direction.set(0.6, 0.6, 0.6).normalize();
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.target.copy(target);
    controls.update();
  }
  function overviewDistance() {
    const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
    return Math.max(55, 75 / Math.max(0.7, aspect),
      mobileQuery.matches && viewport.clientHeight < 520 ? 75 : 0);
  }
  function resetCamera() {
    camera.position.copy(center).addScaledVector(overviewDirection, overviewDistance());
    controls.target.copy(center);
    controls.update();
  }
  function focusFloor(index) {
    const points = model.zones.filter((zone) => zone.level === index).flatMap((zone) => zone.polygon);
    if (!points.length) {
      focus(new THREE.Vector3(center.x, levelByIndex.get(index).base + 1.3, center.z),
        overviewDistance() * 0.88);
      return;
    }
    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const target = new THREE.Vector3((minX + maxX) / 2,
      levelByIndex.get(index).base + 1.3, (minZ + maxZ) / 2);
    const footprint = Math.max(maxX - minX, maxZ - minZ);
    const distance = Math.min(overviewDistance() * 0.88,
      Math.max(mobileQuery.matches ? 40 : 34, footprint * (mobileQuery.matches ? 3.8 : 2.4)));
    camera.position.copy(target).addScaledVector(overviewDirection, distance);
    controls.target.copy(target);
    controls.update();
  }
  function setVisibility() {
    // The grade plane covers the basement in the whole-house view, but never in its cutaway.
    site.visible = activeFloor !== 0;
    viewport.dataset.groundVisible = String(site.visible);
    for (const [index, groups] of groupByLevel) {
      const shown = activeFloor === 'all' || index === activeFloor;
      groups.walls.visible = shown;
      groups.floors.visible = shown;
      groups.stairs.visible = shown;
      groups.zones.visible = shown && activeFloor !== 'all';
      groups.ceilings.visible = shown && ceilingToggle.checked;
      groups.roofs.visible = activeFloor === 'all' && roofToggle.checked;
    }
    for (const material of wallMaterials) {
      material.transparent = xrayToggle.checked;
      material.opacity = xrayToggle.checked ? 0.24 : 1;
      material.depthWrite = !xrayToggle.checked;
      material.needsUpdate = true;
    }
    for (const [id, material] of zoneMaterials) {
      material.opacity = selectedZone?.id === id ? 0.75 : 0.38;
      material.color.setHex(selectedZone?.id === id ? 0xe9b75d :
        model.zones.find((zone) => zone.id === id).building === 'ADU' ? 0xd0b987 :
        model.zones.find((zone) => zone.id === id).building === 'Garage' ? 0xa0bac1 : 0x9fc6ae);
    }
    for (const button of levelButtons.querySelectorAll('button[data-floor]')) {
      button.setAttribute('aria-pressed', String(button.dataset.floor === String(activeFloor)));
    }
    sheetSummary.textContent = selectedZone ? `${selectedZone.name} · rooms & layers` :
      activeFloor === 0 ? 'Basement cutaway · rooms & layers' :
        activeFloor === 'all' ? 'Explore floors & rooms' :
          `${levelByIndex.get(activeFloor).name} · rooms & layers`;
  }
  setVisibility();

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileQuery.matches ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();
  resetCamera();
  const projected = new THREE.Vector3();
  let lastFrame = 0;
  function animate(time) {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    if (mobileQuery.matches && time - lastFrame < 33) return;
    lastFrame = time;
    controls.update();
    const mobile = mobileQuery.matches;
    const mobileMarkers = mobile && activeFloor !== 'all' ?
      markers.filter((marker) => marker.zone.level === activeFloor)
        .sort((a, b) => a.world.distanceToSquared(controls.target) - b.world.distanceToSquared(controls.target))
        .slice(0, 4) : [];
    const mobileMarkerIds = new Set(mobileMarkers.map((marker) => marker.zone.id));
    if (selectedZone) mobileMarkerIds.add(selectedZone.id);
    for (const marker of markers) {
      const visible = activeFloor === marker.zone.level &&
        (!mobile || mobileMarkerIds.has(marker.zone.id));
      if (!visible) { marker.element.hidden = true; continue; }
      projected.copy(marker.world).project(camera);
      const pixelX = (projected.x + 1) * viewport.clientWidth / 2;
      const pixelY = (1 - projected.y) * viewport.clientHeight / 2;
      const edgeMargin = mobile ? Math.min(115, Math.max(55, marker.zone.name.length * 5)) : 0;
      marker.element.hidden = projected.z < -1 || projected.z > 1
        || Math.abs(projected.x) > 0.96 || Math.abs(projected.y) > 0.94
        || (mobile && (pixelX < edgeMargin || pixelX > viewport.clientWidth - edgeMargin
          || pixelY < 78 || pixelY > viewport.clientHeight - sheet.clientHeight - 18));
      if (!marker.element.hidden) {
        marker.element.style.left = `${pixelX}px`;
        marker.element.style.top = `${pixelY}px`;
      }
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function breaks(low, high, values) {
  return [...new Set([low, high, ...values].map((number) => Number(number.toFixed(6))))].sort((a, b) => a - b);
}
function signedArea(points) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point[0] * next[1] - next[0] * point[1];
  }, 0);
}
function makeShape(outline, holes = []) {
  const outer = signedArea(outline) > 0 ? outline : [...outline].reverse();
  const shape = new THREE.Shape();
  shape.moveTo(...outer[0]);
  for (const point of outer.slice(1)) shape.lineTo(...point);
  shape.closePath();
  for (const hole of holes) {
    const points = signedArea(hole) < 0 ? hole : [...hole].reverse();
    const path = new THREE.Path();
    path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}
function addBox(group, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}
function addPanel(group, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return mesh;
}
function addTriangle(group, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return mesh;
}
function polygonCentroid(points) {
  let area = 0; let x = 0; let z = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const cross = ax * bz - bx * az;
    area += cross;
    x += (ax + bx) * cross;
    z += (az + bz) * cross;
  }
  if (Math.abs(area) < 1e-9) return points[0];
  return [x / (3 * area), z / (3 * area)];
}
