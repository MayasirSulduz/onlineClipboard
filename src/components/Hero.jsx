import React from "react";

function Hero() {
    return (
        <div className="h-screen w-full bg-hero bg-cover bg-center text-center flex flex-col items-center justify-center">
            <h1 className="mt-4 text-white text-5xl font-bold">
                Welcome to My Online Clipboard
            </h1>

            <div className="m-4 w-[90vw] h-[90vh] bg-white rounded-lg shadow-md flex items-center justify-center">
                <h1 className="">Share</h1>
                {/* <div className="m-[2px] w-[90%] h-[90%] bg-gray-100 rounded-lg shadow-md flex items-center justify-center">

                </div> */}

            </div>

        </div>
    )

}

export default Hero;
  