// ================================================================ */
// UI MODULE - ULTRA OPTIMIZED WITH DRIVE IMAGE FIX                */
// ================================================================ */

// ================================================================ */
// SIGNATURE PAD ENGINE - LIGHTWEIGHT                              */
// ================================================================ */

class SignaturePadEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("❌ Canvas not found:", canvasId);
            return;
        }

        this.canvasId = canvasId;
        this.isDrawing = false;
        this.isLocked = true;
        this.ctx = this.canvas.getContext('2d');

        this._setupCanvas();
        this._bindEvents();

        console.log(`✅ Signature Pad "${canvasId}" initialized`);
    }

    _setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * ratio;
        this.canvas.height = rect.height * ratio;
        this.ctx.scale(ratio, ratio);

        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = '#1E1B4B';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    _getPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left),
            y: (clientY - rect.top)
        };
    }

    _startDrawing(e) {
        if (this.isLocked) return;
        if (e.cancelable !== false) e.preventDefault();

        const pos = this._getPosition(e);
        this.isDrawing = true;
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }

    _draw(e) {
        if (!this.isDrawing || this.isLocked) return;
        if (e.cancelable !== false) e.preventDefault();

        const pos = this._getPosition(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
    }

    _stopDrawing(e) {
        if (this.isLocked) return;
        if (e && e.cancelable !== false) e.preventDefault();

        this.isDrawing = false;
        this.ctx.closePath();
    }

    _bindEvents() {
        // Touch events
        this.canvas.addEventListener('touchstart', this._startDrawing.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this._draw.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this._stopDrawing.bind(this), { passive: false });
        this.canvas.addEventListener('touchcancel', this._stopDrawing.bind(this), { passive: false });

        // Mouse events
        this.canvas.addEventListener('mousedown', this._startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this._draw.bind(this));
        this.canvas.addEventListener('mouseup', this._stopDrawing.bind(this));
        this.canvas.addEventListener('mouseleave', this._stopDrawing.bind(this));

        this.canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        this.canvas.style.touchAction = 'none';
    }

    unlock() {
        this.isLocked = false;
        const wrapper = this.canvas.closest('.canvas-wrapper');
        if (wrapper) {
            wrapper.classList.add('unlocked');
            const overlay = wrapper.querySelector('.sig-lock-overlay');
            if (overlay) overlay.style.display = 'none';
        }
        this.canvas.style.cursor = 'crosshair';
        return this;
    }

    lock() {
        this.isLocked = true;
        const wrapper = this.canvas.closest('.canvas-wrapper');
        if (wrapper) {
            wrapper.classList.remove('unlocked');
            const overlay = wrapper.querySelector('.sig-lock-overlay');
            if (overlay) overlay.style.display = 'flex';
        }
        this.canvas.style.cursor = 'default';
        return this;
    }

    clear() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, rect.width * ratio, rect.height * ratio);
        this.isDrawing = false;
        return this;
    }

    isEmpty() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) return false;
        }
        return true;
    }

    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }
}

// ================================================================ */
// SIGNATURE PAD MANAGER - LIGHTWEIGHT                             */
// ================================================================ */

class SignaturePadManager {
    constructor() {
        this.pads = {};
    }

    getPad(id) {
        if (!this.pads[id]) {
            this.pads[id] = new SignaturePadEngine(id);
        }
        return this.pads[id];
    }

    initPad(id) {
        if (this.pads[id]) {
            try { this.pads[id].destroy(); } catch(e) {}
        }
        this.pads[id] = new SignaturePadEngine(id);
        return this.pads[id];
    }

    initAllPads() {
        const canvases = document.querySelectorAll('.signature-canvas');
        canvases.forEach(canvas => {
            this.getPad(canvas.id);
        });
    }
}

window.sigPadManager = new SignaturePadManager();

// ================================================================ */
// GLOBAL FUNCTIONS - LIGHTWEIGHT                                  */
// ================================================================ */

window.unlockSignaturePad = function(event) {
    let overlay = event;
    if (event.target) {
        overlay = event.target.closest('.sig-lock-overlay') || event.target;
    }

    const wrapper = overlay.closest('.canvas-wrapper');
    if (!wrapper) return;

    const canvas = wrapper.querySelector('.signature-canvas');
    if (!canvas) return;

    const pad = window.sigPadManager.getPad(canvas.id);
    if (pad) {
        pad.unlock();
        overlay.style.display = 'none';
        wrapper.classList.add('unlocked');
    }
};

window.unlockCanvas = window.unlockSignaturePad;

window.getCanvasBase64 = function(id) {
    const pad = window.sigPadManager.getPad(id);
    return pad ? pad.toDataURL() : null;
};

window.clearSignaturePad = function(id) {
    const pad = window.sigPadManager.getPad(id);
    if (pad) {
        pad.clear();
        pad.lock();
        const wrapper = pad.canvas.closest('.canvas-wrapper');
        if (wrapper) {
            const overlay = wrapper.querySelector('.sig-lock-overlay');
            if (overlay) overlay.style.display = 'flex';
            wrapper.classList.remove('unlocked');
        }
    }
};

window.initTransferSigPads = function() {
    window.sigPadManager.initPad('t_security_sig');
    window.sigPadManager.initPad('t_received_sig');
};

window.initVisitorCanvas = function() {
    window.sigPadManager.initPad('v-sig-pad');
};

// ================================================================ */
// LAUNCH VIDEO - OPTIMIZED                                        */
// ================================================================ */

window.handleLaunchVideo = function() {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');

    if (!overlay) return;
    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') {
        overlay.style.display = 'none';
        overlay.remove();
        return;
    }

    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';

    if (video) {
        video.play().catch(function() {
            setTimeout(function() { hideLaunchVideo(); }, 2000);
        });
        video.onended = function() { hideLaunchVideo(); };
        video.onerror = function() { hideLaunchVideo(); };
        setTimeout(function() {
            if (overlay.style.display !== 'none') { hideLaunchVideo(); }
        }, 4000);
    } else {
        setTimeout(function() { hideLaunchVideo(); }, 1000);
    }

    if (skipBtn) {
        skipBtn.onclick = function() { hideLaunchVideo(); };
    }
};

function hideLaunchVideo() {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    if (!overlay) return;
    if (video) { try { video.pause(); } catch(e) {} }
    sessionStorage.setItem('videoPlayedThisSession', 'true');
    overlay.style.opacity = '0';
    setTimeout(function() {
        overlay.style.display = 'none';
        overlay.remove();
    }, 300);
}

// ================================================================ */
// IMAGE HELPERS - FIXED DRIVE IMAGE URL                          */
// ================================================================ */

window.getDirectDriveImageUrl = function(url) {
    // ✅ FIX: Better handling of Drive URLs
    if (!url || url === 'N/A' || url === '-' || url === '' || url === 'undefined' || url === 'null') {
        return null;
    }

    // If it's already a valid image URL (starts with http and contains image)
    if (url.startsWith('http') && (url.includes('.jpg') || url.includes('.png') || url.includes('.jpeg') || url.includes('.gif') || url.includes('googleusercontent'))) {
        return url;
    }

    // If it's a base64 image
    if (url.startsWith('data:image')) {
        return url;
    }

    // 🔥 FIX: Extract file ID from various Google Drive URL formats
    let fileId = null;

    // Format 1: https://lh3.googleusercontent.com/d/FILE_ID
    let match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];

    // Format 2: https://drive.google.com/file/d/FILE_ID/view
    if (!fileId) {
        match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
    }

    // Format 3: ?id=FILE_ID
    if (!fileId) {
        match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
    }

    // Format 4: Direct file ID (25+ characters)
    if (!fileId) {
        match = url.match(/([a-zA-Z0-9_-]{25,})/);
        if (match) fileId = match[1];
    }

    // If we found a file ID, return the direct image URL
    if (fileId) {
        // Use the lh3.googleusercontent.com format (works reliably)
        return `https://lh3.googleusercontent.com/d/${fileId}`;
    }

    // If URL is already a valid Google Drive URL but we couldn't extract ID, try to use it directly
    if (url.includes('googleusercontent.com') || url.includes('drive.google.com')) {
        return url;
    }

    // Fallback: return null to trigger default avatar
    console.warn('⚠️ Could not process image URL:', url);
    return null;
};

// ✅ NEW: Get profile image with fallback
window.getProfileImage = function(url, name) {
    const processedUrl = window.getDirectDriveImageUrl(url);
    if (processedUrl) {
        return processedUrl;
    }
    // Return avatar placeholder with initials
    const displayName = name || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4f46e5&color=fff&size=128&font-size=0.5&bold=true`;
};

window.openImageZoom = function(url) {
    if (!url || url === 'null' || url === 'undefined' || url === '') {
        alert('No image available');
        return;
    }
    const processed = window.getDirectDriveImageUrl(url);
    if (processed) {
        window.open(processed, '_blank');
    } else {
        alert('Image URL is invalid or could not be loaded');
    }
};

window.compressImageFile = function(file, maxWidth, maxHeight, quality) {
    maxWidth = maxWidth || 800;
    maxHeight = maxHeight || 800;
    quality = quality || 0.7;

    return new Promise(function(resolve) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; }
                if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

// ================================================================ */
// INIT ON PAGE LOAD - FAST                                        */
// ================================================================ */

document.addEventListener('DOMContentLoaded', function() {
    // Init signature pads - use requestIdleCallback if available
    if (window.requestIdleCallback) {
        window.requestIdleCallback(function() {
            window.sigPadManager.initAllPads();
        });
    } else {
        setTimeout(function() {
            window.sigPadManager.initAllPads();
        }, 300);
    }

    // Launch video - defer
    setTimeout(function() {
        window.handleLaunchVideo();
    }, 100);
});

console.log("✅ ui_module.js loaded (DRIVE IMAGE FIXED)");