
import cors from "cors";
import dns from "node:dns";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { Pool } from "pg";

dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const app = express();
const PORT = 5000;

type SaveType = "temporary" | "permanent";

interface MessageRequestBody {
    message?: unknown;
    type?: unknown;
}

const createSevenDigitCode = (): string => randomInt(0, 10_000_000).toString().padStart(7, "0");

const connectionString = process.env.DATABASE_URL;

console.log("Database URL configured:", Boolean(connectionString));

const pool = new Pool({
    connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : undefined,
});

const testDatabaseConnection = async (): Promise<void> => {
    if (!connectionString) {
        throw new Error("DATABASE_URL is not configured");
    }

    const result = await pool.query("SELECT 1 AS connected");
    console.log("Connected to Neon DB successfully:", result.rows[0]);
};

const ensureMessagesTable = async (): Promise<void> => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code VARCHAR(7) NOT NULL UNIQUE,
                type VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log("messages table is ready.");
    } catch (error) {
        console.error("Error checking/creating messages table:", error);
    }
};

const generateUniqueCode = async (maxAttempts = 10): Promise<string> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = createSevenDigitCode();

        if (!connectionString) {
            throw new Error("DATABASE_URL is not configured");
        }

        console.log(`Checking DB for code: ${candidate}`);
        const existing = await pool.query("SELECT 1 FROM messages WHERE code = $1 LIMIT 1", [candidate]);

        if (existing.rowCount === 0) {
            console.log(`Code available, proceeding with: ${candidate}`);
            return candidate;
        }

        console.log(`Code ${candidate} already in use, generating another one...`);
    }

    throw new Error("Failed to generate a unique code after multiple attempts");
};

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Online Clipboard backend is running!");
});

app.get("/api/messages/:code", async (req: Request<{ code: string }>, res: Response) => {
    const { code } = req.params;

    try {
        if (!connectionString) {
            throw new Error("DATABASE_URL is not configured");
        }

        const result = await pool.query("SELECT id, code, type, message, created_at FROM messages WHERE code = $1 LIMIT 1", [code]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: "Message not found" });
            return;
        }

        res.status(200).json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Failed to retrieve message:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to retrieve message" });
    }
});

app.post(
    "/api/messages",
    async (req: Request<{}, {}, MessageRequestBody>, res: Response) => {
        const { message, type } = req.body;

        console.log("Received message from frontend:", { message, type });

        if (typeof message !== "string" || !message.trim()) {
            res.status(400).json({ error: "Message is required" });
            return;
        }

        if (type !== "temporary" && type !== "permanent") {
            res.status(400).json({ error: "Save type must be temporary or permanent" });
            return;
        }

        try {
            if (!connectionString) {
                throw new Error("DATABASE_URL is not configured in .env");
            }

            const saveType: SaveType = type;
            console.log("Generating unique seven-digit code...");
            const code = await generateUniqueCode();

            console.log("Final code generated:", code);
            console.log("Saving message to DB...");

            const newId = randomUUID();
            const now = new Date();

            await pool.query(
                `
                    INSERT INTO messages (id, code, type, message, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                `,
                [newId, code, saveType, message, now]
            );

            console.log("Saved to DB successfully:", { id: newId, code, type: saveType });

            res.status(200).json({
                success: true,
                message: "Message received",
                code,
            });

            console.log("Sent code to frontend:", code);
        } catch (error) {
            console.error("Failed to create share:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to save share";
            res.status(500).json({
                error: errorMessage,
            });
        }
    }
);

const startServer = async () => {
    try {
        await testDatabaseConnection();
        await ensureMessagesTable();
    } catch (error) {
        console.error("Database setup failed:", error);
    }

    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

    server.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
            console.error(`ERROR: Port ${PORT} is already in use!`);
            console.error(`Another process is running on port ${PORT}. Please stop it so server.ts can listen.`);
        } else {
            console.error("Server error:", error);
        }
    });
};

startServer();
