
import cors from "cors";
import express, { type Request, type Response } from "express";

const app = express();
const PORT = 5000;

type SaveType = "temporary" | "permanent";

interface MessageRequestBody {
    message?: unknown;
    type?: unknown;
}

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Online Clipboard backend is running!");
});

app.post(
    "/api/messages",
    (req: Request<{}, {}, MessageRequestBody>, res: Response) => {
        const { message, type } = req.body;

        if (typeof message !== "string" || !message.trim()) {
            res.status(400).json({ error: "Message is required" });
            return;
        }

        if (type !== "temporary" && type !== "permanent") {
            res.status(400).json({ error: "Save type must be temporary or permanent" });
            return;
        }

        const saveType: SaveType = type;
        console.log("Received message:", { message, type: saveType });

        res.status(200).json({
            success: true,
            message: "Message received",
        });
    }
);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
