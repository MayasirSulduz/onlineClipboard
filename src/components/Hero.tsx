import { useState, type ChangeEvent } from "react";

type SaveType = "temporary" | "permanent";
type ShareStep = "typing" | "choice" | "success";

function Hero() {
    const [active, setActive] = useState<"share" | "retrieve" | null>(null);
    const [content, setContent] = useState("");
    const [retrieveCode, setRetrieveCode] = useState("");
    const [step, setStep] = useState<ShareStep>("typing");
    const [shareCode, setShareCode] = useState("");
    const [requestError, setRequestError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const [retrievedContent, setRetrievedContent] = useState("");
    const [retrievedType, setRetrievedType] = useState("");
    const [retrieveError, setRetrieveError] = useState("");
    const [isRetrieving, setIsRetrieving] = useState(false);

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
        setRetrieveError("");
        setRetrievedContent("");
        setIsRetrieving(true);

        try {
            const response = await fetch(`http://localhost:5000/api/messages/${encodeURIComponent(retrieveCode.trim())}`);
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

    // Handle Option Click
    const handleOptionClick = async (type: SaveType) => {
        setRequestError("");
        setIsSending(true);

        try {
            const response = await fetch("http://localhost:5000/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: content, type }),
            });

            const result: { success?: boolean; error?: string; code?: string } = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "The message could not be sent");
            }

            if (!result.code) {
                throw new Error("The server did not return a share code");
            }

            setShareCode(result.code);
            setStep("success");
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : "The message could not be sent");
        } finally {
            setIsSending(false);
        }
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

                {/* SHARE */}
                <div
                    onClick={() => setActive("share")}
                    className={`flex flex-col items-center cursor-pointer transition-all duration-500
                        ${active === "share" ? "w-[70%]" : active === "retrieve" ? "w-[30%]" : "w-1/2"}
                        panel panel-share`}
                >
                    <div className="panel-icon">Share</div>
                    {/* <h2 className="panel-title">Share</h2> */}

                    <p className="panel-description">
                        Paste content to create a share
                    </p>

                    {/* STEP: typing */}
                    {step === "typing" && (
                        <>
                            <textarea
                                value={content}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                placeholder="Paste your content here..."
                                className="panel-input w-full min-h-48 flex-1 mt-4 p-4 focus:outline-none"

                            />

                            <button
                                onClick={handleSend}
                                className="panel-button button-share mt-4 px-4 py-2"
                            >
                                Send
                            </button>
                        </>
                    )}

                    {/* STEP: choice */}
                    {step === "choice" && (
                        <div className="choice-list mt-6 flex flex-col gap-4 w-full items-center">
                            <button
                                onClick={() => handleOptionClick("temporary")}
                                disabled={isSending}
                                className="panel-button button-temporary w-1/2 px-4 py-2"
                            >
                                {isSending ? "Saving..." : "Temporary Share"}
                            </button>

                            <button
                                onClick={() => handleOptionClick("permanent")}
                                disabled={isSending}
                                className="panel-button button-permanent w-1/2 px-4 py-2"
                            >
                                {isSending ? "Saving..." : "Permanent Save"}
                            </button>
                        </div>
                    )}

                    {/* STEP: success */}
                    {step === "success" && (
                        <div className="success-message mt-6 text-center">
                            <p className="font-semibold text-emerald-400">Message saved successfully!</p>
                            <p className="text-xl font-mono mt-2 tracking-widest bg-slate-800 py-2 px-4 rounded border border-slate-700 select-all">
                                {shareCode}
                            </p>
                        </div>
                    )}

                    {requestError && <div className="request-error mt-4 text-red-400">{requestError}</div>}
                </div>

                {/* RETRIEVE */}
                <div
                    onClick={() => setActive("retrieve")}
                    className={`flex p-5 flex-col items-center cursor-pointer transition-all duration-500 panel
                        ${active === "retrieve" ? "w-[70%]" : active === "share" ? "w-[30%]" : "w-1/2"}
                        panel-retrieve`}
                >
                    <div className="panel-icon">Retrieve</div>

                    <p className="panel-description">
                        Retrieve shared content
                    </p>

                    <input
                        type="text"
                        value={retrieveCode}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setRetrieveCode(e.target.value)}
                        placeholder="Enter 7-digit code (e.g. 0123456)"
                        className="panel-input w-full mt-4 p-3 rounded text-center tracking-widest font-mono focus:outline-none"
                    />

                    <button
                        onClick={handleRetrieve}
                        disabled={isRetrieving}
                        className="panel-button button-retrieve mt-4 px-4 py-2"
                    >
                        {isRetrieving ? "Retrieving..." : "Retrieve"}
                    </button>

                    {retrievedContent && (
                        <div className="retrieved-result mt-4 p-4 w-full bg-slate-900 rounded border border-slate-700 text-left">
                            <div className="text-xs uppercase font-semibold text-emerald-400 mb-1">
                                {retrievedType} Message
                            </div>
                            <div className="whitespace-pre-wrap break-words font-mono text-sm text-slate-200">
                                {retrievedContent}
                            </div>
                        </div>
                    )}

                    {retrieveError && <div className="request-error mt-4 text-red-400">{retrieveError}</div>}
                </div>

            </div>
        </main>
    );
}


export default Hero;
