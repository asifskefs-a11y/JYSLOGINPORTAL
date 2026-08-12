/**
 * ASSET MANAGEMENT & SCANNER ENGINE (v4.5 STANDALONE)
 * ---------------------------------------------------------------
 * HIGH-SPEED QR/BARCODE SCANNING WITH TORCH & GALLERY SUPPORT
 * ---------------------------------------------------------------
 */

window.currentScanTarget = null;
window.html5QrCode = null;
window.isTorchOn = false;

/**
 * INITIALIZE CAMERA SCANNER
 * @param {string} targetInputId - ID of the input field to receive scanned data
 */
window.startCameraScanner = async (targetInputId) => {
    window.currentScanTarget = targetInputId;
    const modal = document.getElementById('scannerModal');

    if (!modal) {
        console.error("❌ Scanner Modal (#scannerModal) not found in DOM.");
        return alert("Scanner UI Error: Modal container missing.");
    }

    // Show Modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // Cleanup & Prepare Viewport
    const viewport = document.getElementById('interactive');
    if (viewport) viewport.innerHTML = '';

    // Safety: Stop any running instance
    if (window.html5QrCode) {
        try { await window.html5QrCode.stop(); } catch(e) {}
    }

    try {
        window.html5QrCode = new Html5Qrcode("interactive");

        const config = {
            fps: 25,                // Ultra-fast warehouse-style detection
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,       // Strict 1:1 Aspect Ratio
            disableFlip: true       // Prevent rendering glitches on some mobile browsers
        };

        await window.html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                const result = decodedText.toUpperCase().trim();
                const inputEl = document.getElementById(window.currentScanTarget);

                if (inputEl) {
                    inputEl.value = result;
                    // Force update for any listeners
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Module Fallbacks
                if (window.fetchAuditAssetDetails) window.fetchAuditAssetDetails(result);
                if (window.fetchDisposalAssetDetails) window.fetchDisposalAssetDetails(result);
                if (window.addAssetToBatch) window.addAssetToBatch();

                window.stopCameraScanner();
                if (window.triggerSuccessPopup) window.triggerSuccessPopup("Code Scanned! ✅");
            }
        );

        console.log("📷 Scanner started successfully.");
        window.isTorchOn = false; // Reset torch state on start

    } catch (err) {
        console.error("❌ Camera Start Error:", err);
        alert("Camera Access Denied or Error: " + err.message);
        window.stopCameraScanner();
    }
};

/**
 * STOP SCANNER & HIDE UI
 */
window.stopCameraScanner = async () => {
    const modal = document.getElementById('scannerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }

    if (window.html5QrCode) {
        try {
            await window.html5QrCode.stop();
            window.html5QrCode = null;
        } catch (e) {
            console.warn("⚠️ Scanner stopped with warning:", e);
        }
    }
};

/**
 * TOGGLE DEVICE TORCH / FLASHLIGHT
 */
window.toggleScannerTorch = async () => {
    if (!window.html5QrCode) return;
    try {
        window.isTorchOn = !window.isTorchOn;
        await window.html5QrCode.applyVideoConstraints({
            advanced: [{ torch: window.isTorchOn }]
        });

        // Update UI Button if exists
        const btn = document.getElementById('scanner-torch-btn');
        if (btn) {
            const iconBox = btn.querySelector('div');
            if (iconBox) {
                iconBox.className = window.isTorchOn
                    ? 'w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center transition-all'
                    : 'w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center transition-all';
            }
        }
    } catch (e) {
        console.error("🔦 Torch Error:", e);
        alert("Flashlight not supported on this device/browser.");
    }
};

/**
 * SCAN FROM IMAGE (GALLERY)
 */
window.scanQRFromImage = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.html5QrCode) {
        window.html5QrCode = new Html5Qrcode("interactive");
    }

    if (window.showGlobalSpinner) window.showGlobalSpinner("Analyzing Image...");

    try {
        const result = await window.html5QrCode.scanFile(file, true);
        const code = result.toUpperCase().trim();
        const input = document.getElementById(window.currentScanTarget);

        if (input) {
            input.value = code;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Post-scan triggers
        if (window.fetchAuditAssetDetails) window.fetchAuditAssetDetails(code);
        if (window.addAssetToBatch) window.addAssetToBatch();

        window.stopCameraScanner();
        if (window.triggerSuccessPopup) window.triggerSuccessPopup("Image Scanned Successfully! ✅");

    } catch (err) {
        console.error("❌ Gallery Scan Error:", err);
        alert("No valid QR/Barcode found in this image.");
    } finally {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        event.target.value = ""; // Reset input
    }
};

console.log("✅ asset_management.js loaded (Global Scanner Engine)");
