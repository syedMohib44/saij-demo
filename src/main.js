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
let audio, audioCtx, analyser, dataArray;

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

    // Find all skinned meshes with morph targets
    model.traverse((obj) => {
      if (
        obj.isSkinnedMesh &&
        obj.morphTargetDictionary &&
        obj.morphTargetInfluences
      ) {
        console.log(obj.name, obj.morphTargetDictionary);
        // Only include mouth/jaw related meshes
        if (
          obj.name.includes("Head") ||
          obj.name.includes("Teeth") ||
          obj.name.includes("Tongue")
        ) {
          mouthMeshes.push(obj);
        }
      }
    });
  },
  undefined,
  (err) => console.error(err)
);

// === Lipsync Function ===
async function startLipSync(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
  
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  
    await audioCtx.resume();
    source.start();
  
    // Optional: stop when buffer ends
    source.onended = () => console.log("Audio playback ended");
  }
  

// === Record + Backend Integration ===
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// 🎙️ Button UI
const recordBtn = document.createElement("button");
recordBtn.textContent = "🎙️ Start Recording";
recordBtn.style.position = "absolute";
recordBtn.style.top = "20px";
recordBtn.style.left = "20px";
recordBtn.style.padding = "10px 20px";
recordBtn.style.background = "#0a84ff";
recordBtn.style.color = "white";
recordBtn.style.border = "none";
recordBtn.style.borderRadius = "8px";
recordBtn.style.cursor = "pointer";
recordBtn.style.fontSize = "16px";
document.body.appendChild(recordBtn);

recordBtn.onclick = async () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
};

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, "input.webm");

    // 🔥 Send to backend
    const response = await fetch("http://localhost:8001/speech", {
      method: "POST",
      body: formData,
    });

    const audioBlob = await response.blob();
    await startLipSync(audioBlob);
  };

  mediaRecorder.start();
  recordBtn.textContent = "⏹ Stop Recording";
  isRecording = true;
}

function stopRecording() {
  mediaRecorder.stop();
  recordBtn.textContent = "🎙️ Start Recording";
  isRecording = false;
}

// === Animation Loop ===
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Analyze audio loudness → drive visemes
  if (analyser && mouthMeshes.length > 0) {
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const intensity = Math.min(avg / 150, 1); // Normalize 0–1

    // Apply intensity to mouth-related visemes
    mouthMeshes.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary;
      const inf = mesh.morphTargetInfluences;

      const openTargets = [
        "mouthOpen",
        "viseme_aa",
        "viseme_O",
        "viseme_U",
        "viseme_E",
        "viseme_I",
      ];
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

// === Handle Resize ===
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
