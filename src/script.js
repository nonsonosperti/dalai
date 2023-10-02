import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { MSDFTextGeometry, uniforms } from 'three-msdf-text-utils'

// import vertexParticles from '/js/shaders/text/vertexParticles.glsl'
// import textFragmentShader from '/js/shaders/text/fragment.glsl'
// import fragment from '/js/shaders/text/fragment.glsl'

import { gsap } from 'gsap'

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

    // console.log(cursor.x + " " + cursor.y)
})

Promise.all([
    loadFontAtlas("../fonts/manifold/manifold.png"),
    loadFont("../fonts/manifold/manifold.fnt"),
    loadFontAtlas("../fonts/manifold/gradient-map.png")
]).then(([atlas, font, gradientTexture]) => {
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
            
            // Rendering
            ...uniforms.rendering,
            
            // Strokes
            ...uniforms.strokes,
            time: { type: 'f', value: 0 },
            viewport: { type: 'v2', value: new THREE.Vector2(window.innerWidth,window.innerHeight) },
            uMouse: { type: 'v2', value: new THREE.Vector2(0,0) },
            gradientMap: { type: 't', value: gradientTexture},
        },
        vertexShader: `
            // Attribute
            attribute vec2 layoutUv;
    
            attribute float lineIndex;
    
            attribute float lineLettersTotal;
            attribute float lineLetterIndex;
    
            attribute float lineWordsTotal;
            attribute float lineWordIndex;
    
            attribute float wordIndex;
    
            attribute float letterIndex;
    
            // Varyings
            varying vec2 vUv;
            varying vec2 vLayoutUv;
            varying vec3 vViewPosition;
            varying vec3 vNormal;
    
            varying float vLineIndex;
    
            varying float vLineLettersTotal;
            varying float vLineLetterIndex;
    
            varying float vLineWordsTotal;
            varying float vLineWordIndex;
    
            varying float vWordIndex;
    
            varying float vLetterIndex;
    
            void main() {
                // Output
                vec4 mvPosition = vec4(position, 1.0);
                mvPosition = modelViewMatrix * mvPosition;
                gl_Position = projectionMatrix * mvPosition;
    
                // Varyings
                vUv = uv;
                vLayoutUv = layoutUv;
                vViewPosition = -mvPosition.xyz;
                vNormal = normal;
    
                vLineIndex = lineIndex;
    
                vLineLettersTotal = lineLettersTotal;
                vLineLetterIndex = lineLetterIndex;
    
                vLineWordsTotal = lineWordsTotal;
                vLineWordIndex = lineWordIndex;
    
                vWordIndex = wordIndex;
    
                vLetterIndex = letterIndex;
            }
        `,
        fragmentShader: `
            
            // Varyings
            varying vec2 vUv;

            
    
            // Uniforms: Common
            uniform float uOpacity;
            uniform float uThreshold;
            uniform float uAlphaTest;
            uniform vec3 uColor;
            uniform sampler2D uMap;
    
            // Uniforms: Strokes
            uniform vec3 uStrokeColor;
            uniform float uStrokeOutsetWidth;
            uniform float uStrokeInsetWidth;

            uniform vec2 uMouse;
            uniform vec2 viewport;
            uniform sampler2D gradientMap;
            uniform float time;
    
            // Utils: Median
            float median(float r, float g, float b) {
                return max(min(r, g), min(max(r, g), b));
            }

            float createCircle() {
                vec2 viewportUv = gl_FragCoord.xy / viewport;
                float viewportAspect = viewport.x / viewport.y;
      
                vec2 mousePoint = vec2(uMouse.x, 1.0 - uMouse.y);
                float circleRadius = max(0.0, 100. / viewport.x) ;
      
                vec2 shapeUv = viewportUv - mousePoint;
                shapeUv /= vec2(1.0, viewportAspect);
                shapeUv += mousePoint;
      
                float dist = distance(shapeUv, mousePoint);
                dist = smoothstep(circleRadius, circleRadius + 0.001, dist);
                return dist;
                // return uMouse.y;
            }
    
            void main() {


                // Common
                // Texture sample
                vec3 s = texture2D(uMap, vUv).rgb;
    
                // Signed distance
                float sigDist = median(s.r, s.g, s.b) - 0.5;
    
                float afwidth = 1.4142135623730951 / 2.0;
    
                #ifdef IS_SMALL
                    float alpha = smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDist);
                #else
                    float alpha = clamp(sigDist / fwidth(sigDist) + 0.5, 0.0, 1.0);
                #endif
    
                // Strokes
                // Outset
                float sigDistOutset = sigDist + uStrokeOutsetWidth * 0.5;
    
                // Inset
                float sigDistInset = sigDist - uStrokeInsetWidth * 0.5;
    
                #ifdef IS_SMALL
                    float outset = smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDistOutset);
                    float inset = 1.0 - smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDistInset);
                #else
                    float outset = clamp(sigDistOutset / fwidth(sigDistOutset) + 0.5, 0.0, 1.0);
                    float inset = 1.0 - clamp(sigDistInset / fwidth(sigDistInset) + 0.5, 0.0, 1.0);
                #endif
    
                // Border
                float border = outset * inset;
    
                // Alpha Test
                if (alpha < uAlphaTest) discard;
    
                // Output: Common
                vec4 filledFragColor = vec4(uColor, uOpacity * alpha);
    
                // Output: Strokes
                vec4 strokedFragColor = vec4(uStrokeColor, uOpacity * border);
    
                float lineProgress = 0.3;
                float gr = texture2D(gradientMap, vUv).r;
                // gradient
                float grgr = fract(3.*gr + time/5.);
                float start = smoothstep(0.,0.01,grgr);
                float end = smoothstep(lineProgress,lineProgress -0.01,grgr);
                float mask = start*end;
                mask = max(0.2,mask);

                float fill = clamp(sigDist/fwidth(sigDist) + 0.5, 0.0, 1.0);

                // float finalAlpha = border*mask + fill

                // gl_FragColor = filledFragColor;
                gl_FragColor = vec4(vec3(grgr), 1.);
                // gl_FragColor = mix(filledFragColor, strokedFragColor, border);
            }
        `,
    });

    material.uniforms.uMap.value = atlas;
    // material.uniforms.uColor.value = new Color('0xfffff');
            // material.uniforms.uStrokeColor.value = new Color(config.settings.strokeColor);

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

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scena
const scene = new THREE.Scene()

const backgroundGeometry = new THREE.PlaneGeometry(5, 5, 1, 1)
const backgroundMaterial = new THREE.MeshBasicMaterial({color: 0x000000})
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
// scene.add(overlay)

// Camera

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.01, 20)
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
        
        // scene.add(mesh)

        
        
        mesh.position.y = - 0.5
        mesh.position.x = - 0.1
        // mesh.position.z = - 3

        mesh.rotation.z = 1
        mesh.rotation.x = 1.2
        mesh.rotation.y = - 0.2
        
        //camera.lookAt(mesh.position)
        //scene.add(camera)
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