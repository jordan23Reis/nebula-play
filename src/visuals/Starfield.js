import * as THREE from 'three'

export class Starfield {
  constructor(scene) {
    this.scene = scene
    this.count = 1500
    this.tunnelLength = 200

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.count * 3)
    const sizes = new Float32Array(this.count)

    for (let i = 0; i < this.count; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = 40 + Math.random() * 80
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = Math.sin(angle) * r
      positions[i * 3 + 2] = -Math.random() * this.tunnelLength
      sizes[i] = 2 + Math.random() * 5
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    })

    this.mesh = new THREE.Points(geometry, material)
    this.mesh.renderOrder = 999
    scene.add(this.mesh)
  }

  update(delta) {
    const positions = this.mesh.geometry.attributes.position.array

    for (let i = 0; i < this.count; i++) {
      positions[i * 3 + 2] += 0.12

      if (positions[i * 3 + 2] > 15) {
        positions[i * 3 + 2] = -this.tunnelLength
        const angle = Math.random() * Math.PI * 2
        const r = 40 + Math.random() * 80
        positions[i * 3] = Math.cos(angle) * r
        positions[i * 3 + 1] = Math.sin(angle) * r
      }
    }

    this.mesh.geometry.attributes.position.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.scene.remove(this.mesh)
  }
}
