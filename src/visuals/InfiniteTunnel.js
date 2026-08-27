import * as THREE from 'three'

const palettes = [
  { name: 'crimson', frames: 0xff2222, shapes: 0xff2222, bg: 0x040405 },
  { name: 'ocean', frames: 0x0066ff, shapes: 0x00aaff, bg: 0x020408 },
  { name: 'emerald', frames: 0x00ff66, shapes: 0x00cc88, bg: 0x020503 },
  { name: 'violet', frames: 0xaa00ff, shapes: 0xcc44ff, bg: 0x040208 },
  { name: 'solar', frames: 0xffaa00, shapes: 0xff6600, bg: 0x060402 },
  { name: 'ice', frames: 0x00ddff, shapes: 0x88eeff, bg: 0x020506 },
  { name: 'rose', frames: 0xff0066, shapes: 0xff4488, bg: 0x060204 },
  { name: 'gold', frames: 0xffdd00, shapes: 0xffaa00, bg: 0x060502 }
]

export class InfiniteTunnel {
  constructor(scene, frameCount = 50, shapeCount = 40) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    this.frames = []
    this.shapes = []
    this.tunnelLength = 200
    this.frameCount = frameCount
    this.shapeCount = shapeCount

    this.currentPalette = 0
    this.targetPalette = 1
    this.paletteProgress = 0
    this.paletteInterval = 15
    this.paletteTimer = 0
    this.currentColors = {
      frames: new THREE.Color(palettes[0].frames),
      shapes: new THREE.Color(palettes[0].shapes),
      bg: new THREE.Color(palettes[0].bg)
    }

    this.paletteColors = palettes.map(p => ({
      frames: new THREE.Color(p.frames),
      shapes: new THREE.Color(p.shapes),
      bg: new THREE.Color(p.bg)
    }))

    this.buildFrames()
    this.buildShapes()
  }

  buildFrames() {
    const size = 16
    const thickness = 0.15

    for (let i = 0; i < this.frameCount; i++) {
      const group = new THREE.Group()

      const topGeo = new THREE.BoxGeometry(size, thickness, thickness)
      const bottomGeo = new THREE.BoxGeometry(size, thickness, thickness)
      const leftGeo = new THREE.BoxGeometry(thickness, size, thickness)
      const rightGeo = new THREE.BoxGeometry(thickness, size, thickness)

      const mat = new THREE.MeshBasicMaterial({
        color: palettes[0].frames,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })

      const top = new THREE.Mesh(topGeo, mat.clone())
      top.position.y = size / 2
      const bottom = new THREE.Mesh(bottomGeo, mat.clone())
      bottom.position.y = -size / 2
      const left = new THREE.Mesh(leftGeo, mat.clone())
      left.position.x = -size / 2
      const right = new THREE.Mesh(rightGeo, mat.clone())
      right.position.x = size / 2

      group.add(top, bottom, left, right)

      group.position.z = -i * (this.tunnelLength / this.frameCount)
      group.userData = {
        baseZ: group.position.z,
        rotDir: Math.random() > 0.5 ? 1 : -1,
        rotSpeed: 0.002 + Math.random() * 0.006
      }

      this.group.add(group)
      this.frames.push(group)
    }
  }

  buildShapes() {
    const geometries = [
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.TetrahedronGeometry(0.4, 0),
      new THREE.IcosahedronGeometry(0.35, 0),
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.TorusGeometry(0.3, 0.08, 6, 8)
    ]

    for (let i = 0; i < this.shapeCount; i++) {
      const geo = geometries[Math.floor(Math.random() * geometries.length)]
      const mat = new THREE.MeshBasicMaterial({
        color: palettes[0].shapes,
        wireframe: true,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })

      const mesh = new THREE.Mesh(geo, mat)

      const side = Math.floor(Math.random() * 4)
      const offset = (Math.random() - 0.5) * 2
      const r = 10.0 + Math.random() * 3.0

      if (side === 0) { mesh.position.x = r; mesh.position.y = offset * r }
      else if (side === 1) { mesh.position.x = -r; mesh.position.y = offset * r }
      else if (side === 2) { mesh.position.y = r; mesh.position.x = offset * r }
      else { mesh.position.y = -r; mesh.position.x = offset * r }

      mesh.userData = {
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02
        ),
        floatSpeed: Math.random() * 0.5 + 0.5,
        floatAmp: 0.2 + Math.random() * 0.3,
        baseY: mesh.position.y,
        baseX: mesh.position.x,
        baseZ: Math.random() * this.tunnelLength
      }

      this.group.add(mesh)
      this.shapes.push(mesh)
    }
  }

  setDensity(frameCount, shapeCount) {
    this.frameCount = frameCount
    this.shapeCount = shapeCount
    this.clearAll()
    this.buildFrames()
    this.buildShapes()
  }

  clearAll() {
    for (const frame of this.frames) {
      frame.children.forEach(child => {
        child.geometry.dispose()
        child.material.dispose()
      })
    }
    for (const shape of this.shapes) {
      shape.geometry.dispose()
      shape.material.dispose()
    }
    this.frames = []
    this.shapes = []
    this.group.clear()
  }

  updateColors(delta, audioData) {
    this.paletteTimer += delta

    if (this.paletteTimer >= this.paletteInterval) {
      this.paletteTimer = 0
      this.currentPalette = this.targetPalette
      this.targetPalette = (this.targetPalette + 1) % palettes.length
      this.paletteProgress = 0
    }

    this.paletteProgress += delta * 0.15
    if (this.paletteProgress > 1) this.paletteProgress = 1

    const t = this.paletteProgress
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    const from = this.paletteColors[this.currentPalette]
    const to = this.paletteColors[this.targetPalette]

    this.currentColors.frames.lerpColors(from.frames, to.frames, ease)
    this.currentColors.shapes.lerpColors(from.shapes, to.shapes, ease)
    this.currentColors.bg.lerpColors(from.bg, to.bg, ease)

    for (const frame of this.frames) {
      frame.children.forEach(child => {
        child.material.color.copy(this.currentColors.frames)
      })
    }

    for (const shape of this.shapes) {
      shape.material.color.copy(this.currentColors.shapes)
    }

    this.scene.background.copy(this.currentColors.bg)
  }

  update(delta, offset, audioData, isPlaying) {
    this.updateColors(delta, audioData)

    for (const frame of this.frames) {
      let z = frame.userData.baseZ + offset
      z = ((z % this.tunnelLength) + this.tunnelLength) % this.tunnelLength
      frame.position.z = -z

      const axis = frame.userData.rotDir
      frame.rotation.z += frame.userData.rotSpeed * axis

      const normalizedZ = z / this.tunnelLength
      const fade = Math.abs(Math.sin(normalizedZ * Math.PI))

    const opacity = fade * 0.3 + 0.1
      frame.children.forEach(child => {
        child.material.opacity = Math.min(opacity, 0.5)
      })
    }

    for (const shape of this.shapes) {
      let z = shape.userData.baseZ + offset * 0.8
      z = ((z % this.tunnelLength) + this.tunnelLength) % this.tunnelLength
      shape.position.z = -z

      shape.rotation.x += shape.userData.rotSpeed.x * (1 + audioData.treble * 3)
      shape.rotation.y += shape.userData.rotSpeed.y * (1 + audioData.treble * 3)
      shape.rotation.z += shape.userData.rotSpeed.z * (1 + audioData.treble * 3)

      shape.position.y = shape.userData.baseY + Math.sin(offset * 0.01 + shape.userData.floatSpeed) * shape.userData.floatAmp
      shape.position.x = shape.userData.baseX + Math.cos(offset * 0.007 + shape.userData.floatSpeed) * shape.userData.floatAmp * 0.5

      const intensity = 0.3 + audioData.bass * 0.7
      shape.material.opacity = intensity * 0.6
      const scale = 1 + audioData.bass * 0.3
      shape.scale.setScalar(scale)
    }
  }

  dispose() {
    this.clearAll()
    this.scene.remove(this.group)
  }
}
