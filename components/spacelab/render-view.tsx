'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Scene } from '@/lib/spacelab/studio/scene';

/**
 * The render window: the scene document drawn with three.js. Items are boxes
 * at their real size until the per-item meshes (lib/spacelab/models.ts)
 * are wired in. Scene coordinates are feet with the back-left corner at the
 * origin, so the three.js scene uses the same axes: x right, y up, z toward
 * the camera.
 *
 * Colours live here, not in CSS, because WebGL cannot read a token. They are
 * the photo plate's materials: cream paper for the floor and walls, ink
 * rules, coral for a selected piece. Plates stay cream in both themes.
 */
const PLATE = {
  paper: 0xf3eedd,
  paperDeep: 0xe6dfc8,
  ink: 0x1a1713,
  wood: 0xb08a5a,
  fabric: 0x6d7f6a,
  metal: 0xc9a24a,
  green: 0x4f7a4a,
} as const;

const ITEM_COLOR: Record<string, number> = {
  sofa: PLATE.fabric,
  armchair: PLATE.wood,
  'coffee-table': PLATE.wood,
  lamp: PLATE.metal,
  ficus: PLATE.green,
  rug: PLATE.paperDeep,
};

export function RenderView({ scene }: { scene: Scene }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const three = new THREE.Scene();
    three.background = new THREE.Color(PLATE.paper);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    cameraRef.current = { camera, controls };

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-10, 18, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    three.add(key, new THREE.HemisphereLight(0xfff8e8, 0x8a8470, 1.1));

    const world = new THREE.Group();
    three.add(world);
    worldRef.current = world;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(three, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeChildren(world);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      worldRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    const cam = cameraRef.current;
    if (!world || !cam) return;
    const previousRoom = world.userData.room as Scene['room'] | undefined;
    disposeChildren(world);
    buildRoom(world, scene);
    buildItems(world, scene);
    world.userData.room = scene.room;
    if (!previousRoom || previousRoom.width !== scene.room.width || previousRoom.depth !== scene.room.depth) {
      frameRoom(cam.camera, cam.controls, scene.room);
    }
  }, [scene]);

  return <div ref={mountRef} className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" />;
}

function buildRoom(world: THREE.Group, { room }: Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ color: PLATE.paperDeep, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.depth / 2);
  floor.receiveShadow = true;

  const wallMaterial = new THREE.MeshStandardMaterial({ color: PLATE.paper, roughness: 1, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), wallMaterial);
  back.position.set(room.width / 2, room.height / 2, 0);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), wallMaterial);
  left.rotation.y = Math.PI / 2;
  left.position.set(0, room.height / 2, room.depth / 2);
  left.receiveShadow = true;
  const right = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), wallMaterial);
  right.rotation.y = -Math.PI / 2;
  right.position.set(room.width, room.height / 2, room.depth / 2);
  right.receiveShadow = true;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, room.height, room.depth)),
    new THREE.LineBasicMaterial({ color: PLATE.ink }),
  );
  edges.position.set(room.width / 2, room.height / 2, room.depth / 2);

  // One-foot grid on the floor, bounded by the room.
  const points: number[] = [];
  for (let x = 1; x < room.width; x++) points.push(x, 0.01, 0, x, 0.01, room.depth);
  for (let z = 1; z < room.depth; z++) points.push(0, 0.01, z, room.width, 0.01, z);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: PLATE.ink, transparent: true, opacity: 0.1 }));

  world.add(floor, back, left, right, edges, grid);
}

function buildItems(world: THREE.Group, scene: Scene) {
  for (const item of scene.items) {
    const p = scene.placements[item.id];
    if (!p) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(item.size.w, item.size.h, item.size.d),
      new THREE.MeshStandardMaterial({ color: ITEM_COLOR[item.id] ?? PLATE.wood, roughness: 0.8 }),
    );
    mesh.castShadow = item.size.h > 0.5;
    mesh.receiveShadow = true;
    mesh.position.set(p.x, item.size.h / 2, p.z);
    mesh.rotation.y = -THREE.MathUtils.degToRad(p.rotation);
    mesh.name = item.id;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: PLATE.ink }));
    mesh.add(outline);
    world.add(mesh);
  }
}

/** Stand in the doorway: a camera that sees the whole room from the front. */
function frameRoom(camera: THREE.PerspectiveCamera, controls: OrbitControls, room: Scene['room']) {
  const target = new THREE.Vector3(room.width / 2, room.height * 0.3, room.depth / 2);
  const span = Math.max(room.width, room.depth * 1.2);
  const distance = (span / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
  camera.position.set(room.width / 2 + span * 0.25, room.height * 1.3, room.depth + distance);
  controls.target.copy(target);
  controls.update();
}

function disposeChildren(group: THREE.Group) {
  for (const child of [...group.children]) {
    child.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        const material = node.material as THREE.Material | THREE.Material[];
        (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
      }
    });
    group.remove(child);
  }
}
