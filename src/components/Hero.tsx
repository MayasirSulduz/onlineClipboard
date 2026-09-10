import { useState, useEffect, type ChangeEvent } from "react";
import QRCodeDisplay from "./QRCodeDisplay";

type SaveType = "temporary" | "permanent";
type ShareStep = "typing" | "choice" | "success";

function Hero() {
    const [active, setActive] = useState<"share" | "retrieve" | null>(null);
    const [content, setContent] = useState("");
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

    const [retrievedContent, setRetrievedContent] = useState("");
    const [retrievedType, setRetrievedType] = useState("");
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
        setRetrievedContent("");
        setIsRetrieving(true);

        try {
            const response = await fetch(`http://localhost:5000/api/messages/${encodeURIComponent(codeToFetch)}`);
            const result: { success?: boolean; error?: string; data?: { message: string; type: string; created_at: string } } = await response.json();

            if (!response.ok || !result.data) {
                throw new Error(result.error || "Message not found");
            }

            setRetrievedContent(result.data.message);
            setRetrievedType(result.data.type);
        } catch (error) {
            setRetrieveError(error instanceof Error ? error.message : "Failed to retrieve content");
        } finally {
            setIsRetrieving(false);
        }
    };

    // Handle Send
    const handleSend = () => {
        if (!content.trim()) {
            alert("Please enter some content");
            return;
        }
        setStep("choice");
    };

    const handleRetrieve = async () => {
        if (!retrieveCode.trim()) {
            alert("Please enter a code to retrieve content");
            return;
        }
        await fetchAndRetrieveCode(retrieveCode.trim());
    };

    // Handle Save Option Click
    const handleOptionClick = async (type: SaveType) => {
        setRequestError("");
        setIsSending(true);

        try {
            const response = await fetch("http://localhost:5000/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: content, type }),
            });

            const result: { success?: boolean; error?: string; code?: string; shareUrl?: string; qrCode?: string } = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "The message could not be sent");
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
            setRequestError(error instanceof Error ? error.message : "The message could not be sent");
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
        setShareCode("");
        setShareUrl("");
        setQrCode("");
        setStep("typing");
        setRequestError("");
    };

    return (
        <main className="hero-page">

            <div className="hero-copy">
                <span className="eyebrow">A tiny tool for big transfers</span>
                <h1 className="hero-title">
                    Move text between your devices
                </h1>
                <p className="hero-subtitle">Paste it here. Pick it up wherever you need it.</p>
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
                        Paste content to create a share
                    </p>

                    <div className="panel-content-wrapper w-full flex flex-col items-center mt-2 flex-1">
                        {/* STEP: typing */}
                        {step === "typing" && (
                            <>
                                <textarea
                                    value={content}
                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                    placeholder="Paste your content here..."
                                    className="panel-input w-full min-h-32 sm:min-h-44 flex-1 mt-2 p-3 sm:p-4 focus:outline-none text-xs sm:text-base"
                                />

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
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOptionClick("temporary"); }}
                                    disabled={isSending}
                                    className="panel-button button-temporary w-full sm:w-3/4 px-3 py-2 cursor-pointer text-xs sm:text-base"
                                >
                                    {isSending ? "Saving..." : "Temporary Share"}
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOptionClick("permanent"); }}
                                    disabled={isSending}
                                    className="panel-button button-permanent w-full sm:w-3/4 px-3 py-2 cursor-pointer text-xs sm:text-base"
                                >
                                    {isSending ? "Saving..." : "Permanent Save"}
                                </button>
                            </div>
                        )}

                        {/* STEP: success */}
                        {step === "success" && (
                            <div className="success-message-container mt-1 text-center w-full flex flex-col items-center gap-2">
                                <p className="font-semibold text-emerald-700 text-sm sm:text-base">Message saved successfully!</p>

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
                                    + Share another message
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
                        Retrieve shared content
                    </p>

                    <div className="panel-content-wrapper w-full flex flex-col items-center mt-2 flex-1 max-w-md">
                        <input
                            type="text"
                            value={retrieveCode}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setRetrieveCode(e.target.value)}
                            placeholder="Enter 7-digit code (e.g. 0123456)"
                            className="panel-input w-full mt-2 p-2.5 sm:p-3 rounded-xl text-center tracking-widest font-mono text-sm sm:text-lg focus:outline-none"
                        />

                        <button
                            onClick={(e) => { e.stopPropagation(); handleRetrieve(); }}
                            disabled={isRetrieving}
                            className="panel-button button-retrieve mt-3 px-5 py-2 cursor-pointer text-xs sm:text-base"
                        >
                            {isRetrieving ? "Retrieving..." : "Retrieve"}
                        </button>

                        {retrievedContent && (
                            <div className="retrieved-result mt-3 p-3 w-full bg-slate-900 text-slate-100 rounded-xl border-2 border-slate-800 text-left shadow-md flex flex-col gap-1.5">
                                <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                                    <span className="text-[10px] uppercase font-extrabold text-emerald-400 tracking-wider">
                                        {retrievedType} Message
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(retrievedContent, "retrieved"); }}
                                        className="panel-button bg-emerald-400 hover:bg-emerald-500 text-slate-900 text-xs px-2 py-0.5 transition-all cursor-pointer"
                                    >
                                        {copiedRetrieved ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                                <div className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm leading-relaxed max-h-48 overflow-y-auto pr-1">
                                    {retrievedContent}
                                </div>
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