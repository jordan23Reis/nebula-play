import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { QUALITY, TIERS } from '../performance/PerfMonitor.js'

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.5 },
    uSmoothness: { value: 0.5 }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.5, 0.5 - uSmoothness, d);
      color.rgb *= mix(1.0 - uIntensity, 1.0, vig);
      gl_FragColor = color;
    }
  `
}

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: 0.0015 },
    uTime: { value: 0 }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5);
      float dist = length(dir);
      float off = uOffset * dist;
      float r = texture2D(tDiffuse, vUv + dir * off).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * off).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
}

const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 0.04 }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb += (rand(vUv + uTime) - 0.5) * uIntensity;
      gl_FragColor = color;
    }
  `
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x020204)

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200)
    this.camera.position.set(0, 5, 12)
    this.camera.lookAt(0, -1, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.3, 0.7)
    this.bloomPass.threshold = 0.15
    this.bloomPass.strength = 0.8
    this.bloomPass.radius = 0.3
    this.composer.addPass(this.bloomPass)

    this.chromaPass = new ShaderPass(ChromaticAberrationShader)
    this.composer.addPass(this.chromaPass)

    this.grainPass = new ShaderPass(FilmGrainShader)
    this.composer.addPass(this.grainPass)

    this.vignettePass = new ShaderPass(VignetteShader)
    this.composer.addPass(this.vignettePass)

    this.useComposer = true
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)

    this.time = 0
    this.setupResize()
  }

  setQuality(tier) {
    this.useComposer = !!QUALITY[tier].postFX
    this.pixelRatio = QUALITY[tier].pixelRatio
    if (tier === TIERS.HIGH || tier === TIERS.MEDIUM) {
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.pixelRatio)
    }
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    if (this.useComposer) {
      this.composer.setSize(window.innerWidth, window.innerHeight)
    }
    console.log(`[Perf] SceneManager: postFX=${this.useComposer}, pixelRatio=${this.pixelRatio}`)
  }

  setupResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth
      const h = window.innerHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
      if (this.useComposer) this.composer.setSize(w, h)
    })
  }

  update(delta, audioData) {
    this.time += delta
    this.chromaPass.uniforms.uTime.value = this.time
    this.chromaPass.uniforms.uOffset.value = 0.001 + audioData.bass * 0.002
    this.grainPass.uniforms.uTime.value = this.time * 50
    this.bloomPass.strength = 0.6 + audioData.bass * 0.6
  }

  render() {
    if (this.useComposer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }
}
