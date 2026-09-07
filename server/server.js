
import express from "express";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = 5000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

app.get("/", (req, res) => {
    res.send("Online Clipboard backend is running!");
});

app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Database connection error:", error);
        res.status(500).json({
            error: "Database connection failed",
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
