// Rode: node scripts/gerar-prato-3d.mjs. Gera public/landing/prato-3d.glb: marmita de filé à milanesa em tamanho real (prato de 26 cm).
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import fs from 'node:fs'

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend?.() }) }
}

const ruido = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s) }
function irregular(geo, forca, escala) {
  const p = geo.attributes.position, v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = (ruido(v.x * escala, v.y * escala, v.z * escala) - 0.5) * forca
    v.addScaledVector(v.clone().normalize(), n)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}
const mat = (cor, rug = 0.7, name) => Object.assign(new THREE.MeshStandardMaterial({ color: cor, roughness: rug, metalness: 0 }), { name })
const baked = (geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] }) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s))
  return geo.applyMatrix4(m)
}

const g = new THREE.Group()
g.name = 'Marmita'
const base = 0.065
const perfil = [[0, 0], [0.95, 0], [1.02, 0.02], [1.14, 0.09], [1.3, 0.15], [1.33, 0.17], [1.3, 0.18], [1.13, 0.12], [0.98, 0.065], [0, 0.065]].map(([x, y]) => new THREE.Vector2(x, y))
g.add(Object.assign(new THREE.Mesh(new THREE.LatheGeometry(perfil, 96), mat(0xfbfbf8, 0.28, 'Prato')), { name: 'Prato' }))

g.add(Object.assign(new THREE.Mesh(baked(irregular(new THREE.SphereGeometry(0.46, 64, 32), 0.07, 9), { s: [1, 0.42, 0.95], p: [-0.42, base + 0.07, -0.28] }), mat(0xf4efde, 0.85, 'Arroz')), { name: 'Arroz' }))
g.add(Object.assign(new THREE.Mesh(baked(irregular(new THREE.SphereGeometry(0.36, 48, 24), 0.03, 5), { s: [1, 0.22, 1], p: [-0.47, base + 0.035, 0.42] }), mat(0x4b2716, 0.35, 'Caldo')), { name: 'Feijao' }))
const graos = []
for (let i = 0; i < 46; i++) {
  const a = ruido(i, 1, 2) * Math.PI * 2, r = Math.sqrt(ruido(i, 3, 4)) * 0.3
  graos.push(baked(new THREE.SphereGeometry(0.028, 10, 8), { s: [1.5, 0.8, 1], r: [0, a * 3, 0], p: [-0.47 + Math.cos(a) * r, base + 0.075 - r * 0.08, 0.42 + Math.sin(a) * r] }))
}
g.add(Object.assign(new THREE.Mesh(mergeGeometries(graos), mat(0x3a1c10, 0.4, 'Graos')), { name: 'Graos' }))

const empanado = mat(0xc98637, 0.8, 'Empanado')
;[[0.42, 0.1, 0.12, 0.35, -0.04], [0.5, 0.16, -0.18, -0.25, 0.06]].forEach(([x, y, z, ry, rz], k) => {
  g.add(Object.assign(new THREE.Mesh(baked(irregular(new THREE.SphereGeometry(0.5, 64, 24), 0.06, 14), { s: [0.62, 0.11, 0.36], r: [0, ry, rz], p: [x, base + y * 0.9, z] }), empanado), { name: 'File' + (k + 1) }))
})
g.add(Object.assign(new THREE.Mesh(baked(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI), { r: [-Math.PI / 2, 0, 0.4], p: [0.82, base + 0.05, 0.3] }), mat(0x9bc53d, 0.5, 'Limao')), { name: 'Limao' }))

const farofa = []
for (let j = 0; j < 420; j++) {
  const ang = ruido(j, 7, 1) * Math.PI * 2, rr = Math.sqrt(ruido(j, 2, 9)) * 0.27, h = (0.27 - rr) * 0.35
  farofa.push(baked(new THREE.DodecahedronGeometry(0.018), { r: [ruido(j, 1, 1) * 6, ruido(j, 2, 2) * 6, 0], p: [0.02 + Math.cos(ang) * rr, base + 0.02 + h * ruido(j, 5, 5), 0.62 + Math.sin(ang) * rr * 0.8] }))
}
g.add(Object.assign(new THREE.Mesh(mergeGeometries(farofa.map((x) => x.toNonIndexed())), mat(0xddae62, 0.9, 'Farofa')), { name: 'Farofa' }))

const folhas = []
for (let l = 0; l < 6; l++) {
  folhas.push(baked(irregular(new THREE.CircleGeometry(0.17, 24), 0.05, 20), { r: [-Math.PI / 2 + 0.5 * (ruido(l, 1, 3) - 0.5), ruido(l, 4, 4) * 3, 0.6 * (ruido(l, 9, 2) - 0.5)], p: [0.6 + (ruido(l, 5, 1) - 0.5) * 0.3, base + 0.05 + l * 0.012, -0.5 + (ruido(l, 6, 2) - 0.5) * 0.25] }))
}
const alface = mat(0x5da53a, 0.6, 'Alface'); alface.side = THREE.DoubleSide
g.add(Object.assign(new THREE.Mesh(mergeGeometries(folhas.map((x) => x.toNonIndexed())), alface), { name: 'Alface' }))
const fatias = []
for (let t = 0; t < 3; t++) fatias.push(baked(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 32), { r: [0.25, 0, 0.2 - t * 0.15], p: [0.45 + t * 0.12, base + 0.12 + t * 0.012, -0.62 + t * 0.07] }).toNonIndexed())
g.add(Object.assign(new THREE.Mesh(mergeGeometries(fatias.map((f) => { f.clearGroups(); return f })), mat(0xd8402e, 0.45, 'Tomate')), { name: 'Tomate' }))

// Tamanho real: o prato (raio 1,33) vira 26 cm de diâmetro.
g.scale.setScalar(0.13 / 1.33)
const scene = new THREE.Scene()
scene.add(g)
const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
fs.mkdirSync('public/landing', { recursive: true })
fs.writeFileSync('public/landing/prato-3d.glb', Buffer.from(glb))
console.log('prato-3d.glb', (glb.byteLength / 1024).toFixed(0), 'KB')
