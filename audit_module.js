import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { FieldNormalizer } from './field_normalizer.js';

// ================================================================ */
// GLOBAL STATE & UTILITIES
// ================================================================ */

let transferPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";
let html5QrCode = null;
let currentScanTarget = null;
let isScannerStarting = false;
let isScannerRunning = false;

window.transferBatch = [];

// ================================================================ */
// SCANNER FUNCTIONS - COMPLETE FIX                                */
// ================================================================ */

window.startCameraScanner = function(target) {
    console.log("📷 Starting camera scanner for:", target);

    currentScanTarget = target;
    const modal = document.getElementById('scanner-modal');
    if (!modal) {
        console.error("❌ Scanner modal not found");
        alert("Scanner modal not found. Please refresh.");
        return;
    }

    // Show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // Get scanner container
    const container = document.getElementById('scanner-container');
    if (!container) {
        console.error("❌ Scanner container not found");
        alert("Scanner container not found.");
        modal.classList.add('hidden');
        modal.style.display = 'none';
        return;
    }

    // Clear previous scanner
    if (html5QrCode) {
        try {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                html5QrCode = null;
            }).catch(() => {});
        } catch(e) {}
    }

    // Create new scanner
    try {
        html5QrCode = new Html5Qrcode("scanner-container");

        const config = {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            function(decodedText, decodedResult) {
                console.log("✅ Barcode scanned:", decodedText);
                onScanSuccess(decodedText);
            },
            function(errorMessage) {
                // Ignore errors - scanning continues
            }
        ).then(() => {
            isScannerRunning = true;
            console.log("✅ Scanner started successfully");
        }).catch(function(err) {
            console.error("❌ Failed to start scanner:", err);
            alert("Camera access denied. Please allow camera permission and try again.\n\nError: " + err.message);
            modal.classList.add('hidden');
            modal.style.display = 'none';
            html5QrCode = null;
        });

    } catch (error) {
        console.error("❌ Scanner initialization error:", error);
        alert("Failed to initialize camera: " + error.message);
        modal.classList.add('hidden');
        modal.style.display = 'none';
        html5QrCode = null;
    }
};

// ================================================================ */
// SCAN SUCCESS HANDLER                                             */
// ================================================================ */

function onScanSuccess(decodedText) {
    console.log("📥 Scan result:", decodedText);

    // Stop scanner
    if (html5QrCode && isScannerRunning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            isScannerRunning = false;
        }).catch(() => {
            html5QrCode = null;
            isScannerRunning = false;
        });
    }

    // Hide modal
    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }

    // Process the scanned barcode
    const barcode = decodedText.trim().toUpperCase();

    if (currentScanTarget) {
        const targetInput = document.getElementById(currentScanTarget);
        if (targetInput) {
            targetInput.value = barcode;
            // Trigger input event
            targetInput.dispatchEvent(new Event('input'));
            targetInput.dispatchEvent(new Event('change'));
        }

        // Handle specific targets
        if (currentScanTarget === 'f1_asset_barcode') {
            window.fetchAuditAssetDetails(barcode);
        } else if (currentScanTarget === 'f1_disposal_barcode_input') {
            window.fetchDisposalAssetDetails(barcode);
        } else if (currentScanTarget === 't_asset_barcode') {
            // For asset transfer, trigger add to batch or just fill input
            const input = document.getElementById('t_asset_barcode');
            if (input) {
                input.value = barcode;
                // Optionally auto-add to batch
                setTimeout(function() {
                    if (window.addAssetToBatch) {
                        window.addAssetToBatch();
                    }
                }, 500);
            }
        } else if (currentScanTarget === 'f2_serial_no') {
            // Just fill the input
        } else if (currentScanTarget === 'f21_room_no') {
            // Just fill the input
        } else if (currentScanTarget === 'f22_room_barcode') {
            // Just fill the input
        }
    }

    // Reset target
    currentScanTarget = null;
}

// ================================================================ */
// STOP CAMERA SCANNER                                              */
// ================================================================ */

window.stopCameraScanner = function() {
    console.log("🛑 Stopping camera scanner");

    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }

    if (html5QrCode && isScannerRunning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            isScannerRunning = false;
            console.log("✅ Scanner stopped");
        }).catch(() => {
            html5QrCode = null;
            isScannerRunning = false;
        });
    }

    currentScanTarget = null;
};

// ================================================================ */
// TOGGLE FLASH - Optional                                          */
// ================================================================ */

window.toggleScannerFlash = function() {
    const btn = document.getElementById('flashBtn');
    if (!btn) return;

    const isOn = btn.dataset.flash === 'on';
    btn.dataset.flash = isOn ? 'off' : 'on';
    btn.innerHTML = isOn ? '<i class="fa fa-bolt"></i>' : '<i class="fa fa-bolt" style="color: #fbbf24;"></i>';

    if (html5QrCode) {
        try {
            html5QrCode.applyVideoConstraints({
                facingMode: "environment",
                torch: !isOn
            });
        } catch(e) {
            console.warn("Flash toggle not supported:", e);
        }
    }
};

// ================================================================ */
// GALLERY SCANNER - Optional                                       */
// ================================================================ */

window.openGalleryScanner = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            const img = new Image();
            img.onload = function() {
                // Use Html5Qrcode to decode from image
                if (html5QrCode) {
                    html5QrCode.scanFile(file, true)
                        .then(function(decodedText) {
                            console.log("✅ Decoded from image:", decodedText);
                            onScanSuccess(decodedText);
                        })
                        .catch(function(err) {
                            console.error("❌ Failed to decode image:", err);
                            alert("No barcode found in the selected image.");
                        });
                } else {
                    alert("Scanner not initialized.");
                }
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

// ================================================================ */
// REST OF THE FUNCTIONS - (Previous code continues)                */
// ================================================================ */

// ... (rest of your existing functions remain the same)

console.log("✅ audit_module.js loaded (SCANNER FIXED)");