import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.resolve();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// === Helper: Transcribe audio via ElevenLabs ===
async function transcribeAudio(audioFilePath) {
  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioFilePath);
  formData.append("file", audioBuffer, { filename: "input.wav" });
  formData.append("model_id", "scribe_v1"); // ✅ Fixed model ID

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs STT failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.text;
}

// === Helper: Query Claude ===
async function queryClaude(userText) {
  console.log("🧠 Sending to Claude...");

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 250,
    system: `
You are a helpful assistant.
IMPORTANT: Respond using plain text only.
Do NOT use any markdown, *, #, _, ~, or other formatting characters.
Do not add bullet points or numbering symbols.
Do not use emojis or special characters.
Keep the text clean and easy to read.
    `,
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  });

  const reply =
    completion?.content?.[0]?.text?.trim() ||
    "Sorry, I couldn’t come up with a reply.";
  console.log("💬 Claude reply:", reply);
  return text.replace(/[*_~`#\-]/g, "").replace(/\n+/g, " ").trim();
}

// === Helper: Generate speech buffer via ElevenLabs (Memory-Only) ===
async function generateSpeechBuffer(text) {
  console.log("🎤 Generating speech via ElevenLabs...");

  const voiceId = "JBFqnCBsd6RMkjVDRZzb"; // change voice if desired

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// === 🎙️ Main Speech-to-Speech Function (Optimized) ===
export async function speechToSpeech(audioFilePath, saveToFile = true) {
  try {
    // 1️⃣ Transcribe user audio
    const userText = await transcribeAudio(audioFilePath);

    // 2️⃣ Generate Claude response
    const aiReply = await queryClaude(userText);

    // 3️⃣ Generate speech buffer for AI reply
    const speechBuffer = await generateSpeechBuffer(aiReply);

    if (saveToFile) {
      // Optional: Save buffer to file
      const outputDir = path.join(__dirname, "outputs");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const timestamp = Date.now();
      const outputFile = path.join(outputDir, `response_${timestamp}.mp3`);
      fs.writeFileSync(outputFile, speechBuffer);
      console.log("✅ Voice file saved:", outputFile);
      return outputFile;
    } else {
      // Return buffer directly for streaming to client
      return speechBuffer;
    }
  } catch (err) {
    console.error("❌ STS Error:", err);
    throw err;
  }
}
