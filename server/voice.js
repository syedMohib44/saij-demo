import Anthropic from "@anthropic-ai/sdk";
import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

// --- API Clients ---
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const XI_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

// === HTTP POST function for ElevenLabs TTS ===
async function generateSpeech(text) {
  console.log("...[Debug] Calling ElevenLabs HTTP TTS...");
  
  try {
    // Use the built-in 'fetch'
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": XI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    console.log("...[Debug] Got TTS response status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log("...[Debug] Got audio buffer from TTS.", arrayBuffer);
    return Buffer.from(arrayBuffer);
    
  } catch (e) {
      console.error("❌❌❌ ElevenLabs TTS Error ❌❌❌:", e);
      return null; // Return null to indicate failure
  }
}

export async function handleVoiceStream(clientWs) {
  
  let isResponding = false;

  async function triggerClaude(text) {
    if (isResponding) return;
    isResponding = true;
    
    console.log("🧠 Sending to Claude:", text);
    let fullResponse = ""; 

    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 250,
        messages: [{ role: "user", content: text }],
      });

      stream.on('text', (textChunk) => {
        console.log(textChunk); 
        fullResponse += textChunk; 
      });

      stream.on('end', async () => {
        console.log("...[Debug] Claude stream finished.");
        
        // 1. Generate speech
        const audioBuffer = await generateSpeech(fullResponse);

        // 2. Send the MP3 file if it was successful
        if (audioBuffer && clientWs.readyState === WebSocket.OPEN) {
          console.log("...[Debug] Sending audio buffer to client.");
          clientWs.send(audioBuffer);
        } else if (!audioBuffer) {
          console.error("...[Debug] Audio generation failed, not sending to client.");
        }
        
        isResponding = false;
      });

      stream.on('error', (e) => {
        console.error("❌ CLAUDE API ERROR:", e);
        isResponding = false;
      });
      
    } catch (e) {
      console.error("❌ CLAUDE SETUP ERROR:", e);
      isResponding = false;
    }
  }

  // === Main Client-Facing WebSocket Logic (Unchanged) ===
  clientWs.on("message", (message) => {
    try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'text' && parsed.data) {
            triggerClaude(parsed.data);
        }
    } catch (e) {
        console.error("Failed to parse client message:", message.toString(), e);
    }
  });

  clientWs.on("close", () => {
    console.log("Client connection closed.");
  });
}