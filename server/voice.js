import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.resolve();

// ✅ Ensure API keys exist before continuing
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Missing ANTHROPIC_API_KEY in .env file");
  process.exit(1);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("❌ Missing ELEVENLABS_API_KEY in .env file");
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 🎙️ Convert user audio → text → AI reply → ElevenLabs voice
export async function speechToSpeech(audioFilePath) {
  try {
    console.log(`🎧 Transcribing ${audioFilePath}...`);

    // --- 1️⃣ Transcribe user speech (placeholder for now) ---
    const userText = "Hello, how are you?"; // TODO: replace with real transcription
    console.log("🧠 Querying Claude...");

    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022", // ✅ Updated valid model
      max_tokens: 200,
      messages: [
        { role: "user", content: `Reply conversationally to: ${userText}` },
      ],
    });

    const replyText =
      claudeResponse?.content?.[0]?.text?.trim() ||
      "Sorry, I couldn’t generate a response.";

    console.log("💬 Claude reply:", replyText);

    // --- 2️⃣ ElevenLabs Text-to-Speech ---
    console.log("🎤 Generating voice using ElevenLabs...");

    const voiceId = "Rachel"; // You can replace with another ElevenLabs voice
    const outputDir = path.join(__dirname, "outputs");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = Date.now();
    const outputFile = path.join(outputDir, `response_${timestamp}.mp3`);

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: replyText,
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.7 },
        }),
      }
    );

    if (!elevenResponse.ok) {
      const errText = await elevenResponse.text();
      throw new Error(`ElevenLabs API failed: ${elevenResponse.status} - ${errText}`);
    }

    const buffer = Buffer.from(await elevenResponse.arrayBuffer());
    fs.writeFileSync(outputFile, buffer);

    console.log("✅ Audio saved at:", outputFile);
    return outputFile;

  } catch (error) {
    console.error("❌ Speech route error:", error);
    throw error;
  }
}
