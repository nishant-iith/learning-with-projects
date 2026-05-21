import express from "express";
import pg from "pg";

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;

// Database configuration from environment variables
const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "users_db",
});

app.get("/health", async (req, res) => {
  try {
    // Simple query to verify DB connection is active
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email FROM users");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app, server, pool };
