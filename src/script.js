import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { MSDFTextGeometry, MSDFTextMaterial, uniforms } from 'three-msdf-text-utils'
// import fontjson from '../static/fonts/manifold/manifold-msdf.json'
// import font from '../static/fonts/manifold/manifold-msdf.fnt'
// import fontTexture from '../static/fonts/manifold/manifold.png'
import fontGradientMap from '../static/fonts/manifold/gradient-map.png'
import textVertexShader from '/js/shaders/text/vertex.glsl'
import textFragmentShader from '/js/shaders/text/fragment.glsl'

import { gsap } from 'gsap'

Promise.all([
    loadFontAtlas("../fonts/manifold/manifold.png"),
    loadFont("../fonts/manifold/manifold-msdf.fnt"),
]).then(([atlas, font]) => {
    const geometry = new MSDFTextGeometry({
        text: "DALAI",
        font: font.data,
        align: 'center'
    });

    const layout = geometry.layout
    //const material = new MSDFTextMaterial();
    
    const material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        defines: {
            IS_SMALL: false,
        },
        extensions: {
            derivatives: true,
        },
        uniforms: {
            // Common
            ...uniforms.common,
            ...{
                uGradientMap:{ value: new THREE.TextureLoader(fontGradientMap)}
            },
            
            // Rendering
            ...uniforms.rendering,
            
            // Strokes
            ...uniforms.strokes,
            ...{
                uStrokeColor:{ value: {r: 255, g: 255, b: 255}},
            }
        },
        vertexShader: textVertexShader,
        fragmentShader: textFragmentShader,
    });
    material.uniforms.uMap.value = atlas;
    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.set(0.01, - 0.01, 0.01)
    mesh.position.set(-0.01 * layout.width / 2, -0.01 * layout.height / 2, 0)
    scene.add(mesh)
});

function loadFontAtlas(path) {
    const promise = new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(path, resolve);
    });

    return promise;
}

function loadFont(path) {
    const promise = new Promise((resolve, reject) => {
        const loader = new FontLoader();
        loader.load(path, resolve);
    });

    return promise;
}

const loadingBarElement = document.querySelector('.loading-bar')
const loadingManager = new THREE.LoadingManager(
    // Loaded
    () =>
    {
        // Wait a little
        window.setTimeout(() =>
        {
            // Animate overlay
            gsap.to(overlayMaterial.uniforms.uAlpha, { duration: 2, value: 0, delay: 0.3 })

            // Update loadingBarElement
            loadingBarElement.classList.add('ended')
            loadingBarElement.style.transform = ''
        }, 1200)
    },

    //Progress
    (itemUrl, itemsLoaded, itemsTotal) =>
    {
        // Calculate the progress and update the loadingBarElement
        const progressRatio = itemsLoaded / itemsTotal
        loadingBarElement.style.transform = `scaleX(${progressRatio})`
    }
)
const gltfLoader = new GLTFLoader(loadingManager)

let mixer = null

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

const cursor = {
    x: 0,
    y: 0
}

window.addEventListener('mousemove', (event) => {

    cursor.x = event.clientX / sizes.width - 0.5
    cursor.y = event.clientY / sizes.height - 0.5

})

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scena
const scene = new THREE.Scene()

const backgroundGeometry = new THREE.PlaneGeometry(5, 5, 1, 1)
const backgroundMaterial = new THREE.MeshBasicMaterial({color: 0xffffff})//0x11361b})
const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial)

backgroundMesh.position.z = -1

scene.add(backgroundMesh)

// Overlay
const overlayGeometry = new THREE.PlaneGeometry(2, 2, 1, 1)
const overlayMaterial = new THREE.ShaderMaterial({
    // wireframe: true,
    transparent: true,
    uniforms:
    {
        uAlpha: { value: 1 }
    },
    vertexShader: `
        void main()
        {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uAlpha;

        void main()
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha);
        }
    `
})
const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial)
scene.add(overlay)

// Camera

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 20)
camera.position.set(0, 0, 0.4)


let mesh

gltfLoader.load(
    'models/cima/Imagine_the_Smell.glb',
    (gltf) => {

        mixer = new THREE.AnimationMixer(gltf.scene);
        
        const clips = gltf.animations;

        clips.forEach( function ( clip ) {
            mixer.clipAction( clip ).play();
        } );

        mesh = gltf.scene.children[0]
        
        scene.add(mesh)

        
        
        mesh.position.y = - 0.5
        mesh.position.x = - 0.1
        // mesh.position.z = - 3

        mesh.rotation.z = 1
        mesh.rotation.x = 1.2
        mesh.rotation.y = - 0.2
        
        //camera.lookAt(mesh.position)
        scene.add(camera)
  }
)


/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 1)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(1024, 1024)
directionalLight.shadow.camera.far = 10
directionalLight.shadow.camera.left = - 7
directionalLight.shadow.camera.top = 7
directionalLight.shadow.camera.right = 7
directionalLight.shadow.camera.bottom = - 7
directionalLight.position.set(-5, 5, -0.5)
scene.add(directionalLight)


window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})



// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableZoom = true
controls.enableRotate = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.outputColorSpace = THREE.LinearSRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime

    if(mixer !== null){
    mixer.update(deltaTime)
    }
    

    // camera.position.x = cursor.x * 0.04
    // camera.position.y = cursor.y * 0.025


    // Update controls
    controls.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()