interface QRCodeDisplayProps {
    qrCodeUrl: string;
    altText?: string;
}

export function QRCodeDisplay({ qrCodeUrl, altText = "QR Code to scan" }: QRCodeDisplayProps) {
    return (
        <div className="qr-wrapper inline-flex flex-col items-center">
            {/* QR Frame with corner brackets */}
            <div className="qr-box relative p-3.5 bg-white rounded-md shadow-sm">
                <span className="qr-corner corner-tl" />
                <span className="qr-corner corner-tr" />
                <span className="qr-corner corner-bl" />
                <span className="qr-corner corner-br" />

                <img
                    src={qrCodeUrl}
                    alt={altText}
                    className="qr-img w-32 h-32 sm:w-36 sm:h-36 object-contain block bg-white"
                />
            </div>

            {/* SCAN ME Badge */}
            <div className="scan-me-pill relative mt-2.5 bg-black text-white font-black text-xs tracking-wider uppercase px-3.5 py-1 rounded-sm shadow-md">
                <span className="scan-me-pointer" />
                SCAN ME
            </div>
        </div>
    );
}

export default QRCodeDisplay;
