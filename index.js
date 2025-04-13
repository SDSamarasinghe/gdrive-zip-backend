const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const archiver = require("archiver");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.post("/download-zip", async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const zipPath = path.join(tempDir, "output.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  output.on("close", () => {
    res.download(zipPath, "files.zip", () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  archive.on("error", (err) => res.status(500).send({ error: err.message }));
  archive.pipe(output);

  for (const [i, url] of urls.entries()) {
    try {
      const finalUrl = await resolveRedirect(url);
      const response = await axios.get(finalUrl, {
        responseType: "arraybuffer",
      });
      archive.append(response.data, { name: `file${i + 1}` });
    } catch (err) {
      console.error("Error downloading:", url, err.message);
    }
  }

  archive.finalize();
});

function resolveRedirect(redirectUrl) {
  return new Promise((resolve, reject) => {
    axios.get(redirectUrl, { maxRedirects: 0 }).catch((err) => {
      if (err.response?.headers?.location) {
        resolve(err.response.headers.location);
      } else {
        reject("No redirect found");
      }
    });
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
