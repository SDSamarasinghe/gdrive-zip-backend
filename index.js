require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const archiver = require("archiver");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5004;

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Define allowed origins
const allowedOrigins = [
  "http://localhost:5173", // Local development
  "https://gdrive-zip-frontend.netlify.app", // Production frontend
];

// Configure CORS dynamically
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true, // Allow cookies if needed
  })
);

app.use(express.json());

app.post("/download-zip", async (req, res) => {
  console.log("Received request:", req.body.urls);

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
    res.download(zipPath, "files.zip", (err) => {
      if (err) {
        console.error("Error sending ZIP file:", err.message);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  archive.on("error", (err) => {
    console.error("Error creating ZIP archive:", err.message);
    res.status(500).send({ error: "Failed to create ZIP archive" });
  });

  archive.pipe(output);

  let allFailed = true;

  for (const [i, url] of urls.entries()) {
    try {
      const finalUrl = await resolveRedirect(url);

      const response = await axios.get(finalUrl, {
        responseType: "arraybuffer",
      });

      let fileName = `file${i + 1}`;
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+?)"/);
        if (match) {
          fileName = match[1];
        }
      } else {
        const urlPath = new URL(finalUrl).pathname;
        fileName = path.basename(urlPath);
      }

      const fileExtension = path.extname(fileName);
      if (!fileExtension || fileExtension === ".bin") {
        fileName = `${path.basename(fileName, fileExtension)}.pdf`;
      }

      console.log(`Adding file to archive: ${fileName}`);
      archive.append(response.data, { name: fileName });
      allFailed = false;
    } catch (err) {
      console.error(`Error downloading file from URL: ${url}`, err.message);
    }
  }

  if (allFailed) {
    return res.status(500).json({ error: "Failed to download all files" });
  }

  archive.finalize();
});

async function resolveRedirect(redirectUrl) {
  try {
    const response = await axios.get(redirectUrl, { maxRedirects: 0 });
    return redirectUrl;
  } catch (err) {
    if (err.response?.headers?.location) {
      return err.response.headers.location;
    }
    return redirectUrl;
  }
}

app
  .listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  })
  .on("error", (err) => {
    console.error("Error starting server:", err.message);
  });
