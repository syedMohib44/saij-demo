import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.set(0, 1.6, 3); // Default camera position

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === Lighting ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 2, 3);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// === Variables ===
const loader = new GLTFLoader();
let avatar, mixer;
let mouthMeshes = [];
let audioCtx;
let analyser, dataArray;
let currentSource = null;
let isListening = false;

// === Camera Zoom Variables ===
const normalCamPos = new THREE.Vector3(0, 1.6, 3);
const closeCamPos = new THREE.Vector3(0, 1.6, 1.8);
let isCloseUp = false;
let camLerpProgress = 0;

// === Load Avatar ===
loader.load(
    "/avatar.glb",
    (gltf) => {
        avatar = gltf.scene;
        avatar.scale.set(1, 1, 1);
        avatar.position.set(0, 0, 1);
        avatar.rotation.y += 0.5; // 180 degrees
        avatar.rotation.x += 0.2; // 180 degrees


        scene.add(avatar);

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(avatar);
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
        }

        avatar.traverse((obj) => {
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

// === Minimal Camera Drag Control ===
let isDragging = false;
let prevX = 0,
    prevY = 0;
let targetRotX = 0,
    targetRotY = 0;
let currentRotX = 0,
    currentRotY = 0;

function onMouseDown(e) {
    isDragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
}

function onMouseUp() {
    isDragging = false;
}

function onMouseMove(e) {
    if (!isDragging) return;
    const deltaX = e.clientX - prevX;
    const deltaY = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;

    // Small camera motion
    targetRotY += deltaX * 0.002;
    targetRotX += deltaY * 0.001;

    // Clamp movement (very subtle)
    targetRotX = Math.max(-0.1, Math.min(0.1, targetRotX));
    targetRotY = Math.max(-0.2, Math.min(0.2, targetRotY));
}

window.addEventListener("mousedown", onMouseDown);
window.addEventListener("mouseup", onMouseUp);
window.addEventListener("mousemove", onMouseMove);

// === Lipsync Playback ===
async function startLipSync(audioBlob) {
    if (currentSource) currentSource.stop();

    const arrayBuffer = await audioBlob.arrayBuffer();
    audioCtx =
        audioCtx ||
        new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: "interactive",
        });
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

    // === Camera Zoom In ===
    isCloseUp = true;
    camLerpProgress = 0;

    source.onended = () => {
        currentSource = null;
        // === Zoom Out After Voice Ends ===
        isCloseUp = false;
        camLerpProgress = 0;
    };
}

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

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let isProcessing = false;
    let silenceTimer = null;

    const SPEECH_THRESHOLD = 30;
    const SILENCE_DELAY = 1500;
    const VAD_INTERVAL = 100;

    setInterval(() => {
        if (isProcessing) return;

        tempAnalyser.getByteFrequencyData(vadData);
        const volume = vadData.reduce((a, b) => a + b) / vadData.length;

        if (volume > SPEECH_THRESHOLD) {
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }

            if (!isRecording && !isProcessing) {
                console.log("Speech detected, starting recording...");
                isRecording = true;
                audioChunks = [];

                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

                mediaRecorder.onstop = async () => {
                    console.log("Recording stopped, processing...");
                    isRecording = false;
                    isProcessing = true;

                    const blob = new Blob(audioChunks, { type: "audio/webm" });

                    if (blob.size < 2000) {
                        console.log("Ignoring tiny audio blob.");
                        isProcessing = false;
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
                        isProcessing = false;
                        console.log("Processing finished. Ready to listen.");
                    }
                };
                mediaRecorder.start();
            }
        } else if (isRecording) {
            if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                    console.log("Silence detected, stopping recording.");
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                    silenceTimer = null;
                }, SILENCE_DELAY);
            }
        }
    }, VAD_INTERVAL);
}

// === Animation Loop ===
const clock = new THREE.Clock();

let smoothedVolume = 0;
const smoothingFactor = 0.1;
const silenceThreshold = 0.02;
const minSpeechFrames = 3;
let speechCounter = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    // Smooth camera rotation
    currentRotX += (targetRotX - currentRotX) * 0.1;
    currentRotY += (targetRotY - currentRotY) * 0.1;

    // === Camera Zoom Interpolation ===
    camLerpProgress = Math.min(camLerpProgress + delta * 1.5, 1);
    const from = isCloseUp ? normalCamPos : closeCamPos;
    const to = isCloseUp ? closeCamPos : normalCamPos;
    const smoothPos = new THREE.Vector3().lerpVectors(from, to, camLerpProgress);

    const camX = Math.sin(currentRotY) * smoothPos.z;
    const camZ = Math.cos(currentRotY) * smoothPos.z;
    const camY = smoothPos.y + currentRotX * 2;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(0, 1.7, 0);

    if (analyser && mouthMeshes.length > 0) {
        analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = dataArray[i] / 128 - 1;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        smoothedVolume =
            smoothedVolume * (1 - smoothingFactor) + rms * smoothingFactor;

        if (smoothedVolume > silenceThreshold) {
            speechCounter++;
        } else {
            speechCounter = 0;
        }

        const isSpeaking = speechCounter >= minSpeechFrames;
        const intensity = isSpeaking ? Math.min(smoothedVolume * 5, 1) : 0;
        // console.log('Intensity', Math.min(intensity, 0.7))

        mouthMeshes.forEach((mesh) => {
            const dict = mesh.morphTargetDictionary;
            const inf = mesh.morphTargetInfluences;
            ["mouthOpen", "viseme_aa", "viseme_O", "viseme_U", "viseme_E", "viseme_I"].forEach(
                (name) => {
                    if (dict[name] !== undefined) inf[dict[name]] = intensity;
                }
            );
        });
    }

    renderer.render(scene, camera);
}

animate();

// === Window Resize ===
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Start Listening ===
startListening();
