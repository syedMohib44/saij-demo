import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// === Transcribe audio via ElevenLabs ===
async function transcribeAudio(audioFilePath) {
  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioFilePath);
  formData.append("file", audioBuffer, { filename: "input.wav" });
  formData.append("model_id", "scribe_v1");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`STT failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.text;
}

// === Query Claude ===
async function queryClaude(userText) {
  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 250,
    messages: [
      {
        role: "user",
        content: `Reply conversationally to: ${userText}. Please avoid *, #, and any special characters.`,
      },
    ],
  });

  return (
    completion?.content?.[0]?.text?.trim() ||
    "Sorry, I couldn’t come up with a reply."
  );
}

// === Generate speech buffer via ElevenLabs ===
async function generateSpeechBuffer(text) {
  const voiceId = "jJ7bugNb8349LQJVSlb0";

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
    throw new Error(`TTS failed: ${response.status} - ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// === Main: In-memory Speech-to-Speech ===
export async function speechToSpeech(audioFilePath) {
  // 1️⃣ Transcribe user audio
  const userText = await transcribeAudio(audioFilePath);

  // 2️⃣ Query Claude
  const aiReply = await queryClaude(userText);

  // 3️⃣ Generate ElevenLabs TTS audio buffer
  const speechBuffer = await generateSpeechBuffer(aiReply);

  // 4️⃣ Return in-memory buffer
  return { buffer: speechBuffer, aiReply };
}
