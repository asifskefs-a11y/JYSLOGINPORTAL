import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// DYNAMIC GOOGLE DRIVE SYNC ENGINE                                 */
// ================================================================ */

window.uploadToDrive = async (payload) => {
    try {
        const config = await window.driveConfigCache.getConfig();
        if (!config || !config.url) throw new Error('Drive URL not configured.');

        // Construct EXACT JSON Payload as requested
        const uploadPayload = {
            image: payload.image,
            folderCategory: payload.category || payload.folderCategory || 'DEFAULT',
            filename: payload.fileName || payload.filename || `upload_${Date.now()}.png`,
            action: 'upload',
            timestamp: Date.now(),
            ...payload.metadata
        };

        const response = await fetch(config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(uploadPayload),
            mode: 'cors'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        const fileUrl = result.fileUrl || result.url || result.signatureUrl || null;
        if (fileUrl) return { status: 'success', fileUrl };

        if (result.fileId || result.id) {
            return { status: 'success', fileUrl: `https://lh3.googleusercontent.com/d/${result.fileId || result.id}` };
        }

        throw new Error(result.message || 'No URL returned from Drive Sync');
    } catch (error) {
        console.error('❌ Sync Error:', error);
        return { status: 'error', message: error.message };
    }
};

window.uploadToDriveWithRetry = async (payload, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        const res = await window.uploadToDrive(payload);
        if (res.status === 'success') return res;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    return { status: 'error', message: 'All retry attempts failed' };
};

// ================================================================ */
// SIGNATURE PAD ENGINE (PREMIUM v3.5.5)                            */
// ================================================================ */
class SignaturePadEngine {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.isLocked = true;
        this.options = { lineWidth: 3, strokeColor: '#1E1B4B', backgroundColor: '#FFFFFF', ...options };
        this._setupCanvas();
        this._bindEvents();
    }
    _setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * ratio;
        this.canvas.height = rect.height * ratio;
        this.ctx.scale(ratio, ratio);
        this.ctx.lineWidth = this.options.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.options.strokeColor;
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, rect.width, rect.height);
    }
    _getPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    _startDrawing(e) {
        if (this.isLocked) return;
        if (e.cancelable) e.preventDefault();
        const pos = this._getPosition(e);
        this.isDrawing = true;
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }
    _draw(e) {
        if (!this.isDrawing || this.isLocked) return;
        if (e.cancelable) e.preventDefault();
        const pos = this._getPosition(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
    }
    _stopDrawing() { if (this.isDrawing) { this.isDrawing = false; this.ctx.closePath(); } }
    _bindEvents() {
        this.canvas.addEventListener('pointerdown', this._startDrawing.bind(this));
        this.canvas.addEventListener('pointermove', this._draw.bind(this));
        this.canvas.addEventListener('pointerup', this._stopDrawing.bind(this));
        this.canvas.addEventListener('pointerleave', this._stopDrawing.bind(this));
        this.canvas.style.touchAction = 'none';
    }
    unlock() { this.isLocked = false; return this; }
    lock() { this.isLocked = true; return this; }
    clear() {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, rect.width, rect.height);
    }
    toDataURL() { return this.canvas.toDataURL("image/png"); }
}

class SignaturePadManager {
    constructor() { this.pads = new Map(); }
    getPad(id) {
        if (!this.pads.has(id)) this.pads.set(id, new SignaturePadEngine(id));
        return this.pads.get(id);
    }
}
window.sigPadManager = new SignaturePadManager();
window.getCanvasBase64 = (id) => window.sigPadManager.getPad(id).toDataURL();
window.clearSignaturePad = (id) => { const pad = window.sigPadManager.getPad(id); pad.clear(); pad.lock(); };
window.unlockCanvas = (el) => { const canvas = el.closest('.canvas-wrapper').querySelector('canvas'); window.sigPadManager.getPad(canvas.id).unlock(); el.style.display = 'none'; };
window.initVisitorCanvas = () => window.sigPadManager.getPad('v-sig-pad');

// ================================================================ */
// MEDIA RENDERING & FALLBACKS                                      */
// ================================================================ */

window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl || driveUrl === 'N/A' || driveUrl === '-') return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    if (driveUrl.startsWith('data:image')) return driveUrl;
    let fileId = null;
    const match = driveUrl.match(/\/file\/d\/([^\/]+)/) || driveUrl.match(/[?&]id=([^&]+)/) || driveUrl.match(/([a-zA-Z0-9_-]{25,})/);
    if (match) fileId = match[1];
    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : driveUrl;
};

window.formatDriveImageUrl = window.getDirectDriveImageUrl;
window.openImageZoom = (url) => { if(!url || url.includes('placeholder')) return; window.open(url, '_blank'); };

// ================================================================ */
// COMPRESSION & IMAGE HELPERS                                      */
// ================================================================ */

window.compressImageFile = async (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

// ================================================================ */
// APP LAUNCH VIDEO LOGIC                                           */
// ================================================================ */
window.handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');
    if (!overlay || !video) return;
    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') { overlay.remove(); return; }
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    let hasHidden = false;
    const hideOverlay = () => {
        if (hasHidden) return;
        hasHidden = true;
        sessionStorage.setItem('videoPlayedThisSession', 'true');
        overlay.style.transition = 'opacity 0.8s ease-out';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 800);
    };
    const safetyTimeout = setTimeout(hideOverlay, 4500);
    video.onended = hideOverlay;
    if (skipBtn) skipBtn.onclick = hideOverlay;
    video.play().catch(hideOverlay);
};

document.addEventListener('DOMContentLoaded', window.handleLaunchVideo);
window.addEventListener('load', () => { setTimeout(() => { const o = document.getElementById('launchVideoOverlay'); if(o) o.remove(); }, 5000); });
