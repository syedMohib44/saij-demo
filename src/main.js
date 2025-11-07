import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 2, 3);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// === Variables ===
const loader = new GLTFLoader();
let mixer;
let mouthMeshes = [];
let morphTargets = {};
let audio, audioCtx, analyser, dataArray;

// === Load Avatar ===
loader.load('/avatar.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    scene.add(model);

    if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
    }

    // Find all skinned meshes with morph targets
    model.traverse((obj) => {
        if (obj.isSkinnedMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
            console.log(obj.name, obj.morphTargetDictionary);
            // Only include mouth/jaw related meshes
            if (obj.name.includes("Head") || obj.name.includes("Teeth") || obj.name.includes("Tongue")) {
                mouthMeshes.push(obj);
            }
        }
    });

    // Start lip sync
    startLipSync();
}, undefined, (err) => console.error(err));

// === Audio & Lipsync Setup ===
function startLipSync() {
    audio = new Audio('/speech.mp3');
    audio.crossOrigin = 'anonymous';
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);

    dataArray = new Uint8Array(analyser.frequencyBinCount);
    audio.play();
    audioCtx.resume();
}

// === Animation Loop ===
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    // Analyze audio loudness
    if (analyser && mouthMeshes.length > 0) {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const intensity = Math.min(avg / 150, 1); // Normalize

        // Apply intensity to mouth-related visemes
        mouthMeshes.forEach((mesh) => {
            const dict = mesh.morphTargetDictionary;
            const inf = mesh.morphTargetInfluences;

            // Focus on visemes for open-mouth sounds
            const openTargets = ['mouthOpen', 'viseme_aa', 'viseme_O', 'viseme_U', 'viseme_E', 'viseme_I'];
            openTargets.forEach((name) => {
                if (dict[name] !== undefined) {
                    inf[dict[name]] = intensity;
                }
            });
        });
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
