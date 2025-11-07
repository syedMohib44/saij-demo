import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
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
let audioCtx;
let analyser, dataArray;
let currentSource = null;
let isListening = false;

// === Load Avatar ===
loader.load(
    "/avatar.glb",
    (gltf) => {
        const model = gltf.scene;
        model.scale.set(1, 1, 1);
        scene.add(model);

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
        }

        // Only keep mouth/jaw related meshes for lipsync
        model.traverse((obj) => {
            if (
                obj.isSkinnedMesh &&
                obj.morphTargetDictionary &&
                obj.morphTargetInfluences &&
                (obj.name.includes("Head") ||
                    obj.name.includes("Teeth") ||
                    obj.name.includes("Tongue"))
            ) {
                mouthMeshes.push(obj);
            }
        });
    },
    undefined,
    (err) => console.error(err)
);

// === Lipsync Playback ===
async function startLipSync(audioBlob) {
    if (currentSource) currentSource.stop(); // stop if interrupted

    const arrayBuffer = await audioBlob.arrayBuffer();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start();
    currentSource = source;

    source.onended = () => {
        currentSource = null; // ready for next listening chunk
    };
}

// === Continuous Listening Loop ===
// === Continuous Listening Loop ===
async function startListening() {
    if (isListening) return;
    isListening = true;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = tempCtx.createMediaStreamSource(stream);
    const tempAnalyser = tempCtx.createAnalyser();
    tempAnalyser.fftSize = 1024;
    src.connect(tempAnalyser);
    const vadData = new Uint8Array(tempAnalyser.frequencyBinCount);

    // --- VAD State Variables ---
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let isProcessing = false; // <-- ✅ NEW STATE VARIABLE
    let silenceTimer = null;

    // --- VAD Tunable Parameters ---
    const SPEECH_THRESHOLD = 30;
    const SILENCE_DELAY = 1500;
    const VAD_INTERVAL = 100;

    // --- Main VAD Loop ---
    setInterval(() => {
        // Don't check for new speech if we are still processing the last one
        if (isProcessing) return; // <-- ✅ ADDED CHECK

        tempAnalyser.getByteFrequencyData(vadData);
        const volume = vadData.reduce((a, b) => a + b) / vadData.length;

        // console.log("Current Volume:", volume);

        if (volume > SPEECH_THRESHOLD) {
            // --- SPEECH DETECTED ---
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }

            // Only start if we are not already recording AND not processing
            if (!isRecording && !isProcessing) { // <-- ✅ UPDATED CHECK
                console.log("Speech detected, starting recording...");
                isRecording = true;
                audioChunks = [];

                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

                // --- 💡 MODIFIED ONSTOP HANDLER ---
                mediaRecorder.onstop = async () => {
                    console.log("Recording stopped, processing...");

                    // ✅ SET STATES IMMEDIATELY
                    isRecording = false;
                    isProcessing = true;

                    const blob = new Blob(audioChunks, { type: "audio/webm" });

                    if (blob.size < 2000) {
                        console.log("Ignoring tiny audio blob.");
                        isProcessing = false; // <-- ✅ Reset processing lock
                        return;
                    }

                    try {
                        const formData = new FormData();
                        formData.append("audio", blob, "input.webm");

                        const response = await fetch("http://localhost:8001/speech", {
                            method: "POST",
                            body: formData,
                        });

                        const audioBlob = await response.blob();
                        await startLipSync(audioBlob);
                    } catch (err) {
                        console.error("❌ STS Error:", err);
                    } finally {
                        // ✅ Reset processing lock *after* everything is done
                        isProcessing = false;
                        console.log("Processing finished. Ready to listen.");
                    }
                };
                mediaRecorder.start();
            }
        } else if (isRecording) {
            // --- SILENCE DETECTED (while recording) ---
            if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                    console.log("Silence detected, stopping recording.");
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop(); // This will trigger onstop
                    }
                    silenceTimer = null;
                }, SILENCE_DELAY);
            }
        }
    }, VAD_INTERVAL);

    // --- Interrupt playback (This part is fine) ---
    setInterval(() => {
        if (isProcessing) return; // Don't interrupt if we are about to speak
        tempAnalyser.getByteFrequencyData(vadData);
        const volume = vadData.reduce((a, b) => a + b) / vadData.length;
        if (volume > 20 && currentSource) {
            console.log("User interrupt detected.");
            currentSource.stop();
            currentSource = null;
        }
    }, 100);
}
// === Animation Loop ===
const clock = new THREE.Clock();

let smoothedVolume = 0;
const smoothingFactor = 0.1; // slower smoothing for stability
const silenceThreshold = 0.02; // volume threshold for ignoring noise
const minSpeechFrames = 3; // must exceed threshold for at least 3 frames
let speechCounter = 0;

// === Animate Loop with VAD ===
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (analyser && mouthMeshes.length > 0) {
        analyser.getByteTimeDomainData(dataArray);

        // Compute RMS
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] / 128) - 1;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        // Smooth RMS
        smoothedVolume = smoothedVolume * (1 - smoothingFactor) + rms * smoothingFactor;

        // VAD: only consider speech if volume above threshold for min frames
        if (smoothedVolume > silenceThreshold) {
            speechCounter++;
        } else {
            speechCounter = 0;
        }

        const isSpeaking = speechCounter >= minSpeechFrames;
        const intensity = isSpeaking ? Math.min(smoothedVolume * 5, 1) : 0;

        // Update morph targets
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

// === Window Resize ===
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the continuous listen/respond loop
startListening();
