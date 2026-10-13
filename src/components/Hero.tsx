import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent, type DragEvent } from "react";
import QRCodeDisplay from "./QRCodeDisplay";
import { ToastContainer, useToast } from "./Toast";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml"; // covers html
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/atom-one-dark.css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);

type SaveType = "temporary" | "permanent";
type ShareStep = "typing" | "choice" | "success";
type ContentType = "text" | "file";

interface FileEntry {
    fileUrl: string;
    fileName: string;
    fileSize: number;
    fileKey: string;
    mimeType: string;
}

const getApiBaseUrl = (): string => {
    if (typeof window !== "undefined") {
        const { hostname, protocol } = window.location;
        if (protocol === "https:" || (hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.startsWith("192.168.") && !hostname.startsWith("10."))) {
            return "";
        }
        return `http://${hostname}:5000`;
    }
    return "";
};

const formatFileSize = (bytes?: number | null): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (name: string): string => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")) return "🖼️";
    if (["pdf"].includes(ext || "")) return "📕";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext || "")) return "📦";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext || "")) return "🎵";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext || "")) return "🎬";
    if (["doc", "docx", "txt", "md"].includes(ext || "")) return "📄";
    if (["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "go", "rs", "css", "html", "json", "xml"].includes(ext || "")) return "💻";
    return "📁";
};

/** Detect if text looks like code by checking for code-like patterns */
const detectIsCode = (text: string): boolean => {
    if (!text || text.length < 10) return false;
    const codePatterns = [
        /^(import|export|const|let|var|function|class|if|for|while|return|def|async|await)\s/m,
        /[{}\[\]();].*\n.*[{}\[\]();]/s,
        /^\s{2,}|\t/m,
        /\/\/.*|\/\*[\s\S]*?\*\/|#.*$/m,
        /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i,
        /=>/,
    ];
    const matches = codePatterns.filter((p) => p.test(text)).length;
    return matches >= 2;
};

/** Syntax highlight a code block using highlight.js */
const SyntaxBlock = ({ code }: { code: string }) => {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        if (ref.current) {
            hljs.highlightElement(ref.current);
        }
    }, [code]);
    return (
        <pre className="hljs-pre rounded-lg overflow-auto max-h-52 text-xs leading-relaxed">
            <code ref={ref} className="hljs text-xs">{code}</code>
        </pre>
    );
};

function Hero() {
    const { toasts, showToast, removeToast } = useToast();

    const [active, setActive] = useState<"share" | "retrieve" | null>(null);
    const [shareMode, setShareMode] = useState<ContentType>("text");
    const [content, setContent] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number[]>([]);

    const [retrieveCode, setRetrieveCode] = useState("");
    const [step, setStep] = useState<ShareStep>("typing");
    const [shareCode, setShareCode] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [qrCode, setQrCode] = useState("");
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedRetrieved, setCopiedRetrieved] = useState(false);
    const [requestError, setRequestError] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Retrieved data state
    const [retrievedContent, setRetrievedContent] = useState<string | null>(null);
    const [retrievedContentType, setRetrievedContentType] = useState<ContentType>("text");
    const [retrievedFileUrl, setRetrievedFileUrl] = useState<string | null>(null);
    const [retrievedFileName, setRetrievedFileName] = useState<string | null>(null);
    const [retrievedFileSize, setRetrievedFileSize] = useState<number | null>(null);
    const [retrievedMimeType, setRetrievedMimeType] = useState<string | null>(null);
    const [retrievedFiles, setRetrievedFiles] = useState<FileEntry[]>([]);
    const [retrievedType, setRetrievedType] = useState("");
    const [retrievedCreatedAt, setRetrievedCreatedAt] = useState<string | null>(null);
    const [retrieveError, setRetrieveError] = useState("");
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);

    // Auto-retrieve code from URL parameter on initial load
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const codeFromUrl = urlParams.get("code");

        if (codeFromUrl && codeFromUrl.trim()) {
            const cleanCode = codeFromUrl.trim();
            setRetrieveCode(cleanCode);
            setActive("retrieve");
            fetchAndRetrieveCode(cleanCode);
        }
    }, []);

    const fetchAndRetrieveCode = async (codeToFetch: string) => {
        setRetrieveError("");
        setRetrievedContent(null);
        setRetrievedFileUrl(null);
        setRetrievedFileName(null);
        setRetrievedFileSize(null);
        setRetrievedMimeType(null);
        setRetrievedFiles([]);
        setRetrievedCreatedAt(null);
        setIsRetrieving(true);

        try {
            const response = await fetch(`${getApiBaseUrl()}/api/messages/${encodeURIComponent(codeToFetch)}`);
            const result: {
                success?: boolean;
                error?: string;
                data?: {
                    message: string | null;
                    type: string;
                    content_type?: ContentType;
                    file_url?: string | null;
                    file_name?: string | null;
                    file_size?: number | null;
                    mime_type?: string | null;
                    files?: FileEntry[] | null;
                    created_at: string;
                };
            } = await response.json();

            if (!response.ok || !result.data) {
                throw new Error(result.error || "Item not found or expired");
            }

            setRetrievedContent(result.data.message);
            setRetrievedContentType(result.data.content_type || "text");
            setRetrievedFileUrl(result.data.file_url || null);
            setRetrievedFileName(result.data.file_name || null);
            setRetrievedFileSize(result.data.file_size || null);
            setRetrievedMimeType(result.data.mime_type || null);
            setRetrievedFiles(Array.isArray(result.data.files) ? result.data.files : []);
            setRetrievedType(result.data.type);
            setRetrievedCreatedAt(result.data.created_at || null);
        } catch (error) {
            setRetrieveError(error instanceof Error ? error.message : "Failed to retrieve content");
        } finally {
            setIsRetrieving(false);
        }
    };

    const handleFilesSelect = (files: File[]) => {
        const maxBytes = 200 * 1024 * 1024; // 200MB limit per file
        const valid: File[] = [];
        for (const file of files) {
            if (file.size > maxBytes) {
                showToast(`"${file.name}" exceeds the 200MB limit`, "error");
            } else {
                valid.push(file);
            }
        }
        setSelectedFiles((prev) => {
            // Avoid duplicates by name
            const existingNames = new Set(prev.map((f) => f.name));
            return [...prev, ...valid.filter((f) => !existingNames.has(f.name))];
        });
    };

    const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesSelect(Array.from(e.dataTransfer.files));
        }
    };

    const handleRemoveFile = (idx: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    // Handle Send
    const handleSend = () => {
        if (shareMode === "text" && !content.trim()) {
            showToast("Please enter some text content to share", "warning");
            return;
        }
        if (shareMode === "file" && selectedFiles.length === 0) {
            showToast("Please select at least one file to upload", "warning");
            return;
        }
        setStep("choice");
    };

    const handleRetrieve = async () => {
        if (!retrieveCode.trim()) {
            showToast("Please enter a 7-digit code to retrieve content", "warning");
            return;
        }
        await fetchAndRetrieveCode(retrieveCode.trim());
    };

    const handleClearRetrieve = () => {
        setRetrieveCode("");
        setRetrievedContent(null);
        setRetrievedFileUrl(null);
        setRetrievedFileName(null);
        setRetrievedFileSize(null);
        setRetrievedMimeType(null);
        setRetrievedFiles([]);
        setRetrievedType("");
        setRetrievedCreatedAt(null);
        setRetrieveError("");
    };

    const handleDownloadFile = async (e: React.MouseEvent, url: string, fileName: string, idx: number = -1) => {
        e.stopPropagation();
        if (!url) return;
        setDownloadingIdx(idx);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network response was not ok");
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = fileName || "download";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            showToast(`"${fileName}" downloaded!`, "success");
        } catch (err) {
            console.error("Blob download failed, opening directly:", err);
            window.open(url, "_blank");
        } finally {
            setDownloadingIdx(null);
        }
    };

    // Handle Save Option Click — supports multiple file uploads
    const handleOptionClick = async (type: SaveType) => {
        setRequestError("");
        setIsSending(true);

        try {
            let saveBody: Record<string, unknown>;

            if (shareMode === "file" && selectedFiles.length > 0) {
                if (selectedFiles.length === 1) {
                    // Single file upload (existing flow)
                    const file = selectedFiles[0];
                    setUploadProgress([0]);

                    const uploadUrlRes = await fetch(`${getApiBaseUrl()}/api/upload-url`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size }),
                    });
                    const uploadUrlData = await uploadUrlRes.json();
                    if (!uploadUrlRes.ok || !uploadUrlData.uploadUrl) {
                        throw new Error(uploadUrlData.error || "Failed to prepare file upload URL");
                    }

                    await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open("PUT", uploadUrlData.uploadUrl, true);
                        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
                        xhr.upload.onprogress = (ev) => {
                            if (ev.lengthComputable) setUploadProgress([Math.round((ev.loaded / ev.total) * 100)]);
                        };
                        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
                        xhr.onerror = () => reject(new Error("File upload failed. Please check network/CORS."));
                        xhr.send(file);
                    });

                    saveBody = {
                        contentType: "file",
                        fileUrl: uploadUrlData.publicFileUrl,
                        fileName: file.name,
                        fileSize: file.size,
                        fileKey: uploadUrlData.fileKey,
                        mimeType: file.type,
                        message: content.trim() || undefined,
                        type,
                        clientOrigin: window.location.origin,
                    };
                } else {
                    // Multi-file upload
                    setUploadProgress(new Array(selectedFiles.length).fill(0));
                    const uploadedFiles: FileEntry[] = [];

                    for (let i = 0; i < selectedFiles.length; i++) {
                        const file = selectedFiles[i];
                        const uploadUrlRes = await fetch(`${getApiBaseUrl()}/api/upload-url`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size }),
                        });
                        const uploadUrlData = await uploadUrlRes.json();
                        if (!uploadUrlRes.ok || !uploadUrlData.uploadUrl) {
                            throw new Error(`Failed to prepare upload for "${file.name}"`);
                        }

                        await new Promise<void>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open("PUT", uploadUrlData.uploadUrl, true);
                            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
                            xhr.upload.onprogress = (ev) => {
                                if (ev.lengthComputable) {
                                    setUploadProgress((prev) => {
                                        const next = [...prev];
                                        next[i] = Math.round((ev.loaded / ev.total) * 100);
                                        return next;
                                    });
                                }
                            };
                            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed for "${file.name}" (HTTP ${xhr.status})`));
                            xhr.onerror = () => reject(new Error(`Upload failed for "${file.name}"`));
                            xhr.send(file);
                        });

                        uploadedFiles.push({
                            fileUrl: uploadUrlData.publicFileUrl,
                            fileName: file.name,
                            fileSize: file.size,
                            fileKey: uploadUrlData.fileKey,
                            mimeType: file.type,
                        });
                    }

                    saveBody = {
                        contentType: "file",
                        // use first file as primary (for backward compatibility)
                        fileUrl: uploadedFiles[0].fileUrl,
                        fileName: uploadedFiles[0].fileName,
                        fileSize: uploadedFiles[0].fileSize,
                        fileKey: uploadedFiles[0].fileKey,
                        mimeType: uploadedFiles[0].mimeType,
                        files: uploadedFiles,
                        message: content.trim() || undefined,
                        type,
                        clientOrigin: window.location.origin,
                    };
                }
            } else {
                saveBody = {
                    contentType: "text",
                    message: content,
                    type,
                    clientOrigin: window.location.origin,
                };
            }

            const response = await fetch(`${getApiBaseUrl()}/api/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(saveBody),
            });

            const result: { success?: boolean; error?: string; code?: string; shareUrl?: string; qrCode?: string } = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to save share item");
            if (!result.code) throw new Error("The server did not return a share code");

            let constructedUrl = result.shareUrl || `${window.location.origin}/?code=${result.code}`;
            if (window.location.protocol === "https:" && constructedUrl.startsWith("http://")) {
                constructedUrl = constructedUrl.replace(/^http:\/\//i, "https://");
            }

            setShareCode(result.code);
            setShareUrl(constructedUrl);
            setQrCode(result.qrCode || "");
            setStep("success");
            showToast(shareMode === "file" ? `${selectedFiles.length > 1 ? `${selectedFiles.length} files` : "File"} uploaded & saved!` : "Message saved!", "success");
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Failed to save share";
            setRequestError(msg);
            showToast(msg, "error");
        } finally {
            setIsSending(false);
        }
    };

    const copyToClipboard = async (text: string, kind: "code" | "url" | "retrieved") => {
        try {
            await navigator.clipboard.writeText(text);
            if (kind === "code") {
                setCopiedCode(true);
                showToast("Code copied!", "success");
                setTimeout(() => setCopiedCode(false), 2000);
            } else if (kind === "url") {
                setCopiedUrl(true);
                showToast("Link copied!", "success");
                setTimeout(() => setCopiedUrl(false), 2000);
            } else {
                setCopiedRetrieved(true);
                showToast("Content copied!", "success");
                setTimeout(() => setCopiedRetrieved(false), 2000);
            }
        } catch (err) {
            showToast("Failed to copy", "error");
            console.error("Failed to copy text: ", err);
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setContent(text);
                showToast("Pasted from clipboard!", "info");
            } else {
                showToast("Clipboard is empty", "warning");
            }
        } catch {
            showToast("Clipboard access denied. Try Ctrl+V instead.", "warning");
        }
    };

    const handleResetShare = () => {
        setContent("");
        setSelectedFiles([]);
        setUploadProgress([]);
        setShareCode("");
        setShareUrl("");
        setQrCode("");
        setStep("typing");
        setRequestError("");
    };

    const getRemainingMinutes = (createdAtStr: string | null): string | null => {
        if (!createdAtStr) return null;
        const createdDate = new Date(createdAtStr).getTime();
        const expiresDate = createdDate + 30 * 60 * 1000;
        const now = Date.now();
        const diffMs = expiresDate - now;
        if (diffMs <= 0) return "Expired";
        const mins = Math.ceil(diffMs / (60 * 1000));
        return `Expires in ~${mins}m`;
    };

    const totalUploadProgress = uploadProgress.length > 0
        ? Math.round(uploadProgress.reduce((a, b) => a + b, 0) / uploadProgress.length)
        : 0;

    const hasRetrievedItem = Boolean(retrievedContent !== null || retrievedFileUrl !== null || retrievedFiles.length > 0);

    // Determine if retrieved text looks like code
    const isCode = retrievedContentType === "text" && retrievedContent !== null && detectIsCode(retrievedContent);

    // All retrieved files (multi or single)
    const allRetrievedFiles: FileEntry[] = retrievedFiles.length > 0
        ? retrievedFiles
        : (retrievedFileUrl ? [{
            fileUrl: retrievedFileUrl,
            fileName: retrievedFileName || "file",
            fileSize: retrievedFileSize || 0,
            fileKey: "",
            mimeType: retrievedMimeType || "",
        }] : []);

    return (
        <main className="hero-page">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="hero-copy">
                <span className="eyebrow">A tiny tool for big transfers</span>
                <h1 className="hero-title">
                    Move text &amp; files between your devices
                </h1>
                <p className="hero-subtitle">Paste text or upload files up to 200MB. Pick them up anywhere with a 7-digit code.</p>
            </div>

            <div className="clipboard-card">

                {/* SHARE PANEL */}
                <div
                    onClick={() => setActive("share")}
                    className={`flex flex-col items-center cursor-pointer transition-all duration-500 panel panel-share
                        ${active === "share" ? "panel-expanded" : active === "retrieve" ? "panel-collapsed" : "panel-default"}`}
                >
                    <div className="panel-icon">Share</div>

                    <p className="panel-description">
                        {shareMode === "text" ? "Paste text to create a share" : `Upload files (up to 200 MB each)`}
                    </p>

                    <div className="panel-content-wrapper w-full flex flex-col items-center mt-2 flex-1">
                        {/* STEP: typing */}
                        {step === "typing" && (
                            <>
                                {/* Mode Selector: Text vs File */}
                                <div className="mode-toggle-bar flex items-center gap-1.5 p-1 bg-amber-100/90 rounded-xl border-2 border-slate-800 mb-2">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setShareMode("text"); }}
                                        className={`mode-btn px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                            shareMode === "text"
                                                ? "bg-amber-400 text-slate-900 shadow-sm border border-slate-800"
                                                : "text-slate-700 hover:text-slate-900"
                                        }`}
                                    >
                                        📝 Text
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setShareMode("file"); }}
                                        className={`mode-btn px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                            shareMode === "file"
                                                ? "bg-amber-400 text-slate-900 shadow-sm border border-slate-800"
                                                : "text-slate-700 hover:text-slate-900"
                                        }`}
                                    >
                                        📁 Files (200MB)
                                    </button>
                                </div>

                                {/* Text Mode View */}
                                {shareMode === "text" && (
                                    <div className="w-full relative">
                                        <textarea
                                            value={content}
                                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                            placeholder="Paste your text content here..."
                                            className="panel-input w-full min-h-32 sm:min-h-44 flex-1 p-3 sm:p-4 pb-7 focus:outline-none text-xs sm:text-base"
                                        />
                                        {/* Paste from clipboard + char counter row */}
                                        <div className="flex items-center justify-between px-2 pb-1 absolute bottom-1 left-0 right-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handlePasteFromClipboard(); }}
                                                className="paste-clipboard-btn text-[10px] sm:text-xs font-bold text-slate-600 hover:text-slate-900 bg-amber-100 hover:bg-amber-200 border border-slate-300 rounded-md px-2 py-0.5 cursor-pointer transition-all flex items-center gap-1"
                                                title="Paste from clipboard"
                                            >
                                                📋 Paste
                                            </button>
                                            <span className={`char-counter text-[10px] font-mono tabular-nums transition-colors ${
                                                content.length > 10000 ? "text-rose-600 font-bold" : content.length > 5000 ? "text-amber-600" : "text-slate-400"
                                            }`}>
                                                {content.length.toLocaleString()} chars
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* File Mode View */}
                                {shareMode === "file" && (
                                    <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
                                        {/* Drop zone (always visible in file mode) */}
                                        <label
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            className={`file-dropzone w-full min-h-24 sm:min-h-32 flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer transition-all text-center ${
                                                isDragging ? "bg-amber-200/80 scale-[1.01]" : "bg-white/70 hover:bg-white/95"
                                            }`}
                                        >
                                            <input
                                                type="file"
                                                multiple
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files.length > 0) {
                                                        handleFilesSelect(Array.from(e.target.files));
                                                        e.target.value = "";
                                                    }
                                                }}
                                                className="hidden"
                                            />
                                            <div className="text-2xl sm:text-3xl mb-1">☁️</div>
                                            <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                                                {selectedFiles.length > 0 ? "Add more files or drag & drop" : "Choose files or drag & drop here"}
                                            </span>
                                            <span className="text-[10px] sm:text-xs text-slate-600 font-semibold mt-0.5">
                                                Multiple files • Max 200 MB each • Cloudflare R2
                                            </span>
                                        </label>

                                        {/* Selected Files List */}
                                        {selectedFiles.length > 0 && (
                                            <div className="w-full flex flex-col gap-1.5">
                                                {/* Summary bar */}
                                                <div className="flex items-center justify-between px-1">
                                                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">
                                                        {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected
                                                    </span>
                                                    <span className="text-[10px] font-mono text-slate-500">
                                                        Total: {formatFileSize(selectedFiles.reduce((a, f) => a + f.size, 0))}
                                                    </span>
                                                </div>

                                                {/* File cards */}
                                                <div className="file-list flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                                                    {selectedFiles.map((file, idx) => (
                                                        <div key={idx} className="file-preview-card flex items-center justify-between gap-2 p-2 bg-white/95 rounded-xl border-2 border-slate-800 shadow-sm">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-xl">{getFileIcon(file.name)}</span>
                                                                <div className="min-w-0 text-left">
                                                                    <p className="font-bold text-xs text-slate-900 truncate max-w-[160px] sm:max-w-[220px]">{file.name}</p>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-[10px] text-slate-500 font-mono">{formatFileSize(file.size)}</p>
                                                                        {/* Mini size bar */}
                                                                        <div className="size-bar-track h-1 w-14 sm:w-20 bg-slate-200 rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full bg-amber-400 rounded-full"
                                                                                style={{ width: `${Math.min(100, (file.size / (200 * 1024 * 1024)) * 100).toFixed(1)}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }}
                                                                className="text-slate-400 hover:text-rose-600 font-bold p-1 text-xs cursor-pointer transition-colors flex-shrink-0"
                                                                title="Remove file"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Optional note textarea */}
                                                <textarea
                                                    value={content}
                                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                                    placeholder="Add an optional note with these files..."
                                                    rows={2}
                                                    className="panel-input w-full p-2 text-xs focus:outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSend(); }}
                                    className="panel-button button-share mt-3 px-5 py-2 cursor-pointer text-xs sm:text-base"
                                >
                                    Send
                                </button>
                            </>
                        )}

                        {/* STEP: choice */}
                        {step === "choice" && (
                            <div className="choice-list mt-4 flex flex-col gap-3 w-full items-center max-w-sm">
                                {isSending && shareMode === "file" && totalUploadProgress > 0 && (
                                    <div className="w-full">
                                        {selectedFiles.length > 1 && (
                                            <div className="flex justify-between mb-1 text-[10px] font-bold text-slate-600">
                                                <span>Uploading {selectedFiles.length} files...</span>
                                                <span>{totalUploadProgress}%</span>
                                            </div>
                                        )}
                                        <div className="upload-progress-wrapper w-full bg-slate-900/10 rounded-full h-3.5 border border-slate-800 overflow-hidden relative mb-1">
                                            <div
                                                className="h-full bg-amber-400 transition-all duration-200"
                                                style={{ width: `${totalUploadProgress}%` }}
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-900">
                                                {totalUploadProgress}%
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOptionClick("temporary"); }}
                                    disabled={isSending}
                                    className="panel-button button-temporary w-full sm:w-3/4 px-3 py-2 cursor-pointer text-xs sm:text-base flex items-center justify-center gap-1.5 flex-wrap"
                                >
                                    {isSending ? (
                                        totalUploadProgress > 0 ? `Uploading (${totalUploadProgress}%)...` : "Saving..."
                                    ) : (
                                        <>
                                            <span>Temporary Save</span>
                                            <span className="text-[10px] sm:text-xs bg-slate-900/15 text-slate-900 px-1.5 py-0.5 rounded-md font-black tracking-wide">
                                                30 min
                                            </span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOptionClick("permanent"); }}
                                    disabled={isSending}
                                    className="panel-button button-permanent w-full sm:w-3/4 px-3 py-2 cursor-pointer text-xs sm:text-base"
                                >
                                    {isSending ? (
                                        totalUploadProgress > 0 ? `Uploading (${totalUploadProgress}%)...` : "Saving..."
                                    ) : (
                                        "Permanent Save"
                                    )}
                                </button>
                            </div>
                        )}

                        {/* STEP: success */}
                        {step === "success" && (
                            <div className="success-message-container mt-1 text-center w-full flex flex-col items-center gap-2">
                                <p className="font-semibold text-emerald-700 text-sm sm:text-base">
                                    {shareMode === "file"
                                        ? `${selectedFiles.length > 1 ? `${selectedFiles.length} files` : "File"} uploaded & saved successfully!`
                                        : "Message saved successfully!"}
                                </p>

                                {/* Side-by-side layout: Left QR Code, Right Code & Link */}
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 w-full max-w-xl my-1">
                                    {/* Left: QR Code */}
                                    {qrCode && (
                                        <div className="qr-section flex-shrink-0">
                                            <QRCodeDisplay qrCodeUrl={qrCode} altText={`QR code for ${shareCode}`} />
                                        </div>
                                    )}

                                    {/* Right: Code & Link */}
                                    <div className="flex flex-col gap-2 w-full sm:w-auto flex-1 min-w-[180px] max-w-sm">
                                        {/* 7-Digit Code Section */}
                                        <div className="code-display-box flex flex-col items-center w-full bg-amber-50/90 p-2 rounded-xl border-2 border-slate-800 shadow-sm">
                                            <span className="text-[10px] uppercase font-extrabold text-slate-600 tracking-wider">Unique 7-Digit Code</span>
                                            <div className="flex items-center gap-2 mt-0.5 w-full justify-center">
                                                <span className="text-lg sm:text-2xl font-mono font-black text-slate-800 tracking-widest select-all">
                                                    {shareCode}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(shareCode, "code"); }}
                                                    className="panel-button bg-amber-300 hover:bg-amber-400 text-xs px-2 py-0.5 transition-all cursor-pointer"
                                                >
                                                    {copiedCode ? "Copied!" : "Copy Code"}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Share URL & Copy Link Section */}
                                        {shareUrl && (
                                            <div className="url-copy-box w-full flex flex-col items-center bg-white/90 p-2 rounded-xl border-2 border-slate-800 shadow-sm">
                                                <span className="text-[10px] uppercase font-extrabold text-slate-600 tracking-wider mb-0.5">Share Link</span>
                                                <div className="flex items-center w-full gap-1">
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={shareUrl}
                                                        className="panel-input flex-1 px-2 py-0.5 text-xs font-mono text-slate-700 select-all overflow-hidden text-ellipsis whitespace-nowrap"
                                                    />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(shareUrl, "url"); }}
                                                        className="panel-button button-share text-xs px-2 py-0.5 whitespace-nowrap cursor-pointer"
                                                    >
                                                        {copiedUrl ? "Copied!" : "Copy Link"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleResetShare(); }}
                                    className="text-xs font-bold underline text-slate-700 hover:text-slate-900 cursor-pointer"
                                >
                                    + Share another {shareMode === "file" ? "file" : "message"}
                                </button>
                            </div>
                        )}

                        {requestError && <div className="request-error mt-2 text-red-500 font-bold text-xs sm:text-sm">{requestError}</div>}
                    </div>
                </div>

                {/* RETRIEVE PANEL */}
                <div
                    onClick={() => setActive("retrieve")}
                    className={`flex flex-col items-center cursor-pointer transition-all duration-500 panel panel-retrieve
                        ${active === "retrieve" ? "panel-expanded" : active === "share" ? "panel-collapsed" : "panel-default"}`}
                >
                    <div className="panel-icon">Retrieve</div>

                    <p className="panel-description">
                        {hasRetrievedItem ? "Retrieved Content" : "Retrieve shared content"}
                    </p>

                    <div className="panel-content-wrapper w-full flex flex-col items-center mt-2 flex-1 max-w-md">

                        {/* BEFORE RETRIEVAL: 7-Digit Code Input Box & Retrieve Button */}
                        {!hasRetrievedItem && (
                            <>
                                <div className="flex items-center w-full gap-1.5 mt-2">
                                    <input
                                        type="text"
                                        maxLength={7}
                                        value={retrieveCode}
                                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleRetrieve();
                                            }
                                        }}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            const cleaned = e.target.value.replace(/[^0-9]/g, "");
                                            setRetrieveCode(cleaned);
                                        }}
                                        placeholder="Enter 7-digit code (e.g. 0123456)"
                                        className="panel-input w-full p-2.5 sm:p-3 rounded-xl text-center tracking-widest font-mono text-sm sm:text-lg focus:outline-none"
                                    />
                                    {retrieveCode && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleClearRetrieve(); }}
                                            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1 cursor-pointer"
                                            title="Clear code"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRetrieve(); }}
                                    disabled={isRetrieving}
                                    className="panel-button button-retrieve mt-3 px-6 py-2.5 cursor-pointer text-xs sm:text-base w-full sm:w-auto"
                                >
                                    {isRetrieving ? "Retrieving..." : "Retrieve Content"}
                                </button>
                            </>
                        )}

                        {/* AFTER RETRIEVAL */}
                        {hasRetrievedItem && (
                            <div className="retrieved-container mt-1 w-full flex flex-col items-center gap-2">
                                {/* Heading */}
                                <div className="retrieved-heading flex flex-col items-center text-center">
                                    <span className="text-[11px] uppercase font-extrabold text-slate-700 tracking-wider">
                                        {retrievedType === "temporary"
                                            ? `⚡ Temporary ${retrievedContentType === "file" ? "File" : "Message"}`
                                            : `🔒 Permanent ${retrievedContentType === "file" ? "File" : "Message"}`}
                                    </span>
                                    <span className="text-lg sm:text-xl font-mono font-black text-slate-900 tracking-widest mt-0.5">
                                        Code: {retrieveCode}
                                    </span>
                                    {retrievedType === "temporary" && retrievedCreatedAt && (
                                        <span className="text-xs text-rose-600 font-mono font-bold">
                                            {getRemainingMinutes(retrievedCreatedAt)}
                                        </span>
                                    )}
                                </div>

                                {/* FILE RETRIEVAL BOX */}
                                {retrievedContentType === "file" && (
                                    <div className="retrieved-result p-3.5 w-full bg-slate-900 text-slate-100 rounded-xl border-2 border-slate-800 text-left shadow-md flex flex-col gap-2.5">
                                        {/* File count badge for multi-file */}
                                        {allRetrievedFiles.length > 1 && (
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-400">
                                                <span>📦</span>
                                                <span>{allRetrievedFiles.length} files in this share</span>
                                            </div>
                                        )}

                                        {allRetrievedFiles.map((file, idx) => (
                                            <div key={idx} className="flex flex-col gap-2 border border-slate-700 rounded-lg p-2.5 bg-slate-800/60">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-2xl">{getFileIcon(file.fileName)}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-bold text-sm text-slate-100 truncate">{file.fileName}</p>
                                                        <p className="text-[11px] text-slate-400 font-mono">{formatFileSize(file.fileSize)}</p>
                                                    </div>
                                                </div>

                                                {/* Image thumbnail */}
                                                {file.fileUrl && (file.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.fileName)) && (
                                                    <div className="flex justify-center bg-black/40 p-1.5 rounded-lg border border-slate-700/60 max-h-36 overflow-hidden">
                                                        <img
                                                            src={file.fileUrl}
                                                            alt={file.fileName}
                                                            className="max-h-32 object-contain rounded"
                                                        />
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDownloadFile(e, file.fileUrl, file.fileName, idx)}
                                                    disabled={downloadingIdx !== null}
                                                    className="panel-button bg-emerald-400 hover:bg-emerald-500 text-slate-900 text-xs font-black py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer text-center w-full"
                                                >
                                                    <span>⬇</span>
                                                    {downloadingIdx === idx
                                                        ? "Downloading..."
                                                        : `Download (${formatFileSize(file.fileSize)})`}
                                                </button>
                                            </div>
                                        ))}

                                        {/* Optional note if present */}
                                        {retrievedContent && (
                                            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/60 text-xs text-slate-300 whitespace-pre-wrap break-words">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Note:</span>
                                                {retrievedContent}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TEXT RETRIEVAL BOX */}
                                {retrievedContentType === "text" && retrievedContent && (
                                    <div className="retrieved-result p-3 w-full bg-slate-900 text-slate-100 rounded-xl border-2 border-slate-800 text-left shadow-md flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {retrievedContent.length.toLocaleString()} chars
                                                </span>
                                                {isCode && (
                                                    <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-black tracking-wide">
                                                        CODE
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(retrievedContent, "retrieved"); }}
                                                className="panel-button bg-emerald-400 hover:bg-emerald-500 text-slate-900 text-xs px-2.5 py-0.5 transition-all cursor-pointer"
                                            >
                                                {copiedRetrieved ? "Copied!" : "Copy Content"}
                                            </button>
                                        </div>

                                        {isCode ? (
                                            <SyntaxBlock code={retrievedContent} />
                                        ) : (
                                            <div className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm leading-relaxed max-h-48 overflow-y-auto pr-1 text-slate-200">
                                                {retrievedContent}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Reset button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleClearRetrieve(); }}
                                    className="panel-button bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs px-3.5 py-1.5 mt-1 cursor-pointer font-bold"
                                >
                                    Clear &amp; Retrieve Another
                                </button>
                            </div>
                        )}

                        {retrieveError && <div className="request-error mt-2 text-red-500 font-bold text-xs sm:text-sm">{retrieveError}</div>}
                    </div>
                </div>

            </div>
        </main>
    );
}

export default Hero;