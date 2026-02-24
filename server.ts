import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = 3000;
const db = new Database("harmonize.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS shared_playlists (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    tracks TEXT, -- JSON string of tracks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Spotify OAuth Endpoints
app.get("/api/auth/spotify/url", (req, res) => {
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const app_url = process.env.APP_URL || `http://localhost:${PORT}`;
  const redirect_uri = `${app_url}/auth/callback`;
  const scope = "playlist-read-private playlist-read-collaborative user-library-read";
  
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client_id || "",
    scope: scope,
    redirect_uri: redirect_uri,
  });

  res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
});

app.post("/api/auth/spotify/callback", async (req, res) => {
  const { code } = req.body;
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  const app_url = process.env.APP_URL || `http://localhost:${PORT}`;
  const redirect_uri = `${app_url}/auth/callback`;

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"),
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to exchange code for token" });
  }
});

// Playlist Sharing
app.post("/api/playlists/share", (req, res) => {
  const { name, description, tracks } = req.body;
  const id = Math.random().toString(36).substring(2, 15);
  
  const stmt = db.prepare("INSERT INTO shared_playlists (id, name, description, tracks) VALUES (?, ?, ?, ?)");
  stmt.run(id, name, description, JSON.stringify(tracks));
  
  res.json({ id });
});

app.get("/api/playlists/:id", (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare("SELECT * FROM shared_playlists WHERE id = ?");
  const playlist = stmt.get(id);
  
  if (playlist) {
    // @ts-ignore
    playlist.tracks = JSON.parse(playlist.tracks);
    res.json(playlist);
  } else {
    res.status(404).json({ error: "Playlist not found" });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
