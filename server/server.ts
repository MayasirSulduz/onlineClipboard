
import cors from "cors";
import dns from "node:dns";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import net from "node:net";
import { randomInt, randomUUID } from "node:crypto";
import os from "node:os";
import { Pool } from "pg";
import QRCode from "qrcode";
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
    net.setDefaultAutoSelectFamily(false);
}

dotenv.config();

const app = express();
const PORT = 5000;

type SaveType = "temporary" | "permanent";
type ContentType = "text" | "file";

interface MessageRequestBody {
    message?: unknown;
    type?: unknown;
    contentType?: unknown;
    fileUrl?: unknown;
    fileName?: unknown;
    fileSize?: unknown;
    fileKey?: unknown;
    mimeType?: unknown;
    clientOrigin?: unknown;
}

const getLocalNetworkIp = (): string => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "localhost";
};

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

// Cloudflare R2 Client Initialization
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;
const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

const s3Client = (r2AccountId && r2AccessKeyId && r2SecretAccessKey)
    ? new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
        },
    })
    : null;

console.log("Cloudflare R2 configured:", Boolean(s3Client && r2BucketName && r2PublicUrl));

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
                message TEXT,
                content_type VARCHAR(20) NOT NULL DEFAULT 'text',
                file_url TEXT,
                file_name VARCHAR(255),
                file_size BIGINT,
                file_key TEXT,
                mime_type VARCHAR(100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Migration columns for existing instances
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'text'");
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT");
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)");
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT");
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_key TEXT");
        await queryWithRetry("ALTER TABLE messages ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)");
        await queryWithRetry("ALTER TABLE messages ALTER COLUMN message DROP NOT NULL");

        console.log("messages table schema is ready.");
    } catch (error) {
        console.error("Error checking/creating messages table:", error);
    }
};

const cleanupExpiredMessages = async (): Promise<void> => {
    try {
        // Delete temporary files from Cloudflare R2
        const expiredFiles = await queryWithRetry(`
            SELECT file_key FROM messages
            WHERE type = 'temporary'
              AND content_type = 'file'
              AND file_key IS NOT NULL
              AND created_at < NOW() - INTERVAL '30 minutes'
        `);

        if (s3Client && r2BucketName && expiredFiles.rows && expiredFiles.rows.length > 0) {
            for (const row of expiredFiles.rows) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: r2BucketName,
                        Key: row.file_key,
                    }));
                    console.log(`[CLEANUP] Deleted file from R2: ${row.file_key}`);
                } catch (delErr) {
                    console.error(`[CLEANUP] Failed to delete R2 file: ${row.file_key}`, delErr);
                }
            }
        }

        // Delete temporary records from PostgreSQL
        const result = await queryWithRetry(`
            DELETE FROM messages
            WHERE type = 'temporary'
              AND created_at < NOW() - INTERVAL '30 minutes'
        `);
        if (result && typeof result.rowCount === "number" && result.rowCount > 0) {
            console.log(`[CLEANUP] Deleted ${result.rowCount} expired temporary message(s) older than 30 minutes.`);
        }
    } catch (error) {
        console.error("[CLEANUP] Error during message cleanup:", error);
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

// Endpoint: Generate Presigned Upload URL for direct R2 upload (supports up to 200MB)
app.post("/api/upload-url", async (req: Request, res: Response) => {
    try {
        if (!s3Client || !r2BucketName || !r2PublicUrl) {
            res.status(500).json({ success: false, error: "Cloudflare R2 is not configured on server" });
            return;
        }

        const { fileName, fileType, fileSize } = req.body;

        if (!fileName || typeof fileName !== "string") {
            res.status(400).json({ success: false, error: "fileName is required" });
            return;
        }

        const maxBytes = 200 * 1024 * 1024; // 200MB limit
        if (typeof fileSize === "number" && fileSize > maxBytes) {
            res.status(400).json({ success: false, error: "File exceeds 200MB limit" });
            return;
        }

        const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `uploads/${randomUUID()}-${sanitizedName}`;

        const command = new PutObjectCommand({
            Bucket: r2BucketName,
            Key: fileKey,
            ContentType: fileType || "application/octet-stream",
        });

        // URL expires in 15 minutes
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        const publicFileUrl = `${r2PublicUrl}/${fileKey}`;

        res.status(200).json({
            success: true,
            uploadUrl,
            fileKey,
            publicFileUrl,
        });
    } catch (error) {
        console.error("Failed to generate upload URL:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Failed to generate upload URL",
        });
    }
});

// Endpoint: Retrieve message/file by 7-digit code
app.get("/api/messages/:code", async (req: Request<{ code: string }>, res: Response) => {
    const { code } = req.params;

    try {
        if (!connectionString) {
            throw new Error("DATABASE_URL is not configured in .env file");
        }

        const result = await queryWithRetry(`
            SELECT id, code, type, message, content_type, file_url, file_name, file_size, file_key, mime_type, created_at
            FROM messages
            WHERE code = $1
            LIMIT 1
        `, [code]);

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

// Endpoint: Save message or file metadata to PostgreSQL
app.post(
    "/api/messages",
    async (req: Request<{}, {}, MessageRequestBody>, res: Response) => {
        const {
            message,
            type,
            contentType,
            fileUrl,
            fileName,
            fileSize,
            fileKey,
            mimeType,
        } = req.body;

        const resolvedContentType: ContentType = contentType === "file" ? "file" : "text";

        if (resolvedContentType === "text") {
            if (typeof message !== "string" || !message.trim()) {
                res.status(400).json({ success: false, error: "Message is required for text clips" });
                return;
            }
        } else if (resolvedContentType === "file") {
            if (!fileUrl || typeof fileUrl !== "string") {
                res.status(400).json({ success: false, error: "fileUrl is required for file clips" });
                return;
            }
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
            const code = await generateUniqueCode();
            const newId = randomUUID();
            const now = new Date();

            const finalMessage = typeof message === "string" ? message : null;
            const finalFileUrl = typeof fileUrl === "string" ? fileUrl : null;
            const finalFileName = typeof fileName === "string" ? fileName : null;
            const finalFileSize = typeof fileSize === "number" ? fileSize : null;
            const finalFileKey = typeof fileKey === "string" ? fileKey : null;
            const finalMimeType = typeof mimeType === "string" ? mimeType : null;

            await queryWithRetry(
                `
                    INSERT INTO messages (
                        id, code, type, message, content_type,
                        file_url, file_name, file_size, file_key, mime_type, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `,
                [
                    newId,
                    code,
                    saveType,
                    finalMessage,
                    resolvedContentType,
                    finalFileUrl,
                    finalFileName,
                    finalFileSize,
                    finalFileKey,
                    finalMimeType,
                    now,
                ]
            );

            console.log("Saved to DB successfully:", {
                id: newId,
                code,
                type: saveType,
                contentType: resolvedContentType,
                fileName: finalFileName,
            });

            const clientOrigin = typeof req.body.clientOrigin === "string" ? req.body.clientOrigin : "";
            const originHeader = clientOrigin || req.get("origin") || req.get("referer");
            const forwardedProto = req.get("x-forwarded-proto") || (req.secure ? "https" : "");
            const forwardedHost = req.get("x-forwarded-host") || req.get("host");

            let baseUrl = process.env.CLIENT_URL || "";
            if (!baseUrl) {
                if (originHeader) {
                    try {
                        const urlObj = new URL(originHeader);
                        if (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1") {
                            const localIp = getLocalNetworkIp();
                            if (localIp !== "localhost") {
                                urlObj.hostname = localIp;
                            }
                        }
                        baseUrl = urlObj.origin;
                    } catch {
                        baseUrl = originHeader.replace(/\/$/, "");
                    }
                } else if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
                    const proto = forwardedProto || "https";
                    baseUrl = `${proto}://${forwardedHost}`;
                } else {
                    const localIp = getLocalNetworkIp();
                    baseUrl = `http://${localIp}:5173`;
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
                message: "Saved successfully",
                code,
                shareUrl,
                qrCode,
            });
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
        await cleanupExpiredMessages();
        // Run cleanup every 1 minute (60,000 ms)
        setInterval(cleanupExpiredMessages, 60 * 1000);
    } catch (error) {
        console.error("Database setup failed:", error);
    }
};

startServer();

export default app;
