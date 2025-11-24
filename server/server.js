import express from "express";
import multer from "multer";
import { speechToSpeech } from "./voice.js";
import fs from "fs";
import { AvaturnHead } from "@avaturn-live/web-sdk";
import cors from "cors";

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(cors());

const PORT = 8001;

app.post("/speech", upload.single("audio"), async (req, res) => {
  try {
    const { buffer } = await speechToSpeech(req.file.path);
    fs.unlinkSync(req.file.path); // cleanup uploaded file

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });
    res.send(buffer); // send audio directly
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/create-session", async (req, res) => {
  try {
    console.log(" ===== ")
    const url = "https://api.avaturn.live/api/v1/sessions";

    const sessionBody = {
      avatar_id: "jane_20240829",
      conversation_engine: {
        type: "text-echo",
        tts: {
          engine: "elevenlabs",
          voice_id: "2EiwWnXFnvU5JabPnv8n",
        },
      },
      background: "default",
      model: "delta",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer UJxiGUQRNegFY7vSdhAgMtjPIWwZD4bLkZBl2f_4JsRsoSlP9liB6I-OnbPasIQIRNOYskBwapUrWFSA6KZ0PQ`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionBody),
    });

    const rawText = await response.text();
    console.log("📥 AVATURN RAW RESPONSE:", rawText);

    // Return error if not OK
    if (!response.ok) {
      return res.status(500).json({
        error: "Avaturn API error",
        message: rawText,
      });
    }

    // Parse only when valid JSON
    const data = JSON.parse(rawText);
    return res.json(data);

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message,
    });
  }
});


app.listen(PORT, () =>
  console.log(`🎧 Voice server running on http://localhost:${PORT}`)
);
