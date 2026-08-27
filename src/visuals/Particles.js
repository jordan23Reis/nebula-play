import * as THREE from 'three'

export class Particles {
  constructor(scene, count = 2000) {
    this.scene = scene
    this.count = count
    this.build()
  }

  build() {
    if (this.mesh) this.dispose()

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.count * 3)
    const sizes = new Float32Array(this.count)
    const phases = new Float32Array(this.count)

    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40
      positions[i * 3 + 1] = Math.random() * 15 - 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40
      sizes[i] = Math.random() * 2 + 0.3
      phases[i] = Math.random() * Math.PI * 2
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uTreble: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColor: { value: new THREE.Color(0xff2222) }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uBass;
        uniform float uTreble;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.x += sin(uTime * 0.15 + aPhase) * 1.0;
          pos.y += cos(uTime * 0.12 + aPhase * 0.7) * 0.8;
          pos.z += sin(uTime * 0.1 + aPhase * 1.3) * 0.6;
          pos.y += uBass * 0.5 * sin(aPhase + uTime * 2.0);
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float dist = length(mvPosition.xyz);
          vAlpha = smoothstep(30.0, 3.0, dist) * (0.15 + uTreble * 0.25);
          gl_PointSize = aSize * uPixelRatio * (2.5 / dist) * (1.0 + uTreble * 0.5);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    this.mesh = new THREE.Points(geometry, material)
    this.scene.add(this.mesh)
  }

  setDensity(count) {
    this.count = count
    this.build()
  }

  setPixelRatio(ratio) {
    this.mesh.material.uniforms.uPixelRatio.value = ratio
  }

  update(delta, elapsed, audioData) {
    this.mesh.material.uniforms.uTime.value = elapsed
    this.mesh.material.uniforms.uBass.value = audioData.bass
    this.mesh.material.uniforms.uTreble.value = audioData.treble
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.scene.remove(this.mesh)
  }
}
