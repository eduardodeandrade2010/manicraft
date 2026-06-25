import * as THREE from 'three';

// Animated water surface shared by every chunk. A MeshStandardMaterial with low
// roughness catches the sun as a moving glint, and a small sine-wave vertex
// displacement (driven by a shared uTime uniform) gives gentle living ripples —
// so lakes and the sea actually read as water instead of a flat blue plane.

const uTime = { value: 0 };

// Subdivided plane so the wave displacement is visible.
const geometry = new THREE.PlaneGeometry(1, 1, 16, 16);

const material = new THREE.MeshStandardMaterial({
  color: 0x2f86c5,
  transparent: true,
  opacity: 0.8,
  roughness: 0.1,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;
  shader.vertexShader =
    'uniform float uTime;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.z += sin(position.x * 9.0 + uTime * 2.2) * 0.06
                      + cos(position.y * 7.0 + uTime * 1.7) * 0.06;`
    );
};

/** A water mesh for one chunk (shares geometry + material). */
export function createWaterMesh(size, waterOffset) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotateX(-Math.PI / 2);
  mesh.position.set(size / 2, waterOffset + 0.4, size / 2);
  mesh.scale.set(size, size, 1);
  mesh.layers.set(1); // keep block raycaster off the water
  mesh.receiveShadow = true;
  return mesh;
}

/** Advance the wave + glint animation. Call once per frame with elapsed seconds. */
export function updateWater(t) {
  uTime.value = t;
}
