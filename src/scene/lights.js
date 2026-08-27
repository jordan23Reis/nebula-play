import * as THREE from 'three'

export class Lights {
  constructor(scene) {
    this.scene = scene

    scene.add(new THREE.AmbientLight(0x110808, 0.4))

    const pointA = new THREE.PointLight(0xff2222, 1.0, 50)
    pointA.position.set(0, 8, 0)
    scene.add(pointA)

    const pointB = new THREE.PointLight(0x7a0d0d, 0.6, 40)
    pointB.position.set(-8, 3, -5)
    scene.add(pointB)

    const pointC = new THREE.PointLight(0xff5b5b, 0.4, 30)
    pointC.position.set(8, 2, -8)
    scene.add(pointC)

    this.lights = { pointA, pointB, pointC }
  }

  update(audioData) {
    if (!audioData) return
    this.lights.pointA.intensity = 1.0 + audioData.bass * 0.8
    this.lights.pointB.intensity = 0.6 + audioData.mid * 0.6
    this.lights.pointC.intensity = 0.4 + audioData.treble * 0.4
  }
}
