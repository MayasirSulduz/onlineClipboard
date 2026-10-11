import { useState, useEffect, type ChangeEvent, type KeyboardEvent, type DragEvent } from "react";
import QRCodeDisplay from "./QRCodeDisplay";

type SaveType = "temporary" | "permanent";
type ShareStep = "typing" | "choice" | "success";
type ContentType = "text" | "file";

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
    return "📁";
};

function Hero() {
    const [active, setActive] = useState<"share" | "retrieve" | null>(null);
    const [shareMode, setShareMode] = useState<ContentType>("text");
    const [content, setContent] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

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
    const [retrievedType, setRetrievedType] = useState("");
    const [retrievedCreatedAt, setRetrievedCreatedAt] = useState<string | null>(null);
    const [retrieveError, setRetrieveError] = useState("");
    const [isRetrieving, setIsRetrieving] = useState(false);

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
            setRetrievedType(result.data.type);
            setRetrievedCreatedAt(result.data.created_at || null);
        } catch (error) {
            setRetrieveError(error instanceof Error ? error.message : "Failed to retrieve content");
        } finally {
            setIsRetrieving(false);
        }
    };

    const handleFileSelect = (file: File | null) => {
        if (!file) return;
        const maxBytes = 200 * 1024 * 1024; // 200MB limit
        if (file.size > maxBytes) {
            alert(`File size (${formatFileSize(file.size)}) exceeds the maximum limit of 200 MB.`);
            return;
        }
        setSelectedFile(file);
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
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    // Handle Send
    const handleSend = () => {
        if (shareMode === "text" && !content.trim()) {
            alert("Please enter some text content to share");
            return;
        }
        if (shareMode === "file" && !selectedFile) {
            alert("Please select a file to upload");
            return;
        }
        setStep("choice");
    };

    const handleRetrieve = async () => {
        if (!retrieveCode.trim()) {
            alert("Please enter a 7-digit code to retrieve content");
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
        setRetrievedType("");
        setRetrievedCreatedAt(null);
        setRetrieveError("");
    };

    // Handle Save Option Click
    const handleOptionClick = async (type: SaveType) => {
        setRequestError("");
        setIsSending(true);
        setUploadProgress(0);

        try {
            let fileUploadPayload: {
                contentType: "file";
                fileUrl: string;
                fileName: string;
                fileSize: number;
                fileKey: string;
                mimeType: string;
                message?: string;
                type: SaveType;
            } | null = null;

            if (shareMode === "file" && selectedFile) {
                // Step 1: Request presigned upload URL from server
                const uploadUrlRes = await fetch(`${getApiBaseUrl()}/api/upload-url`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileName: selectedFile.name,
                        fileType: selectedFile.type,
                        fileSize: selectedFile.size,
                    }),
                });

                const uploadUrlData = await uploadUrlRes.json();
                if (!uploadUrlRes.ok || !uploadUrlData.uploadUrl) {
                    throw new Error(uploadUrlData.error || "Failed to prepare file upload URL");
                }

                // Step 2: Upload file directly to Cloudflare R2
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrlData.uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");

                    xhr.upload.onprogress = (ev) => {
                        if (ev.lengthComputable) {
                            const percent = Math.round((ev.loaded / ev.total) * 100);
                            setUploadProgress(percent);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`File upload to storage failed (HTTP ${xhr.status})`));
                        }
                    };

                    xhr.onerror = () => reject(new Error("File upload failed. Please check network/CORS."));
                    xhr.send(selectedFile);
                });

                fileUploadPayload = {
                    contentType: "file",
                    fileUrl: uploadUrlData.publicFileUrl,
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                    fileKey: uploadUrlData.fileKey,
                    mimeType: selectedFile.type,
                    message: content.trim() || undefined,
                    type,
                };
            }

            // Step 3: Save metadata to PostgreSQL & generate 7-digit code
            const saveBody = fileUploadPayload || {
                contentType: "text",
                message: content,
                type,
            };

            const response = await fetch(`${getApiBaseUrl()}/api/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(saveBody),
            });

            const result: { success?: boolean; error?: string; code?: string; shareUrl?: string; qrCode?: string } = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to save share item");
            }

            if (!result.code) {
                throw new Error("The server did not return a share code");
            }

            const constructedUrl = result.shareUrl || `${window.location.origin}/?code=${result.code}`;

            setShareCode(result.code);
            setShareUrl(constructedUrl);
            setQrCode(result.qrCode || "");
            setStep("success");
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : "Failed to save share");
        } finally {
            setIsSending(false);
        }
    };

    const copyToClipboard = async (text: string, kind: "code" | "url" | "retrieved") => {
        try {
            await navigator.clipboard.writeText(text);
            if (kind === "code") {
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
            } else if (kind === "url") {
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2000);
            } else {
                setCopiedRetrieved(true);
                setTimeout(() => setCopiedRetrieved(false), 2000);
            }
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    const handleResetShare = () => {
        setContent("");
        setSelectedFile(null);
        setUploadProgress(0);
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

    const hasRetrievedItem = Boolean(retrievedContent !== null || retrievedFileUrl !== null);

    return (
        <main className="hero-page">

            <div className="hero-copy">
                <span className="eyebrow">A tiny tool for big transfers</span>
                <h1 className="hero-title">
                    Move text & files between your devices
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
                        {shareMode === "text" ? "Paste text to create a share" : "Upload any file (up to 200 MB)"}
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
                                        📁 File (200MB)
                                    </button>
                                </div>

                                {/* Text Mode View */}
                                {shareMode === "text" && (
                                    <textarea
                                        value={content}
                                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                        placeholder="Paste your text content here..."
                                        className="panel-input w-full min-h-32 sm:min-h-44 flex-1 p-3 sm:p-4 focus:outline-none text-xs sm:text-base"
                                    />
                                )}

                                {/* File Mode View */}
                                {shareMode === "file" && (
                                    <div className="w-full flex-1 flex flex-col items-center justify-center">
                                        {!selectedFile ? (
                                            <label
                                                onDragOver={handleDragOver}
                                                onDragLeave={handleDragLeave}
                                                onDrop={handleDrop}
                                                className={`file-dropzone w-full flex-1 min-h-32 sm:min-h-44 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer transition-all text-center ${
                                                    isDragging ? "bg-amber-200/80 scale-[1.01]" : "bg-white/70 hover:bg-white/95"
                                                }`}
                                            >
                                                <input
                                                    type="file"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            handleFileSelect(e.target.files[0]);
                                                        }
                                                    }}
                                                    className="hidden"
                                                />
                                                <div className="text-3xl sm:text-4xl mb-1">☁️</div>
                                                <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                                                    Choose any file or drag & drop here
                                                </span>
                                                <span className="text-[10px] sm:text-xs text-slate-600 font-semibold mt-0.5">
                                                    Max 200 MB • Stored securely on Cloudflare R2
                                                </span>
                                            </label>
                                        ) : (
                                            <div className="file-preview-card w-full p-3 bg-white/95 rounded-xl border-2 border-slate-800 shadow-sm flex flex-col gap-2">
                                                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-2xl">{getFileIcon(selectedFile.name)}</span>
                                                        <div className="min-w-0 text-left">
                                                            <p className="font-bold text-xs sm:text-sm text-slate-900 truncate max-w-[200px] sm:max-w-[280px]">
                                                                {selectedFile.name}
                                                            </p>
                                                            <p className="text-[10px] sm:text-xs text-slate-600 font-mono">
                                                                {formatFileSize(selectedFile.size)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                                                        className="text-slate-500 hover:text-rose-600 font-bold p-1 text-sm cursor-pointer"
                                                        title="Remove file"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={content}
                                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                                    placeholder="Add an optional note with this file..."
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
                                {isSending && shareMode === "file" && uploadProgress > 0 && (
                                    <div className="upload-progress-wrapper w-full bg-slate-900/10 rounded-full h-3.5 border border-slate-800 overflow-hidden relative mb-1">
                                        <div
                                            className="h-full bg-amber-400 transition-all duration-200"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-900">
                                            {uploadProgress}%
                                        </span>
                                    </div>
                                )}

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOptionClick("temporary"); }}
                                    disabled={isSending}
                                    className="panel-button button-temporary w-full sm:w-3/4 px-3 py-2 cursor-pointer text-xs sm:text-base flex items-center justify-center gap-1.5 flex-wrap"
                                >
                                    {isSending ? (
                                        uploadProgress > 0 ? `Uploading (${uploadProgress}%)...` : "Saving..."
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
                                        uploadProgress > 0 ? `Uploading (${uploadProgress}%)...` : "Saving..."
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
                                    {shareMode === "file" ? "File uploaded & saved successfully!" : "Message saved successfully!"}
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

                        {/* AFTER RETRIEVAL: Heading with 7-digit code + Content / File Box + Outside Reset Button */}
                        {hasRetrievedItem && (
                            <div className="retrieved-container mt-1 w-full flex flex-col items-center gap-2">
                                {/* Heading showing 7-digit code and message type */}
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
                                        <div className="flex items-center gap-2.5 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                                            <span className="text-3xl">{getFileIcon(retrievedFileName || "file")}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-slate-100 truncate">
                                                    {retrievedFileName || "downloaded-file"}
                                                </p>
                                                <p className="text-[11px] text-slate-400 font-mono">
                                                    {formatFileSize(retrievedFileSize)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Image thumbnail if it's an image */}
                                        {retrievedFileUrl && (retrievedMimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(retrievedFileName || "")) && (
                                            <div className="flex justify-center bg-black/40 p-1.5 rounded-lg border border-slate-800 max-h-44 overflow-hidden">
                                                <img
                                                    src={retrievedFileUrl}
                                                    alt={retrievedFileName || "Preview"}
                                                    className="max-h-40 object-contain rounded"
                                                />
                                            </div>
                                        )}

                                        {/* Optional note if present */}
                                        {retrievedContent && (
                                            <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/60 text-xs text-slate-300 whitespace-pre-wrap break-words">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Note:</span>
                                                {retrievedContent}
                                            </div>
                                        )}

                                        {/* Prominent Download Button */}
                                        {retrievedFileUrl && (
                                            <a
                                                href={retrievedFileUrl}
                                                download={retrievedFileName || true}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="panel-button bg-emerald-400 hover:bg-emerald-500 text-slate-900 text-xs sm:text-sm font-black py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer text-center no-underline"
                                            >
                                                <span>⬇</span> Download File ({formatFileSize(retrievedFileSize)})
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* TEXT RETRIEVAL BOX */}
                                {retrievedContentType === "text" && retrievedContent && (
                                    <div className="retrieved-result p-3 w-full bg-slate-900 text-slate-100 rounded-xl border-2 border-slate-800 text-left shadow-md flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                {retrievedContent.length} chars
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(retrievedContent, "retrieved"); }}
                                                className="panel-button bg-emerald-400 hover:bg-emerald-500 text-slate-900 text-xs px-2.5 py-0.5 transition-all cursor-pointer"
                                            >
                                                {copiedRetrieved ? "Copied!" : "Copy Content"}
                                            </button>
                                        </div>

                                        <div className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm leading-relaxed max-h-48 overflow-y-auto pr-1 text-slate-200">
                                            {retrievedContent}
                                        </div>
                                    </div>
                                )}

                                {/* Reset button OUTSIDE the content box to return to start */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleClearRetrieve(); }}
                                    className="panel-button bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs px-3.5 py-1.5 mt-1 cursor-pointer font-bold"
                                >
                                    Clear & Retrieve Another
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