import express from "express";
import multer from "multer";
import { speechToSpeech } from "./voice.js";
import path from "path";

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 8001;

app.post("/speech", upload.single("audio"), async (req, res) => {
  try {
    const outputPath = await speechToSpeech(req.file.path);
    res.sendFile(path.resolve(outputPath)); // send back mp3
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`🎧 Voice server running on http://localhost:${PORT}`)
);