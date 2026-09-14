import { db } from './firebase_config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ✅ MASTER STAFF POSITIONS & ROLES - Moved to image_processor.js (Synchronous)
// ================================================================ */


// ================================================================ */
// ✅ XSS PROTECTION UTILITY                                        */
// ================================================================ */
window.escapeHTML = function(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return String(value);

    return value.replace(/[&<>"'`=\/]/g, function(match) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '`': '&#96;',
            '=': '&#61;',
            '/': '&#47;'
        };
        return escapeMap[match];
    });
};
window.escapeHtml = window.escapeHTML;


// ================================================================ */
// ✅ SMART STORAGE MANAGEMENT UTILITY                              */
// ================================================================ */
window.purgeOldImageCache = function() {
    try {
        const cacheKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('jys_img_cache_')) {
                cacheKeys.push(key);
            }
        }

        if (cacheKeys.length === 0) {
            console.warn("⚠️ No image cache entries to purge.");
            return 0;
        }

        const purgeCount = Math.max(5, Math.ceil(cacheKeys.length * 0.3));
        let purged = 0;

        for (let i = 0; i < purgeCount && i < cacheKeys.length; i++) {
            try {
                localStorage.removeItem(cacheKeys[i]);
                purged++;
            } catch (e) {}
        }

        console.log(`🧹 Purged ${purged} old image cache entries to free LocalStorage.`);
        return purged;
    } catch (e) {
        console.error("❌ purgeOldImageCache error:", e);
        return 0;
    }
};


// ================================================================ */
// WHATSAPP-STYLE TOAST ENGINE (FIXED v4.2)                        */
// ================================================================ */

window.showWhatsAppToast = (title, message, type = 'info') => {
    let container = document.getElementById('toast-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-notification-container';
        container.className = 'fixed top-4 right-4 z-[9999999] flex flex-col gap-3 max-w-sm w-full pointer-events-none';
        container.style.maxHeight = '80vh';
        container.style.overflowY = 'auto';
        document.body.appendChild(container);
    }

    while (container.children.length >= 3) {
        if (container.firstChild) {
            container.firstChild.remove();
        }
    }

    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'border-red-500' :
                    type === 'warning' ? 'border-amber-500' :
                    'border-emerald-500';
    const iconColor = type === 'error' ? 'text-red-400' :
                     type === 'warning' ? 'text-amber-400' :
                     'text-emerald-400';
    const icon = type === 'error' ? 'fa-circle-exclamation' :
                type === 'warning' ? 'fa-triangle-exclamation' :
                'fa-bell';

    const safeTitle = window.escapeHTML(title);
    const safeMessage = window.escapeHTML(message);

    toast.className = `pointer-events-auto bg-slate-900/95 border-l-4 ${bgColor} text-white p-4 rounded-xl shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-x-full flex flex-col gap-1`;
    toast.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="font-bold text-xs uppercase tracking-wider ${iconColor} flex items-center gap-2">
                <i class="fa-solid ${icon} animate-bounce"></i> ${safeTitle}
            </span>
            <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white text-xs">&times;</button>
        </div>
        <p class="text-xs text-slate-200 mt-1">${safeMessage}</p>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.classList.remove('translate-x-full'), 50);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
};

window.showNotification = window.showWhatsAppToast;

// ================================================================ */
// SIGNATURE PAD ENGINE (FIXED v4.3)                               */
// ================================================================ */

class SignaturePadEngine {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        this.ctx = null;
        this.isDrawing = false;
        this.hasDrawn = false;
        this.isLocked = true;
        this.lastPos = { x: 0, y: 0 };
        this._handlers = {};

        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this._setupCanvas();
        }
    }

    _setupCanvas() {
        if (!this.canvas || !this.canvas.offsetParent) return;

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;

        if (width > 0 && height > 0) {
            this.canvas.width = width * ratio;
            this.canvas.height = height * ratio;
            this.ctx.resetTransform();
            this.ctx.scale(ratio, ratio);

            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = '#1E1B4B';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillRect(0, 0, width, height);
            this.hasDrawn = false;
        }
    }

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    _handleStart(e) {
        if (this.isLocked) return;
        if (e.type === 'touchstart') e.preventDefault();
        this.isDrawing = true;
        this.hasDrawn = true;
        this.lastPos = this._getPos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastPos.x, this.lastPos.y);
    }

    _handleMove(e) {
        if (!this.isDrawing || this.isLocked) return;
        if (e.type === 'touchmove') e.preventDefault();
        const currentPos = this._getPos(e);
        this.ctx.lineTo(currentPos.x, currentPos.y);
        this.ctx.stroke();
        this.lastPos = currentPos;
    }

    _handleEnd() {
        if (this.isDrawing) {
            this.ctx.closePath();
            this.isDrawing = false;
        }
    }

    unlock() {
        if (!this.canvas) return;
        this.lock();

        this._handlers.start = this._handleStart.bind(this);
        this._handlers.move = this._handleMove.bind(this);
        this._handlers.end = this._handleEnd.bind(this);

        this.canvas.addEventListener('mousedown', this._handlers.start);
        this.canvas.addEventListener('mousemove', this._handlers.move);
        window.addEventListener('mouseup', this._handlers.end);

        this.canvas.addEventListener('touchstart', this._handlers.start, { passive: false });
        this.canvas.addEventListener('touchmove', this._handlers.move, { passive: false });
        this.canvas.addEventListener('touchend', this._handlers.end, { passive: false });

        this.canvas.style.touchAction = 'none';
        this.canvas.style.pointerEvents = 'auto';
        this.isLocked = false;
        this._setupCanvas();
    }

    lock() {
        if (this._handlers.start) {
            this.canvas.removeEventListener('mousedown', this._handlers.start);
            this.canvas.removeEventListener('mousemove', this._handlers.move);
            window.removeEventListener('mouseup', this._handlers.end);
            this.canvas.removeEventListener('touchstart', this._handlers.start);
            this.canvas.removeEventListener('touchmove', this._handlers.move);
            this.canvas.removeEventListener('touchend', this._handlers.end);
        }
        this.isLocked = true;
        this.isDrawing = false;
    }

    toggleFullScreen() {
        if (!this.canvas) return;
        const wrapper = this.canvas.closest('.canvas-wrapper');
        if (!wrapper) return;

        const isEntering = !wrapper.classList.contains('sig-full-screen');
        const dataUrl = this.canvas.toDataURL();
        const wasEmpty = this.isEmpty();

        if (isEntering) {
            this._originalParent = wrapper.parentElement;
            this._originalNextSibling = wrapper.nextSibling;

            document.body.appendChild(wrapper);
            wrapper.classList.add('sig-full-screen');
            document.body.style.overflow = 'hidden';
            if (this.isLocked) this.unlock();
        } else {
            wrapper.classList.remove('sig-full-screen');
            if (this._originalParent) {
                this._originalParent.insertBefore(wrapper, this._originalNextSibling);
            }
            document.body.style.overflow = '';
        }

        setTimeout(() => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            const width = isEntering ? window.innerWidth : wrapper.clientWidth;
            const height = isEntering ? window.innerHeight : wrapper.clientHeight;

            if (width > 0 && height > 0) {
                const targetWidth = isEntering ? width - 40 : width;
                const targetHeight = isEntering ? height - 120 : height;

                this.canvas.width = targetWidth * ratio;
                this.canvas.height = targetHeight * ratio;

                this.ctx.resetTransform();
                this.ctx.scale(ratio, ratio);

                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = '#1E1B4B';
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillRect(0, 0, targetWidth, targetHeight);

                if (!wasEmpty) {
                    const img = new Image();
                    img.onload = () => {
                        this.ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                        this.hasDrawn = true;
                    };
                    img.src = dataUrl;
                }
            }
        }, 150);
    }

    clear() {
        this._setupCanvas();
    }

    isEmpty() {
        return !this.hasDrawn;
    }

    toDataURL() {
        return this.canvas ? this.canvas.toDataURL("image/png") : null;
    }
}

class SignaturePadManager {
    constructor() {
        this.pads = new Map();
    }

    getPad(id) {
        if (!this.pads.has(id)) {
            const pad = new SignaturePadEngine(id);
            this.pads.set(id, pad);
        }
        return this.pads.get(id);
    }
}

window.sigPadManager = new SignaturePadManager();
window.getCanvasBase64 = (id) => window.sigPadManager.getPad(id).toDataURL();

window.clearSignaturePad = (id) => {
    const pad = window.sigPadManager.getPad(id);
    if (pad) {
        pad.clear();
        pad.unlock();
    }
};

window.unlockCanvas = (el, event) => {
    console.log("🔓 unlockCanvas Triggered", el);

    if (event) {
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }

    const wrapper = el.closest('.canvas-wrapper') || el.parentElement;
    if (!wrapper) {
        console.error("❌ unlockCanvas: Wrapper not found");
        return;
    }

    const canvas = wrapper.querySelector('canvas');
    const overlay = wrapper.querySelector('.sig-lock-overlay') || el;

    if (!canvas) {
        console.error("❌ unlockCanvas: Canvas not found");
        return;
    }

    wrapper.classList.add('unlocked');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.visibility = 'hidden';
        overlay.style.pointerEvents = 'none';
        overlay.classList.add('hidden');
    }

    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'none';
    canvas.style.zIndex = '50';

    if (window.sigPadManager && canvas.id) {
        const pad = window.sigPadManager.getPad(canvas.id);
        if (pad) {
            pad.unlock();
            setTimeout(() => {
                if (typeof pad._setupCanvas === 'function') pad._setupCanvas();
            }, 50);
        }
    } else {
        console.warn("⚠️ sigPadManager not ready or canvas has no ID:", canvas.id);
    }
};

window.initVisitorCanvas = () => window.sigPadManager.getPad('v-sig-pad');

// ================================================================ */
// ASSET PREVIEW MODAL (FIXED v4.3 - XSS SAFE)                     */
// ================================================================ */

window.openAssetPreviewModal = function(assetData) {
    if (!assetData) return;

    let modal = document.getElementById('asset-details-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'asset-details-preview-modal';
        modal.className = 'fixed inset-0 bg-black/80 z-[999999] hidden items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(modal);
    }

    let data = assetData;
    if (typeof assetData === 'string') {
        try {
            data = JSON.parse(decodeURIComponent(assetData));
        } catch (e) {
            try {
                data = JSON.parse(assetData);
            } catch (err) {
                console.error("❌ Invalid assetData format:", err);
                return;
            }
        }
    }

    const rawPhoto = data.photoUrl || data.imageUrl || data.photoURL || data.auditPhoto || data.photo || data["AUDIT PHOTO"] || data.transferPhotoUrl || data.disposalPhotoUrl;
    const rawBarcode = data.barcode || data.assetBarcode || data["ASSET BARCODE"] || data.id || 'N/A';
    const rawDesc = data.description || data.assetDescription || data.assetName || data["ASSET DESCRIPTION"] || data.name || 'N/A';
    const rawCategory = data.category || data["CATEGORY"] || 'N/A';
    const rawBuilding = data.building || data.schoolBuildingName || data["SCHOOL BUILDING NAME"] || 'N/A';
    const rawLocation = data.location || data.locationName || data["LOCATION NAME"] || data.roomName || 'N/A';
    const rawStatus = data.assetStatus || data.status || data["STATUS"] || 'Active';

    const hasMovement = data.collector || data.destination || data.performedBy || data.collectorName;

    const photo = rawPhoto;
    const safePhotoUrl = photo ? window.escapeHTML(photo) : '';
    const barcode = window.escapeHTML(rawBarcode);
    const desc = window.escapeHTML(rawDesc);
    const category = window.escapeHTML(rawCategory);
    const building = window.escapeHTML(rawBuilding);
    const location = window.escapeHTML(rawLocation);
    const status = window.escapeHTML(rawStatus);
    const action = window.escapeHTML(data.action || 'Detailed Record');

    const collector = window.escapeHTML(data.collector || data.collectorName || '-');
    const destination = window.escapeHTML(data.destination || data.destinationLocation || '-');
    const staffName = window.escapeHTML(data.staff || data.staffName || data.performedBy || '-');
    const company = window.escapeHTML(data.company || data.companyName || '-');
    const serialNo = window.escapeHTML(data.serialNo || data.assetSerial || '-');
    const roomNo = window.escapeHTML(data.roomNo || data.roomNumber || '-');
    const floorNo = window.escapeHTML(data.floorNo || '-');
    const vendor = window.escapeHTML(data.vendor || data.assetVendor || data.assetVendorName || '-');
    const condition = window.escapeHTML(data.condition || data.assetCondition || 'Good');

    modal.innerHTML = `
        <div class="bg-indigo-950 border border-white/10 rounded-[2.5rem] p-8 max-w-lg w-full text-white space-y-6 shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center border-b border-white/5 pb-5 shrink-0">
                <div class="flex flex-col">
                    <h3 class="text-xl font-black text-amber-400 uppercase tracking-tight">📦 Asset History</h3>
                    <span class="text-[8px] font-black text-white/40 uppercase tracking-widest mt-0.5">${action}</span>
                </div>
                <button onclick="window.closeAssetPreviewModal()" class="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors text-2xl font-bold">×</button>
            </div>

            <div class="space-y-6 text-xs overflow-y-auto pr-2 custom-scrollbar flex-1">
                <div class="relative group">
                    ${(rawPhoto && rawPhoto !== 'N/A' && rawPhoto !== '-') ? `
                        <img src="${window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photo) : safePhotoUrl}" class="w-full h-48 object-cover rounded-3xl border border-white/10 shadow-inner cursor-pointer" onclick="window.openImageZoom('${safePhotoUrl}')"/>
                    ` : `
                        <div class="w-full h-32 bg-white/5 rounded-3xl flex flex-col items-center justify-center text-white/20 border-2 border-dashed border-white/5">
                            <i class="fa-solid fa-image text-3xl mb-2"></i>
                            <span class="font-black uppercase tracking-widest text-[8px]">No Photo Available</span>
                        </div>
                    `}
                </div>

                ${hasMovement ? `
                <div class="space-y-3 bg-white/5 p-4 rounded-3xl border border-white/10">
                    <h4 class="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-3">Movement Details</h4>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Collector</span>
                            <p class="font-bold text-white">${collector}</p>
                        </div>
                        <div class="space-y-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Destination</span>
                            <p class="font-bold text-white truncate">${destination}</p>
                        </div>
                        <div class="space-y-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Staff / Initiator</span>
                            <p class="font-bold text-white truncate">${staffName}</p>
                        </div>
                        <div class="space-y-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Company</span>
                            <p class="font-bold text-white truncate">${company}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 pt-3 mt-3 border-t border-white/5">
                        <div class="space-y-2">
                             <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Security Sig</span>
                             ${data.securitySig ? `<img src="${window.escapeHTML(data.securitySig)}" class="h-12 bg-white rounded-lg p-1 mx-auto" onclick="window.openImageZoom('${window.escapeHTML(data.securitySig)}')">` : `<div class="h-12 flex items-center justify-center text-white/10 italic text-[8px]">N/A</div>`}
                        </div>
                        <div class="space-y-2">
                             <span class="text-white/40 uppercase font-black tracking-widest text-[7px]">Receiver Sig</span>
                             ${(data.receivedSig || data.receiverSig) ? `<img src="${window.escapeHTML(data.receivedSig || data.receiverSig)}" class="h-12 bg-white rounded-lg p-1 mx-auto" onclick="window.openImageZoom('${window.escapeHTML(data.receivedSig || data.receiverSig)}')">` : `<div class="h-12 flex items-center justify-center text-white/10 italic text-[8px]">N/A</div>`}
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="space-y-3">
                    <h4 class="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Asset Information</h4>
                    <div class="grid grid-cols-1 gap-3">
                        <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center gap-4">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[8px] shrink-0">Asset Tag</span>
                            <span class="font-bold text-white font-mono">${barcode}</span>
                        </div>
                        <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Description</span>
                            <span class="font-bold text-white text-xs leading-relaxed">${desc}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Category</span>
                                <span class="font-bold text-white truncate">${category}</span>
                            </div>
                            <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Serial No</span>
                                <span class="font-bold text-white truncate">${serialNo}</span>
                            </div>
                        </div>
                        <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                            <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Current Building & Location</span>
                            <span class="font-bold text-white truncate">${building} • ${location}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                             <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Room / Floor</span>
                                <span class="font-bold text-white">${roomNo} / ${floorNo}</span>
                            </div>
                            <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Vendor</span>
                                <span class="font-bold text-white truncate">${vendor}</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Condition</span>
                                <span class="font-bold text-emerald-400">${condition}</span>
                            </div>
                            <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-1 text-center">
                                <span class="text-white/40 uppercase font-black tracking-widest text-[8px] mb-1">Status</span>
                                <span class="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg font-black uppercase tracking-widest text-[7px] border border-amber-500/30">${status}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <button onclick="window.closeAssetPreviewModal()" class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-500/20 shrink-0">Close Record</button>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeAssetPreviewModal = function() {
    const modal = document.getElementById('asset-details-preview-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// ================================================================ */
// GLOBAL LOADING SPINNER (FIXED v4.3)                             */
// ================================================================ */

let spinnerTimeout = null;
let spinnerActive = false;

window.showGlobalSpinner = (message = "Loading...") => {
    let spinner = document.getElementById('universal-logo-loader');

    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'universal-logo-loader';
        spinner.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 99999999; flex-direction: column; align-items: center; justify-content: center;';
        spinner.innerHTML = `
            <div class="checkin-loader-overlay relative flex items-center justify-center">
                <img src="schoollogo.png" class="loader-center-logo logo-pulse-anim w-24 h-24 object-contain relative z-10" alt="JYS" onerror="this.src='jys_Icon.png'">
                <div class="spinner-ring absolute inset-[-20px] border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
            <p id="universal-loader-text" style="color: #ffffff; font-weight: 800; margin-top: 32px; font-family: 'Poppins', sans-serif; letter-spacing: 2px; text-transform: uppercase; font-size: 14px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${window.escapeHTML(message)}</p>
        `;
        document.body.appendChild(spinner);

        if (!document.getElementById('spinner-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-pulse-style';
            style.textContent = `
                @keyframes logoPulseScale {
                    0% { transform: scale(0.85); opacity: 0.7; }
                    50% { transform: scale(1.15); opacity: 1; }
                    100% { transform: scale(0.85); opacity: 0.7; }
                }
                .logo-pulse-anim { animation: logoPulseScale 1.2s ease-in-out infinite !important; will-change: transform, opacity; }
                .spinner-ring { width: 140px; height: 140px; }
            `;
            document.head.appendChild(style);
        }
    }

    const spText = document.getElementById('universal-loader-text');
    if (spText && message) spText.innerText = message;

    spinner.style.display = 'flex';
    spinnerActive = true;

    if (spinnerTimeout) clearTimeout(spinnerTimeout);
    spinnerTimeout = setTimeout(() => {
        if (spinnerActive) {
            window.hideGlobalSpinner();
        }
    }, 15000);
};

window.hideGlobalSpinner = () => {
    const spinner = document.getElementById('universal-logo-loader');
    if (spinner) {
        spinner.style.display = 'none';
        spinner.classList.add('hidden');
        spinnerActive = false;
    }
    if (spinnerTimeout) {
        clearTimeout(spinnerTimeout);
        spinnerTimeout = null;
    }
};

window.showLoader = window.showGlobalSpinner;
window.hideLoader = window.hideGlobalSpinner;

// ================================================================ */
// AVATAR GENERATOR (FIXED v4.3)                                   */
// ================================================================ */

window.generateLocalAvatar = function(name, background = "4f46e5", color = "fff") {
    try {
        if (!name) name = "User";

        const cleanBg = String(background).replace('#', '');
        const cleanColor = String(color).replace('#', '');

        const initials = name.trim().split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase();

        if (!initials) {
            return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="100%" height="100%" fill="#4f46e5"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="50" font-weight="bold">?</text></svg>');
        }

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
                <rect width="100%" height="100%" fill="#${cleanBg}"/>
                <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
                      fill="#${cleanColor}" font-family="Arial, sans-serif" font-size="50" font-weight="bold">
                    ${initials}
                </text>
            </svg>
        `;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    } catch (e) {
        console.error("Avatar generation error:", e);
        return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="100%" height="100%" fill="#4f46e5"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="50" font-weight="bold">U</text></svg>');
    }
};

// ================================================================ */
// ✅ Task 3: Separate Login Screen & Staff Dashboard Views        */
// ================================================================ */
window.switchPortalView = function(activeViewName) {
    console.log(`🔄 Switching portal view to: ${activeViewName}`);

    const loginContainers = document.querySelectorAll('#login-screen-container, #staff-auth-area, .login-card, .login-view, #login-wrapper, #login-container, #staff-login-card, #login-section');
    const dashboardContainers = document.querySelectorAll('#staff-dashboard-container, #staff-dash-area, .dashboard-wrapper, .staff-dashboard-view, #dashboard-main, #dashboard-root');

    if (activeViewName === 'DASHBOARD') {
        loginContainers.forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.classList.add('hidden-view', 'hidden');
            el.classList.remove('active-view', 'active-view-flex', 'active');
        });

        dashboardContainers.forEach(el => {
            el.style.setProperty('display', 'block', 'important');
            el.classList.remove('hidden-view', 'hidden');
            el.classList.add('active-view');
        });

        window.scrollTo({ top: 0, behavior: 'instant' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;

        setTimeout(() => {
            const user = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');
            if (user && typeof window.renderUserProfileImages === 'function') {
                window.renderUserProfileImages(user);
            }
        }, 100);

    } else if (activeViewName === 'LOGIN') {
        dashboardContainers.forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.classList.add('hidden-view', 'hidden');
            el.classList.remove('active-view', 'active-view-flex');
        });

        loginContainers.forEach(el => {
            // Force clean visible state for ALL login containers
            el.classList.remove('hidden-view', 'hidden');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.removeProperty('filter');
            el.style.removeProperty('backdrop-filter');

            if (el.id === 'login-screen-container') {
                el.style.setProperty('display', 'flex', 'important');
                el.classList.add('active-view-flex', 'active');
            } else {
                el.style.setProperty('display', 'block', 'important');
                el.classList.add('active-view');
            }
        });
    }
};

window.onAuthenticationSuccess = function(userData) {
    console.log("✅ Authentication Success Event Triggered");

    window.switchPortalView('DASHBOARD');

    if (typeof window.renderUserProfileImages === 'function') {
        window.renderUserProfileImages(userData);
    }
};

// ================================================================ */
// ✅ STRICT ROLE-BASED SIDE MENU & DASHBOARD ACCESS (v11.0)       */
// ================================================================ */

window.applyStrictRoleBasedLayout = function() {
    const rawRole = localStorage.getItem('user_role') || document.querySelector('#sidebar-user-role')?.textContent || '';
    const cleanRole = rawRole.trim().toUpperCase();

    if (!cleanRole) return;

    const hide = (id) => {
        const el = document.querySelector(id);
        if (el) el.style.setProperty('display', 'none', 'important');
    };
    const show = (id, type = 'block') => {
        const el = document.querySelector(id);
        if (el) el.style.setProperty('display', type, 'important');
    };

    show('#staff-dashboard-container', 'block');

    const isCleanerLeader = cleanRole.includes('CLEANER LEADER') || cleanRole.includes('LEADER');
    const isTechnician = cleanRole.includes('TECHNICIAN');
    const isOfficeBoy = cleanRole.includes('OFFICE BOY');
    const isSecurity = cleanRole.includes('SECURITY');

    const restrictedList = ['BUS MONITOR', 'BUS DRIVER', 'BUS SUPERVISOR', 'SUPERVISOR', 'GARDENER'];
    const isBasicCleaner = cleanRole.includes('CLEANER') && !isCleanerLeader;
    const isRestricted = (isBasicCleaner || restrictedList.some(r => cleanRole.includes(r))) && !isCleanerLeader && !isTechnician && !isOfficeBoy && !isSecurity;

    console.log(`🛡️ [RoleLayout] Role=[${cleanRole}] | Group=[${
        isRestricted ? 'Restricted' :
        (isCleanerLeader || isTechnician) ? 'Leader/Tech' :
        isOfficeBoy ? 'Office Boy' :
        isSecurity ? 'Security' : 'Other'
    }]`);

    if (isRestricted) {
        const hideIDs = [
            '#menu-asset-section', '#menu-asset-transfer', '#menu-asset-audit',
            '#menu-asset-dispose', '#menu-movement-logs', '#menu-create-task-btn',
            '#menu-tasks-btn', '#scan-edit-asset-btn', '#tasks-summary-card',
            '#s-dash-create-task-btn', '#security-pin-control'
        ];
        hideIDs.forEach(id => hide(id));

        show('#menu-history-btn', 'flex');
        show('#menu-docs-btn', 'flex');
        show('#biometric-toggle-btn', 'flex');
    }
    else if (isCleanerLeader || isTechnician) {
        show('#menu-asset-section', 'block');
        show('#menu-asset-transfer', 'flex');
        show('#menu-asset-audit', 'flex');
        show('#menu-asset-dispose', 'flex');
        show('#menu-movement-logs', 'flex');
        show('#menu-tasks-btn', 'flex');
        show('#scan-edit-asset-btn', 'block');
        show('#menu-history-btn', 'flex');
        show('#menu-docs-btn', 'flex');
        show('#biometric-toggle-btn', 'flex');

        hide('#menu-create-task-btn');
        hide('#s-dash-create-task-btn');
        hide('#security-pin-control');
    }
    else if (isOfficeBoy) {
        show('#menu-asset-section', 'block');
        show('#menu-asset-transfer', 'flex');
        show('#menu-asset-audit', 'flex');
        show('#menu-asset-dispose', 'flex');
        show('#menu-movement-logs', 'flex');
        show('#scan-edit-asset-btn', 'block');
        show('#menu-history-btn', 'flex');
        show('#menu-docs-btn', 'flex');
        show('#biometric-toggle-btn', 'flex');

        hide('#menu-tasks-btn');
        hide('#menu-create-task-btn');
        hide('#s-dash-create-task-btn');
        hide('#security-pin-control');
    }
    else if (isSecurity) {
        show('#menu-asset-section', 'block');
        show('#menu-asset-transfer', 'flex');
        show('#menu-asset-audit', 'flex');
        show('#menu-asset-dispose', 'flex');
        show('#menu-movement-logs', 'flex');
        show('#scan-edit-asset-btn', 'block');
        show('#menu-history-btn', 'flex');
        show('#menu-docs-btn', 'flex');
        show('#biometric-toggle-btn', 'flex');
        show('#menu-create-task-btn', 'flex');
        show('#s-dash-create-task-btn', 'block');
        show('#security-pin-control', 'block');

        hide('#menu-tasks-btn');
    }
};

// ================================================================ */
// ✅ AUTO-HIDE ENFORCER (FIXES FIRST LOGIN DELAY WITHOUT REFRESH) */
// ================================================================ */

window.initRoleRulesObserver = function() {
    console.log('🛡️ [RoleObserver] Initializing auto-hide enforcer...');

    if (typeof window.applyStrictRoleBasedLayout === 'function') {
        window.applyStrictRoleBasedLayout();
    }

    let burstCount = 0;
    const burstInterval = setInterval(() => {
        if (typeof window.applyStrictRoleBasedLayout === 'function') {
            window.applyStrictRoleBasedLayout();
        }
        burstCount++;
        if (burstCount > 25) {
            clearInterval(burstInterval);
            console.log('✅ [RoleObserver] Burst interval completed (5 sec).');
        }
    }, 200);

    const targetNode = document.body;
    if (targetNode) {
        if (window._roleRulesObserver) {
            window._roleRulesObserver.disconnect();
        }

        const observer = new MutationObserver((mutations) => {
            if (typeof window.applyStrictRoleBasedLayout === 'function') {
                window.applyStrictRoleBasedLayout();
            }
        });

        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });

        window._roleRulesObserver = observer;
        console.log('✅ [RoleObserver] MutationObserver attached to document.body.');
    }
};

document.addEventListener('DOMContentLoaded', window.initRoleRulesObserver);
window.addEventListener('hashchange', window.applyStrictRoleBasedLayout);
window.addEventListener('popstate', window.applyStrictRoleBasedLayout);

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initRoleRulesObserver();
}

window.applyPositionBasedRules = window.applyStrictRoleBasedLayout;
window.applyRoleDashboardRules = window.applyStrictRoleBasedLayout;
window.applyRoleBasedRestrictions = window.applyStrictRoleBasedLayout;


// ================================================================ */
// 🧹 COMPLETE SIDEBAR & LOGOUT RECOVERY ENGINE (v14.0)            */
// ================================================================ */
// Fixes:
//   - Security Dashboard Logout freeze
//   - Hamburger button breaking after logout
//   - Hard Refresh DOM overlay lock
//   - **NEW (v14.0): Blur-free logout** — strips all filter/backdrop
//     effects and force-renders login container


// --- 1. Safely Reset Sidebar & Overlay without breaking the Hamburger ---
window.resetSidebarState = function() {
    console.log("🧹 Resetting Sidebar & Overlay state...");

    const sidebarElements = document.querySelectorAll('#side-menu, #sidebar, .sidebar, #side-menu-content, .sidebar-wrapper');
    sidebarElements.forEach(el => {
        el.classList.remove('open', 'active', 'show', 'expanded');
        el.style.removeProperty('display');
        el.style.removeProperty('transform');
    });

    const overlays = document.querySelectorAll('.sidebar-backdrop, .menu-overlay, #sidebar-overlay');
    overlays.forEach(overlay => overlay.remove());

    document.body.classList.remove('sidebar-open', 'modal-open', 'overflow-hidden');
    document.body.style.removeProperty('overflow');
};


// --- 2. Universal Robust Logout Execution (BLUR-FREE v14.0) ---
window.handleGlobalLogout = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    console.log("🚪 Executing Clean Unblurred Logout...");

    // 1. CLEAR ALL BLUR EFFECTS & OVERLAYS FROM BODY & CONTAINERS
    document.body.classList.remove('blur', 'blurred', 'modal-open', 'overflow-hidden');
    document.body.style.removeProperty('filter');
    document.body.style.removeProperty('backdrop-filter');

    const allBlurredElements = document.querySelectorAll('.blur, .blurred, .backdrop-blur');
    allBlurredElements.forEach(el => {
        el.classList.remove('blur', 'blurred', 'backdrop-blur');
        el.style.removeProperty('filter');
        el.style.removeProperty('backdrop-filter');
    });

    // Remove any leftover modal overlays/backdrops blocking the UI
    const overlays = document.querySelectorAll('.modal-backdrop, .sidebar-backdrop, .menu-overlay, #overlay');
    overlays.forEach(overlay => overlay.remove());

    // 2. CLEAR SESSION & STORAGE DATA
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (err) {
        console.error("Storage clear error:", err);
    }

    // 3. FORCE DISPLAY SWITCH TO LOGIN CONTAINER
    const dashboardContainer = document.querySelector('#staff-dashboard-container, #dashboard-root, .dashboard-wrapper');
    const loginContainer = document.querySelector('#login-container, #staff-login-card, .login-wrapper, #login-section');

    if (dashboardContainer) {
        dashboardContainer.style.setProperty('display', 'none', 'important');
    }

    if (loginContainer) {
        loginContainer.style.setProperty('display', 'block', 'important');
        loginContainer.style.setProperty('visibility', 'visible', 'important');
        loginContainer.style.setProperty('opacity', '1', 'important');
    }

    // 4. FIREBASE SIGN OUT & CLEAN ROUTE REDIRECT
    if (window.firebase && firebase.auth) {
        firebase.auth().signOut().catch(err => console.log("Firebase logout error:", err));
    }

    // Redirect directly to staff-login.html if single-page view switching is not present
    setTimeout(() => {
        if (typeof window.switchPortalView === 'function') {
            window.switchPortalView('LOGIN');
        } else {
            window.location.href = 'staff-login.html';
        }
    }, 150);
};

// Legacy alias
window.executeSecureLogout = function() {
    console.log("🔄 [Legacy] executeSecureLogout → handleGlobalLogout");
    window.handleGlobalLogout();
};
window.logoutStaff = window.handleGlobalLogout;


// --- 3. Global Click Event Delegation for Logout & Hamburger Toggle ---
document.addEventListener('click', function(e) {
    const logoutBtn = e.target.closest('#logout-btn, .logout-btn, #security-logout-btn, #side-logout-btn, [data-action="logout"]');
    if (logoutBtn) {
        window.handleGlobalLogout(e);
        return;
    }

    const toggleBtn = e.target.closest('#menu-toggle, .nav-pill-purple, .hamburger-btn, #sidebar-toggle');
    if (toggleBtn) {
        const sideMenu = document.querySelector('#side-menu, #sidebar, .sidebar');
        if (sideMenu) {
            sideMenu.classList.toggle('open');
            sideMenu.classList.toggle('active');
        }
    }
});


// --- 4. Ensure Hard Refresh (Ctrl+Shift+R) Recovers State Cleanly ---
document.addEventListener('DOMContentLoaded', () => {
    window.resetSidebarState();

    // Also strip any leftover blur effects on load
    document.body.classList.remove('blur', 'blurred', 'modal-open', 'overflow-hidden');
    document.body.style.removeProperty('filter');
    document.body.style.removeProperty('backdrop-filter');
    document.body.style.removeProperty('-webkit-backdrop-filter');
});


// ================================================================ */
// SIDEBAR PROFILE & RESTRICTIONS (FIXED v6.0 - NO DUPLICATES)      */
// ================================================================ */

window.initSidebarProfileAndRestrictions = function(staffData) {
    const staff = staffData || window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    const passId = staff.adekPass || staff.adekNumber || staff.adcPassNumber || staff.username || staff.mobile;

    if (!staff || !passId) return;

    const displayName = staff.fullName || staff.name || "Staff Member";
    const displayRole = staff.designation || staff.position || staff.role || "Employee";

    const normalize = (val) => (val || '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
    const roleVal = normalize(staff.role);
    const designVal = normalize(staff.designation || staff.position);

    console.log(`👤 Side Menu Profile Update: [${displayName}] as [${displayRole}]`);

    const nameEl = document.getElementById('sidebar-user-name') || document.getElementById('menuUserName') || document.querySelector('.sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role') || document.getElementById('menuUserRole') || document.querySelector('.sidebar-user-role');

    if (nameEl) {
        nameEl.innerText = displayName;
    }
    if (roleEl) roleEl.innerText = displayRole;

    if (typeof window.renderUserProfileImages === 'function') {
        window.renderUserProfileImages(staff);
    }
};

window.updateSideMenuProfile = window.initSidebarProfileAndRestrictions;

// ================================================================ */
// DASHBOARD PROFILE HEADER RENDERER (FIXED v4.4)                 */
// ================================================================ */

window.renderDashboardProfile = function(staffData) {
    try {
        const staff = staffData || window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const safeStaff = (staff && typeof staff === 'object') ? staff : {};
        const passId = safeStaff.adekPass || safeStaff.adekNumber || safeStaff.adcPassNumber || safeStaff.username || safeStaff.mobile;

        console.log("👤 Syncing Dashboard Profile Header for:", safeStaff.fullName || safeStaff.name || "Unknown");

        const nameEl = document.getElementById('user-name');
        const idEl = document.getElementById('user-pass-id');
        const roleEl = document.getElementById('user-role') || document.getElementById('menuUserRole');
        const branchEl = document.getElementById('user-branch');
        const imgEl = document.getElementById('user-avatar');

        if (nameEl) nameEl.innerText = safeStaff.fullName || safeStaff.name || "Staff Member";
        if (idEl) idEl.innerText = `ID: ${passId || '-'}`;

        const displayRole = safeStaff.designation || safeStaff.position || safeStaff.role || "Employee";
        if (roleEl) roleEl.innerText = displayRole;

        if (typeof window.renderUserProfileImages === 'function') {
            window.renderUserProfileImages(safeStaff);
        }

        if (branchEl) {
            const branchName = window.escapeHTML(safeStaff.school || safeStaff.branch || 'Jern Yafoor School');
            branchEl.innerHTML = `<i class="fa-solid fa-location-dot text-indigo-400"></i> ${branchName}`;
        }

        if (typeof window.initSidebarProfileAndRestrictions === 'function') {
            window.initSidebarProfileAndRestrictions(safeStaff);
        }

        if (window.updateAccountActivationUI) {
            window.updateAccountActivationUI(safeStaff.isAccountActive);
        }

        const dashArea = document.getElementById('staff-dashboard-container');
        if (dashArea) {
            dashArea.classList.remove('hidden');
            dashArea.style.display = 'block';
            dashArea.style.visibility = 'visible';
            dashArea.style.opacity = '1';
        }

        if (typeof window.applyStrictRoleBasedLayout === 'function') {
            window.applyStrictRoleBasedLayout();
            setTimeout(() => window.applyStrictRoleBasedLayout(), 100);
            setTimeout(() => window.applyStrictRoleBasedLayout(), 300);
            setTimeout(() => window.applyStrictRoleBasedLayout(), 1000);
        }

    } catch (renderErr) {
        console.error("❌ Dashboard Render Crash:", renderErr);
        const dashAreaFallback = document.getElementById('staff-dashboard-container');
        if (dashAreaFallback) {
            dashAreaFallback.classList.remove('hidden');
            dashAreaFallback.style.display = 'block';
        }
    }
};

window.updateAccountActivationUI = function(isActive) {
    const banner = document.getElementById('account-activation-banner');
    const overlay = document.getElementById('account-lock-overlay');
    const badge = document.getElementById('account-status-badge');

    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');

    const isActuallyApproved = (isActive === true || staff.isApproved === true || staff.documentsApproved === true || staff.status === "APPROVED");
    const canUnlock = isActuallyApproved && staff.isProfileSubmitted === true;

    const colorActive = '#10B981';
    const colorInactive = '#EF4444';

    if (canUnlock) {
        if (banner) banner.classList.add('hidden');
        if (overlay) overlay.classList.add('hidden');
        if (badge) {
            badge.innerText = "Active";
            badge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            badge.style.color = colorActive;
            badge.classList.remove('hidden');
        }
    } else {
        if (banner) {
            banner.classList.remove('hidden');
            banner.style.backgroundColor = colorInactive;
        }
        if (overlay) {
            if (staff.isProfileSubmitted !== true) {
                overlay.classList.remove('hidden');
                overlay.className = 'onboarding-modal-overlay';
            } else {
                overlay.classList.add('hidden');
            }
        }
        if (badge) {
            badge.innerText = "Inactive";
            badge.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            badge.style.color = colorInactive;
            badge.classList.remove('hidden');
        }
    }

    const cinBtn = document.getElementById('s-checkin-btn') || document.getElementById('security-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn') || document.getElementById('security-checkout-btn');

    if (cinBtn) {
        cinBtn.disabled = false;
        cinBtn.style.opacity = isActive ? '1' : '0.7';
    }
    if (coutBtn) {
        coutBtn.disabled = false;
        coutBtn.style.opacity = isActive ? '1' : '0.7';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const btn = document.getElementById('btn_upload_docs_now');
        if (btn && !btn.dataset.listenerBound) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("📂 Opening Document Upload Interface...");
                if (typeof window.showStaffView === 'function') {
                    window.showStaffView('staff-docs-section');
                }
                const overlay = document.getElementById('account-lock-overlay');
                if (overlay) overlay.classList.add('hidden');
            });
            btn.dataset.listenerBound = "true";
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

window.renderDashboard = window.renderDashboardProfile;

// ================================================================ */
// ATTENDANCE HISTORY MODAL (FIXED v4.3 - XSS SAFE)                */
// ================================================================ */

window.openAttendanceHistoryModal = async function() {
    let modal = document.getElementById('attendance-history-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'attendance-history-modal';
        modal.className = 'fixed inset-0 bg-black/80 z-[999999] hidden items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(modal);
    }

    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    const staffName = window.escapeHTML(staff.fullName || staff.name || 'Staff');
    const staffRole = window.escapeHTML(staff.role || 'User');

    modal.innerHTML = `
        <div class="bg-indigo-950 border border-white/10 rounded-[2.5rem] p-8 max-w-lg w-full text-white space-y-6 shadow-2xl max-h-[90vh] flex flex-col fade-in">
            <div class="flex justify-between items-center border-b border-white/5 pb-5">
                <div>
                    <h3 class="text-xl font-black text-cyan-400 uppercase tracking-tight attendance-history-title">📅 Attendance History</h3>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">${staffName} • ${staffRole}</p>
                </div>
                <button onclick="window.closeAttendanceHistoryModal()" class="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors">&times;</button>
            </div>

            <div id="attendance-modal-logs" class="overflow-y-auto space-y-4 pr-2 flex-1 flex flex-col no-scrollbar" style="max-height: 60vh;">
                <div class="flex flex-col items-center justify-center py-12 space-y-4">
                    <i class="fa-solid fa-spinner fa-spin text-cyan-400 text-3xl"></i>
                    <p class="text-[10px] font-black uppercase tracking-widest text-white/40">Loading Logs...</p>
                </div>
            </div>

            <button onclick="window.closeAttendanceHistoryModal()" class="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all">Close History</button>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const logsContainer = document.getElementById('attendance-modal-logs');

    try {
        const snap = await get(ref(db, 'staff_attendance'));

        if (snap.exists() && staff.mobile) {
            const allRecords = snap.val();
            const myLogs = Object.values(allRecords).filter(r => r && r.mobile === staff.mobile);

            if (myLogs.length === 0) {
                if (logsContainer) {
                    logsContainer.innerHTML = `
                        <div class="text-center py-12">
                            <i class="fa-solid fa-calendar-xmark text-white/10 text-5xl mb-4"></i>
                            <p class="text-[10px] font-black uppercase tracking-widest text-white/40">No records found</p>
                        </div>`;
                }
                return;
            }

            myLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (logsContainer) {
                logsContainer.innerHTML = myLogs.map(log => `
                    <div class="bg-white/5 p-4 rounded-2xl border border-white/5 flex justify-between items-center group hover:bg-white/10 transition-all">
                        <div class="space-y-1">
                            <span class="font-black text-xs text-white block uppercase tracking-tight">${window.escapeHTML(log.date || 'N/A')}</span>
                            <div class="flex items-center gap-2 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                <span class="text-emerald-400">IN: ${window.escapeHTML(log.timeIn || '--')}</span>
                                <span class="w-1 h-1 bg-white/10 rounded-full"></span>
                                <span class="text-rose-400">OUT: ${window.escapeHTML(log.checkOutTime || log.timeOut || '--')}</span>
                            </div>
                        </div>
                        <div class="text-right">
                             <span class="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                                 log.status === 'checked_in' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'
                             }">
                                ${log.status === 'checked_in' ? 'On Duty' : 'Shift End'}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            if (logsContainer) {
                logsContainer.innerHTML = `<div class="text-center py-12"><p class="text-[10px] font-black uppercase tracking-widest text-white/40">No attendance data</p></div>`;
            }
        }
    } catch (e) {
        console.error("Attendance History Error:", e);
        if (logsContainer) {
            logsContainer.innerHTML = `<div class="text-center py-12"><p class="text-[10px] font-black text-rose-400 uppercase tracking-widest">Error Loading Data</p></div>`;
        }
    }
};

window.closeAttendanceHistoryModal = function() {
    const modal = document.getElementById('attendance-history-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// ================================================================ */
// MEDIA RENDERING & FALLBACKS (FIXED v4.4 - SMART STORAGE)        */
// ================================================================ */

const rateLimitedUrls = new Set();

window.getOrCacheImage = async function(url) {
    if (!url || url === 'N/A' || url === '-' || url === 'null' || url === 'undefined') {
        return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    }

    if (url.startsWith('data:image')) return url;

    if (rateLimitedUrls.has(url)) {
        return url;
    }

    const cacheKey = 'jys_img_cache_' + btoa(url).substring(0, 32).replace(/[/+=]/g, '_');
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(url);

        if (response.status === 429) {
            console.warn("🛑 Google Rate Limit (429): Too many requests. Adding to cooldown.");
            rateLimitedUrls.add(url);
            setTimeout(() => rateLimitedUrls.delete(url), 60000);
            return url;
        }

        if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);

        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    localStorage.setItem(cacheKey, reader.result);
                } catch (quotaErr) {
                    console.warn("⚠️ LocalStorage quota exceeded. Attempting purge...");

                    if (window.purgeOldImageCache) {
                        const purged = window.purgeOldImageCache();
                        console.log(`🧹 Purged ${purged} entries. Retrying cache write...`);

                        try {
                            localStorage.setItem(cacheKey, reader.result);
                            console.log("✅ Cache write successful after purge.");
                        } catch (retryErr) {
                            console.warn("⚠️ Cache write still failed after purge. Serving live URL.");
                        }
                    } else {
                        console.warn("⚠️ purgeOldImageCache not available. Serving live URL.");
                    }
                }
                resolve(reader.result);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("⚠️ getOrCacheImage failed, using live URL:", e);
        return url;
    }
};

window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl || driveUrl === 'N/A' || driveUrl === '-' || driveUrl === 'null' || driveUrl === 'undefined') {
        return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    }

    if (driveUrl.startsWith('data:image')) return driveUrl;
    if (driveUrl.startsWith('https://lh3.googleusercontent.com')) return driveUrl;

    if (!driveUrl.includes('drive.google.com') && !driveUrl.includes('docs.google.com') && driveUrl.startsWith('http')) {
        return driveUrl;
    }

    let fileId = null;
    const match = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  driveUrl.match(/([a-zA-Z0-9_-]{28,})/);

    if (match) fileId = match[1];

    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : driveUrl;
};

window.lazyLoadCachedImages = function() {
    document.querySelectorAll('img[data-cache-src]').forEach(img => {
        const src = img.getAttribute('data-cache-src');
        if (src && !img.dataset.cacheLoaded) {
            window.getOrCacheImage(src).then(cachedSrc => {
                img.src = cachedSrc;
                img.dataset.cacheLoaded = "true";
            }).catch(e => {
                img.src = src;
                img.dataset.cacheLoaded = "true";
            });
        }
    });
};

window.formatDriveImageUrl = function(url, staffName = "Staff") {
    const safeName = encodeURIComponent(String(staffName || "Staff"));

    if (!url || url.trim() === "" || url.includes("ui-avatars.com") || url === 'N/A' || url === '-') {
        return `https://ui-avatars.com/api/?name=${safeName}&background=4f46e5&color=fff`;
    }

    const driveRegex = /\/file\/d\/([a-zA-Z0-9_-]+)|\/d\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)|([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);

    if (match) {
        const fileId = match[1] || match[2] || match[3] || match[4];
        if (fileId && fileId.length > 20) {
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
        }
    }

    if (url.startsWith('http')) return url;
    if (url.startsWith('data:image')) return url;

    return `https://ui-avatars.com/api/?name=${safeName}&background=4f46e5&color=fff`;
};

window.openImageZoom = (url) => {
    if (!url || url.includes('placeholder') || url.includes('No+Photo')) return;
    const directUrl = window.formatDriveImageUrl(url);
    window.open(directUrl, '_blank');
};

// ================================================================ */
// COMPRESSION & IMAGE HELPERS (FIXED v4.3 - WITH RETRY & SAFARI BUGFIX) */
// ================================================================ */

window.compressImageWithRetry = async (file, maxWidth = 800, maxHeight = 800, quality = 0.7, retries = 3) => {
    let lastError = null;
    for (let i = 0; i < retries; i++) {
        try {
            const currentQuality = Math.max(0.4, quality - (i * 0.1));
            return await window.compressImageFile(file, maxWidth, maxHeight, currentQuality);
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ Compression attempt ${i + 1} failed:`, err);
            await new Promise(r => setTimeout(r, 400 * (i + 1)));
        }
    }
    throw lastError || new Error("Image compression failed after retries");
};

// ================================================================ */
// APP LAUNCH VIDEO LOGIC (FIXED v4.5)                             */
// ================================================================ */

window.handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');

    if (!overlay || !video) return;

    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') {
        overlay.remove();
        return;
    }

    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';

    let hasHidden = false;
    let safetyTimeout = null;

    window.skipLaunchVideo = () => {
        if (hasHidden) return;
        hasHidden = true;

        console.log("🎬 Skipping Launch Video...");

        if (safetyTimeout) clearTimeout(safetyTimeout);
        sessionStorage.setItem('videoPlayedThisSession', 'true');

        overlay.style.transition = 'opacity 0.5s ease-out, visibility 0.5s ease-out';
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';

        setTimeout(() => {
            if (overlay && overlay.parentNode) {
                overlay.remove();
            }
        }, 500);
    };

    safetyTimeout = setTimeout(window.skipLaunchVideo, 7000);

    video.onended = window.skipLaunchVideo;
    video.onerror = window.skipLaunchVideo;

    video.muted = true;
    const playPromise = video.play();

    if (playPromise !== undefined) {
        playPromise.catch((err) => {
            console.warn("⚠️ Autoplay restricted, hiding overlay:", err);
            window.skipLaunchVideo();
        });
    }
};

document.addEventListener('DOMContentLoaded', window.handleLaunchVideo);

window.addEventListener('load', () => {
    setTimeout(() => {
        const o = document.getElementById('launchVideoOverlay');
        if (o) window.skipLaunchVideo();
    }, 8000);
});

// ================================================================ */
// UNIVERSAL TABLE PAGINATOR (FIXED v4.3 - RESPONSIVE)            */
// ================================================================ */

class TablePaginator {
    constructor(containerId, itemsPerPage = 20) {
        this.containerId = containerId;
        this.itemsPerPage = itemsPerPage;
        this.currentPage = 1;
        this.data = [];
        this.renderCallback = null;
    }

    init(dataArray, renderRowCallback) {
        this.data = dataArray || [];
        this.renderCallback = renderRowCallback;
        this.currentPage = 1;
        this.render();
    }

    render() {
        if (!this.renderCallback) return;

        const totalPages = Math.max(1, Math.ceil(this.data.length / this.itemsPerPage));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageItems = this.data.slice(start, end);

        this.renderCallback(pageItems, start);
        this.renderControls(totalPages);
    }

    renderControls(totalPages) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-3 bg-white/50 backdrop-blur-sm border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 shadow-sm">
                <div class="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                    <span class="opacity-50 text-[8px] sm:text-[10px]">Show:</span>
                    <select class="page-size-select bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-indigo-600 outline-none text-[10px] sm:text-xs">
                        <option value="10" ${this.itemsPerPage === 10 ? 'selected' : ''}>10</option>
                        <option value="20" ${this.itemsPerPage === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${this.itemsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${this.itemsPerPage === 100 ? 'selected' : ''}>100</option>
                    </select>
                    <span class="ml-1 sm:ml-2 text-[8px] sm:text-[10px]">Total: <span class="text-indigo-600 font-black">${this.data.length}</span></span>
                </div>

                <div class="flex items-center gap-2 sm:gap-4">
                    <button class="prev-btn w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full disabled:opacity-30 disabled:grayscale transition-all active:scale-90 text-xs sm:text-sm" ${this.currentPage === 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>

                    <div class="flex items-center gap-1 text-[8px] sm:text-[10px]">
                        <span class="opacity-50">Page</span>
                        <span class="text-indigo-600 font-black">${this.currentPage}</span>
                        <span class="opacity-50">/ ${totalPages}</span>
                    </div>

                    <button class="next-btn w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full disabled:opacity-30 disabled:grayscale transition-all active:scale-90 text-xs sm:text-sm" ${this.currentPage >= totalPages ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

        container.querySelector('.prev-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render();
            }
        });

        container.querySelector('.next-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render();
            }
        });

        container.querySelector('.page-size-select')?.addEventListener('change', (e) => {
            const parsed = parseInt(e.target.value, 10);
            this.itemsPerPage = isNaN(parsed) ? 20 : Math.max(1, parsed);
            this.currentPage = 1;
            this.render();
        });
    }
}

window.TablePaginator = TablePaginator;

window.adminPaginators = {
    visitors: new TablePaginator('visitor-logs-pagination'),
    contractors: new TablePaginator('contractor-logs-pagination'),
    attendance: new TablePaginator('staff-attendance-pagination'),
    tasks: new TablePaginator('tasks-pagination'),
    directory: new TablePaginator('directory-pagination'),
    assets: new TablePaginator('assets-pagination'),
    disposal: new TablePaginator('disposal-pagination'),
    transfers: new TablePaginator('transfer-pagination')
};

// --- STAFF UI TAB TOGGLING ---
window.toggleStaffTab = (tab) => {
    try {
        const logTab = document.getElementById('s-tab-login');
        const regTab = document.getElementById('s-tab-reg');
        const logForm = document.getElementById('staff-login-form');
        const regForm = document.getElementById('staff-reg-form');

        if (!logTab || !regTab || !logForm || !regForm) return;

        if (tab === 'login') {
            logTab.classList.add('text-indigo-600', 'border-indigo-600');
            logTab.classList.remove('text-gray-400', 'border-transparent');
            regTab.classList.add('text-gray-400', 'border-transparent');
            regTab.classList.remove('text-indigo-600', 'border-indigo-600');
            logForm.classList.remove('hidden');
            regForm.classList.add('hidden');
        } else {
            regTab.classList.add('text-indigo-600', 'border-indigo-600');
            regTab.classList.remove('text-gray-400', 'border-transparent');
            logTab.classList.add('text-gray-400', 'border-transparent');
            logTab.classList.remove('text-indigo-600', 'border-indigo-600');
            regForm.classList.remove('hidden');
            logForm.classList.add('hidden');
        }
    } catch (e) {
        console.error("Toggle Tab Error:", e);
    }
};

window.toggleAccordion = function(id) {
    const content = document.getElementById(id + '-content');
    const icon = document.getElementById(id + '-icon');
    if (!content) return;

    const isHidden = content.classList.contains('hidden');

    if (isHidden) {
        content.classList.remove('hidden');
        if (icon) {
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
        }
    } else {
        content.classList.add('hidden');
        if (icon) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
        }
    }
};

window.openMovementLogModal = function() {
    window.showStaffView('transfer-logs-section');
    if (typeof window.loadTransferLogs === 'function') {
        window.loadTransferLogs();
    }
};

window.openTransferLogs = window.openMovementLogModal;

// ================================================================ */
// VIEW SWITCHER (FIXED v4.3 - LAYOUT PRESERVATION)               */
// ================================================================ */

window.showStaffView = function(viewId) {
    try {
        console.log(`📂 Switching to view: ${viewId}`);

        if (typeof window.closeScannerModal === 'function') {
            window.closeScannerModal();
        }

        const authArea = document.getElementById('staff-auth-area');
        if (authArea) {
            authArea.classList.add('hidden');
            authArea.style.display = 'none';
        }

        const allSections = document.querySelectorAll('.transfer-workflow-container, .view-section, .staff-view-section');
        allSections.forEach(s => {
            s.classList.add('hidden');
            s.style.display = 'none';
        });

        const views = [
            'staff-dashboard-container',
            'security-main-container',
            'tasks-management-section',
            'asset-audit-section',
            'asset-disposal-section',
            'asset-transfer-section',
            'transfer-logs-section',
            'staff-docs-section'
        ];

        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        });

        const target = document.getElementById(viewId) ||
                       document.getElementById(`staff_view_${viewId}`) ||
                       document.getElementById(`${viewId}_section`);

        if (target) {
            target.classList.remove('hidden');
            target.style.display = '';
            console.log(`✅ View ${viewId} is now visible`);

            const parentSection = target.closest('.view-section');
            if (parentSection) {
                parentSection.classList.remove('hidden');
                parentSection.style.display = '';
            }
        } else {
            console.warn(`⚠️ View Switcher Warning: Element with ID "${viewId}" not found in DOM. Attempting fallback.`);

            const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');
            if (!staff || !staff.mobile) {
                console.error("❌ View Switcher: User not authenticated. Forcing Login.");
                if (window.switchPortalView) window.switchPortalView('LOGIN');
                return;
            }

            const dashFallback = document.getElementById('staff-dashboard-container') ||
                                 document.querySelector('.staff-dashboard-view');

            if (dashFallback) {
                dashFallback.classList.remove('hidden', 'hidden-view');
                dashFallback.classList.add('active-view');
                dashFallback.style.display = 'block';
                console.log("✅ View Switcher: Fallback to main dashboard executed.");
            } else {
                console.error(`❌ View Switcher Fatal: No valid dashboard fallback found for "${viewId}"`);
            }
        }

        if ((viewId === 'tasks-management-section' || viewId === 'tasks') && typeof window.loadRoleView === 'function') {
            window.loadRoleView(window.currentStaff);
        }

        if ((viewId === 'staff-docs-section' || viewId === 'docs') && typeof window.loadStaffDocumentsView === 'function') {
            window.loadStaffDocumentsView('staff-docs-container');
        }

        if (typeof window.initTopBackButton === 'function') {
            window.initTopBackButton();
        }

        if (viewId === 'staff-dashboard-container' && typeof window.applyStrictRoleBasedLayout === 'function') {
            window.applyStrictRoleBasedLayout();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        console.error("❌ showStaffView Runtime Error:", err);
    }
};

// ================================================================ */
// AUTOMATIC SPINNER ATTACHMENT (FIXED v4.4 - VALIDATION SAFE)    */
// ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const attachLogoutListeners = () => {
        const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn, [onclick*="logoutStaff"]');
        logoutBtns.forEach(btn => {
            if (!btn.dataset.logoutBound) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window.handleGlobalLogout === 'function') {
                        window.handleGlobalLogout(e);
                    }
                };
                btn.dataset.logoutBound = "true";
            }
        });
    };

    attachLogoutListeners();

    if (typeof window.initSidebarProfileAndRestrictions === 'function') {
        window.initSidebarProfileAndRestrictions();
    }

    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
            return;
        }
        if (typeof window.showGlobalSpinner === 'function') {
            window.showGlobalSpinner("Saving Data...");
        }
    }, true);

    const attachButtonListeners = () => {
        document.querySelectorAll('button[type="submit"], .btn-primary, .submit-btn, .btn-submit-transfer').forEach(btn => {
            if (!btn.dataset.spinnerBound) {
                btn.addEventListener('click', (e) => {
                    const form = btn.closest('form');

                    if (form) {
                        if (form.checkValidity()) {
                            setTimeout(() => {
                                if (typeof window.showGlobalSpinner === 'function') {
                                    window.showGlobalSpinner("Please wait...");
                                }
                            }, 50);
                        }
                    } else {
                        setTimeout(() => {
                            if (typeof window.showGlobalSpinner === 'function') {
                                window.showGlobalSpinner("Please wait...");
                            }
                        }, 50);
                    }
                });
                btn.dataset.spinnerBound = "true";
            }
        });
    };

    attachButtonListeners();

    const observer = new MutationObserver(() => {
        attachLogoutListeners();
        attachButtonListeners();
        if (window.injectSignatureFSButtons) window.injectSignatureFSButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (window.injectSignatureFSButtons) window.injectSignatureFSButtons();
});

(function injectSignatureStyles() {
    if (document.getElementById('sig-fs-styles')) return;
    const style = document.createElement('style');
    style.id = 'sig-fs-styles';
    style.textContent = `
        .canvas-wrapper.sig-full-screen {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 99999999 !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 20px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            touch-action: none !important;
            overscroll-behavior: contain !important;
        }

        .canvas-wrapper.sig-full-screen canvas {
            width: 100% !important;
            height: calc(100% - 100px) !important;
            background: #fff !important;
            touch-action: none !important;
            border: 2px solid #e2e8f0 !important;
            border-radius: 24px !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1) !important;
        }

        .sig-fs-controls {
            display: none;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 100000000;
            gap: 12px;
        }

        .sig-full-screen .sig-fs-controls {
            display: flex !important;
        }

        .sig-fs-btn {
            padding: 14px 24px;
            border-radius: 16px;
            font-weight: 900;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 1.5px;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 15px 30px -5px rgba(0,0,0,0.2);
        }

        .sig-fs-btn.done { background: #4f46e5; color: #fff; }
        .sig-fs-btn.clear { background: #f8fafc; color: #ef4444; border: 1px solid #fee2e2; }
        .sig-fs-btn:active { transform: scale(0.95); }

        .sig-fs-toggle {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 100;
            background: #f8fafc;
            color: #4f46e5;
            border: 1px solid #e2e8f0;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .sig-full-screen .sig-fs-toggle { display: none !important; }

        .sig-full-screen .sig-fs-toggle i { font-size: 14px; }
    `;
    document.head.appendChild(style);
})();

window.injectSignatureFSButtons = () => {
    document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
        if (!wrapper.querySelector('.sig-fs-toggle')) {
            const canvas = wrapper.querySelector('canvas');
            if (!canvas || !canvas.id) return;

            const toggleBtn = document.createElement('button');
            toggleBtn.type = "button";
            toggleBtn.className = "sig-fs-toggle";
            toggleBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
            toggleBtn.onclick = (e) => {
                e.preventDefault();
                const pad = window.sigPadManager.getPad(canvas.id);
                if (pad) pad.toggleFullScreen();
            };
            wrapper.appendChild(toggleBtn);

            const controls = document.createElement('div');
            controls.className = "sig-fs-controls";

            const clearBtn = document.createElement('button');
            clearBtn.type = "button";
            clearBtn.className = "sig-fs-btn clear";
            clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i> CLEAR';
            clearBtn.onclick = (e) => {
                e.preventDefault();
                if (window.clearSignaturePad) window.clearSignaturePad(canvas.id);
            };

            const doneBtn = document.createElement('button');
            doneBtn.type = "button";
            doneBtn.className = "sig-fs-btn done";
            doneBtn.innerHTML = '<i class="fa-solid fa-check"></i> DONE / EXIT';
            doneBtn.onclick = (e) => {
                e.preventDefault();
                const pad = window.sigPadManager.getPad(canvas.id);
                if (pad) pad.toggleFullScreen();
            };

            controls.appendChild(clearBtn);
            controls.appendChild(doneBtn);
            wrapper.appendChild(controls);
        }
    });
};

// ================================================================ */
// ✅ Task 2: Fix Profile Picture Rendering (Dashboard & Sidebar)    */
// ================================================================ */
window.renderUserProfileImages = function(user) {
    if (!user) return;

    const photoUrl = user.profilePicUrl || user.photoUrl || user.profilePicture || user.photo || user.imageUrl || "";
    const name = user.fullName || user.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff`;

    console.log(`🖼️ Rendering user profile images for: ${name}`);

    const sideAvatarContainer = document.getElementById('side-menu-avatar') || document.querySelector('.sidebar-avatar-container') || document.getElementById('menuAvatar');
    if (sideAvatarContainer) {
        sideAvatarContainer.innerHTML = '';
        sideAvatarContainer.className = 'w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-amber-400 shadow-md flex items-center justify-center bg-indigo-600';

        const finalUrl = (photoUrl && photoUrl.trim() !== "" && photoUrl !== 'N/A' && photoUrl !== '-') ?
                         window.formatDriveImageUrl(photoUrl, name) : fallbackUrl;

        const img = document.createElement('img');
        img.src = finalUrl;
        img.alt = "Profile";
        img.className = "w-full h-full object-cover";
        img.onerror = function() {
            this.style.display = 'none';
            sideAvatarContainer.innerHTML = `<span class="text-white font-black text-xl">${window.escapeHTML(initials)}</span>`;
        };
        sideAvatarContainer.appendChild(img);
    }

    const mainAvatarContainer = document.getElementById('user-avatar-container') || document.querySelector('.dashboard-avatar-box');
    if (mainAvatarContainer) {
        const imgEl = document.getElementById('user-avatar');
        const placeholder = document.getElementById('avatar-placeholder');

        if (photoUrl && photoUrl.trim() !== "" && photoUrl !== 'N/A' && photoUrl !== '-') {
            const finalUrl = window.formatDriveImageUrl(photoUrl, name);
            if (imgEl) {
                imgEl.src = finalUrl;
                imgEl.classList.remove('hidden', 'hidden-view');
                imgEl.style.display = 'block';
                imgEl.onerror = function() {
                    console.warn("⚠️ Dashboard avatar failed to load, showing placeholder.");
                    this.style.display = 'none';
                    if (placeholder) {
                        placeholder.innerText = initials;
                        placeholder.classList.remove('hidden', 'hidden-view');
                        placeholder.style.display = 'flex';
                    }
                };
            }
            if (placeholder) {
                placeholder.classList.add('hidden', 'hidden-view');
                placeholder.style.display = 'none';
            }
        } else {
            if (imgEl) {
                imgEl.style.display = 'none';
                imgEl.classList.add('hidden', 'hidden-view');
            }
            if (placeholder) {
                placeholder.innerText = initials;
                placeholder.classList.remove('hidden', 'hidden-view');
                placeholder.style.display = 'flex';
            }
        }
    }

    const nameDisplays = document.querySelectorAll('#user-name, #sidebar-user-name, .user-display-name, .sidebar-user-name, #menuUserName');
    nameDisplays.forEach(el => el.innerText = name);
};

console.log("✅ ui_module.js (v14.0 - Blur-Free Logout Engine) Loaded");