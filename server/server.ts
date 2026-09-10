
import cors from "cors";
import dns from "node:dns";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { Pool } from "pg";
import QRCode from "qrcode";

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
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
});

pool.on("error", (err) => {
    console.error("Unexpected error on idle database client:", err);
});

const queryWithRetry = async (text: string, params: any[] = [], retries = 4, delayMs = 500): Promise<any> => {
    let lastError: any;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            return await pool.query(text, params);
        } catch (error: any) {
            lastError = error;
            console.warn(`[DB Attempt ${attempt}/${retries}] Query failed (${error.code || error.message}). Retrying...`);
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            }
        }
    }
    throw lastError;
};

const testDatabaseConnection = async (): Promise<void> => {
    if (!connectionString) {
        throw new Error("DATABASE_URL is not configured in .env file");
    }

    const result = await queryWithRetry("SELECT 1 AS connected");
    console.log("Connected to Neon DB successfully:", result.rows[0]);
};

const ensureMessagesTable = async (): Promise<void> => {
    try {
        await queryWithRetry(`
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
    if (!connectionString) {
        throw new Error("DATABASE_URL is not configured in .env file");
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = createSevenDigitCode();

        console.log(`Checking DB for code: ${candidate} (attempt ${attempt + 1})`);
        const existing = await queryWithRetry("SELECT 1 FROM messages WHERE code = $1 LIMIT 1", [candidate]);

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
            throw new Error("DATABASE_URL is not configured in .env file");
        }

        const result = await queryWithRetry("SELECT id, code, type, message, created_at FROM messages WHERE code = $1 LIMIT 1", [code]);

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: "Message not found" });
            return;
        }

        res.status(200).json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Failed to retrieve message:", error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to retrieve message" });
    }
});

app.post(
    "/api/messages",
    async (req: Request<{}, {}, MessageRequestBody>, res: Response) => {
        const { message, type } = req.body;

        console.log("Received message from frontend:", { message, type });

        if (typeof message !== "string" || !message.trim()) {
            res.status(400).json({ success: false, error: "Message is required" });
            return;
        }

        if (type !== "temporary" && type !== "permanent") {
            res.status(400).json({ success: false, error: "Save type must be temporary or permanent" });
            return;
        }

        try {
            if (!connectionString) {
                throw new Error("DATABASE_URL is not configured in .env file");
            }

            const saveType: SaveType = type;
            console.log("Generating unique seven-digit code...");
            const code = await generateUniqueCode();

            console.log("Final code generated:", code);
            console.log("Saving message to DB...");

            const newId = randomUUID();
            const now = new Date();

            await queryWithRetry(
                `
                    INSERT INTO messages (id, code, type, message, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                `,
                [newId, code, saveType, message, now]
            );

            console.log("Saved to DB successfully:", { id: newId, code, type: saveType });

            const originHeader = req.get("origin") || req.get("referer");
            let baseUrl = "http://localhost:5173";
            if (originHeader) {
                try {
                    baseUrl = new URL(originHeader).origin;
                } catch {
                    baseUrl = originHeader.replace(/\/$/, "");
                }
            }
            const shareUrl = `${baseUrl}/?code=${code}`;

            const qrCode = await QRCode.toDataURL(shareUrl, {
                margin: 1,
                width: 250,
                color: {
                    dark: "#000000",
                    light: "#ffffff",
                },
            });

            res.status(200).json({
                success: true,
                message: "Message received",
                code,
                shareUrl,
                qrCode,
            });

            console.log("Sent code, shareUrl, and qrCode to frontend:", { code, shareUrl });
        } catch (error) {
            console.error("Failed to create share:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to save share";
            res.status(500).json({
                success: false,
                error: errorMessage,
            });
        }
    }
);

const startServer = async () => {
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

    try {
        await testDatabaseConnection();
        await ensureMessagesTable();
    } catch (error) {
        console.error("Database setup failed:", error);
    }
};

startServer();
