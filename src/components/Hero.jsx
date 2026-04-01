import { useState } from "react";

function Hero() {
    const [active, setActive] = useState(null);
    const [content, setContent] = useState("");
    const [step, setStep] = useState("typing"); // typing | choice | success

    // Handle Send
    const handleSend = () => {
        if (!content.trim()) {
            alert("Please enter some content");
            return;
        }
        setStep("choice");
    };

    // Handle Option Click
    const handleOptionClick = (type) => {
        console.log("Selected:", type);
        setStep("success");
    };

    return (
        <div className="h-screen w-full bg-hero bg-cover bg-center flex flex-col items-center justify-center">

            <h1 className="mt-4 text-white text-5xl font-bold text-center">
                Welcome to My Online Clipboard
            </h1>

            <div className="m-4 w-[90vw] h-[80vh] bg-white rounded-lg shadow-md flex overflow-hidden">

                {/* SHARE */}
                <div
                    onClick={() => setActive("share")}
                    className={`flex flex-col items-center cursor-pointer transition-all duration-500
                        ${active === "share" ? "w-[70%]" : active === "retrieve" ? "w-[30%]" : "w-1/2"}
                        bg-blue-100 p-5`}
                >
                    <h1 className="text-2xl font-bold">Share</h1>

                    <p className="text-lg mt-2">
                        Share your clipboard content with others
                    </p>

                    {/* STEP: typing */}
                    {step === "typing" && (
                        <>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Paste your content here..."
                                className="w-full h-full mt-4 p-4 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"

                            />

                            <button
                                onClick={handleSend}
                                className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-blue-600 transition"
                            >
                                Send
                            </button>
                        </>
                    )}

                    {/* STEP: choice */}
                    {step === "choice" && (
                        <div className="mt-6 flex flex-col gap-4 w-full items-center">
                            <button
                                onClick={() => handleOptionClick("temporary")}
                                className="w-1/2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                            >
                                Temporary Share
                            </button>

                            <button
                                onClick={() => handleOptionClick("permanent")}
                                className="w-1/2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                                Permanent Save
                            </button>
                        </div>
                    )}

                    {/* STEP: success */}
                    {step === "success" && (
                        <div className="mt-6 text-green-700 font-semibold text-lg">
                            ✅ Content shared successfully!
                        </div>
                    )}
                </div>

                {/* RETRIEVE */}
                <div
                    onClick={() => setActive("retrieve")}
                    className={`flex p-5 flex-col items-center cursor-pointer transition-all duration-500
                        ${active === "retrieve" ? "w-[70%]" : active === "share" ? "w-[30%]" : "w-1/2"}
                        bg-green-200`}
                >
                    <h1 className="text-2xl font-bold">Retrieve</h1>

                    <p className="text-lg mt-2">
                        Retrieve clipboard content from others
                    </p>

                    <textarea
                        placeholder="Enter code to retrieve content..."
                        className="w-full h-full mt-4 p-4 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                        onClick={handleSend}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-green-900 transition">
                        Retrieve
                    </button>
                </div>

            </div>
        </div>
    );
}


export default Hero;
