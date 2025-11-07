import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
const app = express();

app.use(cors());
const upload = multer({ dest: "uploads/" });

app.post("/speech", upload.single("audio"), async (req, res) => {
  const filePath = req.file.path;
  const outputPath = path.join("outputs", `${Date.now()}.webm`);
  fs.renameSync(filePath, outputPath);

  console.log("Received voice:", outputPath);

  // Just send the same audio back to client
  res.sendFile(path.resolve(outputPath));
});

app.listen(8001, () => console.log("🎧 Voice echo server running on port 8001"));
