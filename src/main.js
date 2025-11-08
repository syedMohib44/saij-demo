import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// === Scene Setup (Unchanged) ===
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

// --- NEW: Add a Start Button ---
const startButton = document.createElement('button');
startButton.textContent = 'Start Session';
startButton.style.position = 'absolute';
startButton.style.zIndex = '10';
startButton.style.top = '20px';
startButton.style.left = '20px';
startButton.style.padding = '12px 20px';
startButton.style.fontSize = '16px';
document.body.appendChild(startButton);
// --- End Start Button ---

// === Variables ===
const loader = new GLTFLoader();
let mixer;
let mouthMeshes = [];
let audioCtx; // Will be created on click
let analyser, dataArray;
let recognition;
let isBotSpeaking = false;
let currentBlobUrl = null; 

// === Load Avatar (Unchanged) ===
loader.load("/avatar.glb", (gltf) => {
    // ... (same as before) ...
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    scene.add(model);
    if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]).play();
    }
    model.traverse((obj) => {
        if (obj.isSkinnedMesh && obj.morphTargetDictionary && obj.morphTargetInfluences &&
            (obj.name.includes("Head") || obj.name.includes("Teeth") || obj.name.includes("Tongue"))) {
            mouthMeshes.push(obj);
        }
    });
}, undefined, (err) => console.error(err));

// === WebSocket Setup ===
const socket = new WebSocket('ws://localhost:8001');
socket.binaryType = "arraybuffer"; 

socket.onopen = () => {
    console.log("WebSocket connection established.");
    // DO NOT start listening yet. Wait for user click.
};
socket.onclose = () => console.log("WebSocket connection closed.");
socket.onerror = (err) => console.error("WebSocket error:", err);

// === Audio Player Setup ===
const audioPlayer = new Audio();

audioPlayer.onended = () => {
    console.log("Bot finished speaking.");
    isBotSpeaking = false;
    if (recognition) {
        console.log("Restarting recognition...");
        try { recognition.start(); } catch(e) {}
    }
};

// === Handle Incoming Messages (Unchanged) ===
socket.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
        console.log("...[Debug] Received audio buffer from server.");
        
        isBotSpeaking = true;
        if (recognition) {
            console.log("Bot started speaking, stopping recognition.");
            recognition.stop(); 
        }

        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
        }

        const blob = new Blob([event.data], { type: 'audio/mpeg' });
        currentBlobUrl = URL.createObjectURL(blob);
        audioPlayer.src = currentBlobUrl;
        
        audioPlayer.play().catch(e => {
            console.warn("Play interrupted or failed:", e);
            // This is the race condition fix, it's correct.
            isBotSpeaking = false;
        });
        
    } else {
        console.warn("Received unexpected text message:", event.data);
    }
};

// === Browser Speech-to-Text Loop (Unchanged) ===
function startBrowserSTT() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        // ... (error handling)
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        // ... (same as before)
        const text = event.results[0][0].transcript;
        console.log("🎙️ You said:", text);
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'text', data: text }));
        }
    };

    recognition.onerror = (event) => {
        // ... (same as before)
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
             console.error("Speech recognition error:", event.error);
        }
    };

    recognition.onend = () => {
        // ... (same as before)
        console.log("Recognition ended.");
        if (!isBotSpeaking) {
            console.log("Restarting recognition (onend)...");
            try { recognition.start(); } catch (e) {}
        }
    };

    try { recognition.start(); } catch(e) {}
}

// === LipSync Analyser Setup (Unchanged) ===
function setupLipSyncAnalyser() {
    if (audioCtx) return; 
    
    // This is the key: Create AudioContext on user gesture
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyserSource = audioCtx.createMediaElementSource(audioPlayer);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    analyserSource.connect(analyser);
    analyser.connect(audioCtx.destination);
}

// --- NEW: Start function on button click ---
startButton.onclick = () => {
    console.log("User clicked start. Unlocking audio...");
    
    // 1. Setup and unlock the AudioContext and Analyser
    setupLipSyncAnalyser();

    // 2. Start the microphone
    startBrowserSTT();

    // 3. Hide the button
    startButton.style.display = 'none';
};
// --- End Start function ---

// === Animation Loop (Unchanged) ===
const clock = new THREE.Clock();
// ... (rest of animation code is identical) ...
let smoothedVolume = 0;
const smoothingFactor = 0.1;
const silenceThreshold = 0.02;
const minSpeechFrames = 3;
let speechCounter = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (analyser && mouthMeshes.length > 0) {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] / 128) - 1;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        smoothedVolume = smoothedVolume * (1 - smoothingFactor) + rms * smoothingFactor;

        if (smoothedVolume > silenceThreshold) { speechCounter++; } 
        else { speechCounter = 0; }

        const isSpeaking = speechCounter >= minSpeechFrames;
        const intensity = isSpeaking ? Math.min(smoothedVolume * 5, 1) : 0;

        mouthMeshes.forEach((mesh) => {
            const dict = mesh.morphTargetDictionary;
            const inf = mesh.morphTargetInfluences;
            ["mouthOpen", "viseme_aa", "viseme_O", "viseme_U", "viseme_E", "viseme_I"].forEach((name) => {
                if (dict[name] !== undefined) inf[dict[name]] = intensity;
            });
        });
    }
    controls.update();
    renderer.render(scene, camera);
}
animate();

// === Window Resize (Unchanged) ===
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});