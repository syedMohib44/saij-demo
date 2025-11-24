import { useRef, useState } from "react";
import { AvaturnHead } from "@avaturn-live/web-sdk";
import { getGlobalAvatar, setGlobalAvatar } from "./avatar";

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  // Create session once
  async function createSession(): Promise<string> {
    try {
      const response = await fetch("http://localhost:8001/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      console.log("SESSION CREATED:", data);
      return data.token || data.session_token;
    } catch (err: any) {
      console.error("Failed to create session:", err);
      throw new Error(err?.message || "Failed to create session");
    }
  }

  async function startAvatar() {
    if (!containerRef.current) return;
    if (getGlobalAvatar()) {
      console.log("Avatar already initialized");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await createSession();

      // Request microphone permission first
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error("Microphone access denied");
      }

      const avatarInstance = new AvaturnHead(containerRef.current, {
        apiHost: "https://api.avaturn.live",
        sessionToken: token,
        audioSource: true,
        preloadBundle: true,
        preconnect: false,
        keepAlive: true,
        immediatelyJoin: true,
      });

      await avatarInstance.init();

      // Enable sending local mic
      // avatarInstance.toggleLocalAudio(true);

      setGlobalAvatar(avatarInstance);
      setStarted(true);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start avatar");
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Avaturn Head (React + TS)</h2>
      {loading && <p>Loading avatar...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!started && (
        <button onClick={startAvatar} style={{ marginBottom: "10px" }}>
          Start Avatar
        </button>
      )}
      <div
        ref={containerRef}
        style={{
          width: "500px",
          height: "500px",
          background: "#000",
        }}
      ></div>
    </div>
  );
}

export default App;
