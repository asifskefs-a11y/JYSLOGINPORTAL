import { db } from './firebase_config.js';
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

    // Direct removal to prevent DOM lag on rapid notifications
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

    toast.className = `pointer-events-auto bg-slate-900/95 border-l-4 ${bgColor} text-white p-4 rounded-xl shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-x-full flex flex-col gap-1`;
    toast.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="font-bold text-xs uppercase tracking-wider ${iconColor} flex items-center gap-2">
                <i class="fa-solid ${icon} animate-bounce"></i> ${title}
            </span>
            <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white text-xs">&times;</button>
        </div>
        <p class="text-xs text-slate-200 mt-1">${message}</p>
    `;
    container.appendChild(toast);

    // Trigger entrance animation
    setTimeout(() => toast.classList.remove('translate-x-full'), 50);

    // Auto-remove after 5 seconds
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

        // Clean up old listeners
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

// ✅ FIXED: Clear hone par canvas locked nahi hoga
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

    // 1. Identify Wrapper
    const wrapper = el.closest('.canvas-wrapper') || el.parentElement;
    if (!wrapper) {
        console.error("❌ unlockCanvas: Wrapper not found");
        return;
    }

    // 2. Identify Elements
    const canvas = wrapper.querySelector('canvas');
    const overlay = wrapper.querySelector('.sig-lock-overlay') || el;

    if (!canvas) {
        console.error("❌ unlockCanvas: Canvas not found");
        return;
    }

    // 3. Force Visual State
    wrapper.classList.add('unlocked');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.visibility = 'hidden';
        overlay.style.pointerEvents = 'none';
        overlay.classList.add('hidden');
    }

    // 4. Force Canvas Pointer State
    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'none';
    canvas.style.zIndex = '50';

    // 5. Initialize Drawing Engine
    if (window.sigPadManager && canvas.id) {
        const pad = window.sigPadManager.getPad(canvas.id);
        if (pad) {
            pad.unlock();
            // Use small timeout to ensure layout has reflowed for hidden containers
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
// ASSET PREVIEW MODAL (FIXED v4.3)                                */
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

    // Safely parse JSON or string
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

    // Support both normalized and raw formats
    const photo = data.photoUrl || data.imageUrl || data.photoURL || data.auditPhoto || data.photo || data["AUDIT PHOTO"];
    const barcode = data.barcode || data.assetBarcode || data["ASSET BARCODE"] || data.id || 'N/A';
    const desc = data.description || data.assetDescription || data.assetName || data["ASSET DESCRIPTION"] || data.name || 'N/A';
    const category = data.category || data["CATEGORY"] || 'N/A';
    const building = data.building || data.schoolBuildingName || data["SCHOOL BUILDING NAME"] || 'N/A';
    const location = data.location || data.locationName || data["LOCATION NAME"] || data.roomName || 'N/A';
    const status = data.assetStatus || data.status || data["STATUS"] || 'Active';

    modal.innerHTML = `
        <div class="bg-indigo-950 border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full text-white space-y-6 shadow-2xl animate-fade-in">
            <div class="flex justify-between items-center border-b border-white/5 pb-5">
                <h3 class="text-xl font-black text-amber-400 uppercase tracking-tight">📦 Asset Details</h3>
                <button onclick="window.closeAssetPreviewModal()" class="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors text-2xl font-bold">×</button>
            </div>
            <div class="space-y-4 text-xs">
                ${(photo && photo !== 'N/A' && photo !== '-') ? `
                    <img src="${window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photo) : photo}" class="w-full h-48 object-cover rounded-3xl border border-white/10 mb-4 shadow-inner cursor-pointer" onclick="window.openImageZoom('${photo}')"/>
                ` : `
                    <div class="w-full h-32 bg-white/5 rounded-3xl flex flex-col items-center justify-center text-white/20 border-2 border-dashed border-white/5">
                        <i class="fa-solid fa-image text-3xl mb-2"></i>
                        <span class="font-black uppercase tracking-widest text-[8px]">No Photo Available</span>
                    </div>
                `}
                <div class="grid grid-cols-1 gap-3">
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Asset Tag</span>
                        <span class="font-bold text-white">${barcode}</span>
                    </div>
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Description</span>
                        <span class="font-bold text-white text-right ml-4">${desc}</span>
                    </div>
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Category</span>
                        <span class="font-bold text-white">${category}</span>
                    </div>
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Building</span>
                        <span class="font-bold text-white">${building}</span>
                    </div>
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Location</span>
                        <span class="font-bold text-white">${location}</span>
                    </div>
                    <div class="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <span class="text-white/40 uppercase font-black tracking-widest text-[8px]">Status</span>
                        <span class="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg font-black uppercase tracking-widest text-[8px] border border-amber-500/30">${status}</span>
                    </div>
                </div>
            </div>
            <button onclick="window.closeAssetPreviewModal()" class="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-white/5">Close Preview</button>
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

// --- GLOBAL SUCCESS POPUP ---
window.triggerSuccessPopup = (msg) => {
    window.showWhatsAppToast("✅ Success", msg || "Action completed successfully!", "success");
};

// ================================================================ */
// GLOBAL LOADING SPINNER (FIXED v4.3)                             */
// ================================================================ */

let spinnerTimeout = null;
let spinnerActive = false;

window.showGlobalSpinner = (message = "Loading...") => {
    let spinner = document.getElementById('universal-logo-loader');

    // Auto-create element if missing from DOM
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'universal-logo-loader';
        spinner.className = 'fixed inset-0 z-[9999999] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center hidden';
        spinner.innerHTML = `
            <div class="flex flex-col items-center justify-center space-y-4">
                <div class="relative flex items-center justify-center">
                    <div class="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <i class="fa-solid fa-cube text-amber-400 absolute text-xl"></i>
                </div>
                <p id="universal-loader-text" class="text-xs font-black uppercase tracking-widest text-amber-400 animate-pulse">${message}</p>
            </div>
        `;
        document.body.appendChild(spinner);
    }

    const spText = document.getElementById('universal-loader-text');
    if (spText && message) spText.innerText = message;

    spinner.style.display = 'flex';
    spinner.classList.remove('hidden');
    spinnerActive = true;

    // Pulse animation logic if an img element exists
    const img = spinner.querySelector('img');
    if (img) img.className = "w-28 h-28 object-contain rounded-2xl logo-pulse-anim";

    // Extended timeout to 30 seconds for large operations
    if (spinnerTimeout) clearTimeout(spinnerTimeout);
    spinnerTimeout = setTimeout(() => {
        if (spinnerActive) {
            console.warn("⚠️ Spinner auto-closed after 30 seconds timeout");
            window.hideGlobalSpinner();
        }
    }, 30000);
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

// Aliases for backward compatibility
window.showLoader = window.showGlobalSpinner;
window.hideLoader = window.hideGlobalSpinner;
// ================================================================ */
// AVATAR GENERATOR (FIXED v4.3)                                   */
// ================================================================ */

window.generateLocalAvatar = function(name, background = "4f46e5", color = "fff") {
    try {
        if (!name) name = "User";

        // Remove '#' if accidentally passed to prevent '##' in SVG
        const cleanBg = String(background).replace('#', '');
        const cleanColor = String(color).replace('#', '');

        // Safe splitting to handle extra spaces
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
// ROLE-BASED DASHBOARD RULES (FIXED v4.3)                         */
// ================================================================ */

window.applyRoleDashboardRules = function(userRole) {
    const rawRole = (userRole || '').toString().trim().toLowerCase();
    const cleanRole = rawRole.replace(/[\s-]+/g, '_');

    console.log(`👤 Normalizing Role for Sidebar Permissions: Original="${userRole}" -> Cleaned="${cleanRole}"`);

    const assetAllowedRoles = [
        'security', 'technician', 'tech', 'office_boy', 'admin',
        'leader', 'cleaner_leader', 'cleaning_leader', 'leader_technician'
    ];

    const taskAllowedRoles = [
        'cleaner', 'cleaner_leader', 'cleaning_leader', 'leader',
        'technician', 'tech', 'security', 'admin', 'office_boy', 'leader_technician'
    ];

    const taskCreateRoles = ['security', 'admin'];

    const hasAssetAccess = assetAllowedRoles.includes(cleanRole);
    const hasTaskAccess = taskAllowedRoles.includes(cleanRole);
    const canCreateTask = taskCreateRoles.includes(cleanRole);

    const assetSection = document.getElementById('menu-asset-section');
    if (assetSection) {
        if (hasAssetAccess) {
            assetSection.classList.remove('hidden');
            assetSection.style.display = 'block';
        } else {
            assetSection.classList.add('hidden');
            assetSection.style.display = 'none';
        }
    }

    const assetSubButtons = [
        'menu-asset-transfer', 'menu-asset-audit',
        'menu-asset-dispose', 'menu-movement-logs'
    ];

    assetSubButtons.forEach(btnId => {
        const btnEl = document.getElementById(btnId);
        if (btnEl) {
            if (hasAssetAccess) {
                btnEl.classList.remove('hidden');
                btnEl.style.display = 'flex';
            } else {
                btnEl.classList.add('hidden');
                btnEl.style.display = 'none';
            }
        }
    });

    const taskBtn = document.getElementById('menu-tasks-btn');
    if (taskBtn) {
        if (hasTaskAccess) {
            taskBtn.classList.remove('hidden');
            taskBtn.style.display = 'flex';
        } else {
            taskBtn.classList.add('hidden');
            taskBtn.style.display = 'none';
        }
    }

    const createBtns = ['menu-create-task-btn', 's-dash-create-task-btn', 'tab-btn-create-task'];
    createBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (canCreateTask) {
                btn.classList.remove('hidden');
                btn.style.display = (id === 'tab-btn-create-task') ? 'inline-flex' : 'flex';
            } else {
                btn.classList.add('hidden');
                btn.style.display = 'none';
            }
        }
    });

    const checkinBtns = document.querySelectorAll('#s-checkin-btn, #btn-staff-checkin');
    checkinBtns.forEach(btn => {
        btn.classList.remove('hidden');
        // Keep CSS layout flexible instead of forcing inline-flex
        if (btn.style.display === 'none') {
            btn.style.display = '';
        }
    });

    if (typeof window.initSidebarProfileAndRestrictions === 'function') {
        window.initSidebarProfileAndRestrictions();
    }
};

// ================================================================ */
// LOGOUT FUNCTION (FIXED v4.3)                                    */
// ================================================================ */

window.executeSecureLogout = function() {
    try {
        // Safe cleanup for listeners
        if (typeof window.cleanupAdminListeners === 'function') {
            window.cleanupAdminListeners();
        }

        // Firebase v9/v10 Listener Cleanup Check
        if (window._visitorLogsListener) {
            if (typeof window._visitorLogsListener === 'function') {
                window._visitorLogsListener(); // Unsubscribe function
            } else if (typeof window._visitorLogsListener.off === 'function') {
                window._visitorLogsListener.off();
            }
            window._visitorLogsListener = null;
        }

        if (window.activeSessionListener) {
            if (typeof window.activeSessionListener === 'function') {
                window.activeSessionListener(); // Unsubscribe function
            } else if (typeof window.activeSessionListener.off === 'function') {
                window.activeSessionListener.off();
            }
            window.activeSessionListener = null;
        }
    } catch (e) {
        console.warn("⚠️ Listener cleanup error on logout:", e);
    }

    // Clear Sessions
    sessionStorage.clear();
    localStorage.clear();

    // Direct redirect to Login Page
    window.location.href = 'staff-login.html';
};

window.logoutStaff = window.executeSecureLogout;
// ================================================================ */
// SIDEBAR PROFILE & RESTRICTIONS (FIXED v4.3)                    */
// ================================================================ */

window.initSidebarProfileAndRestrictions = function() {
    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    if (!staff || !staff.mobile) return;

    const role = (staff.role || '').toLowerCase().trim();
    const displayName = staff.fullName || staff.name || "Staff Member";
    const displayRole = staff.designation || staff.position || staff.role || "Employee";

    const nameEl = document.getElementById('sidebar-user-name') || document.getElementById('menuUserName') || document.querySelector('.sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role') || document.getElementById('menuUserRole') || document.querySelector('.sidebar-user-role');
    const imgEl = document.getElementById('sidebar-user-avatar') || document.getElementById('sidebar-profile-img') || document.querySelector('.sidebar-user-avatar');

    if (nameEl) nameEl.innerText = displayName;
    if (roleEl) roleEl.innerText = displayRole;

    if (imgEl) {
        const photo = staff.photoUrl || staff.profilePic || staff.imageUrl || staff.photo;
        if (photo && photo !== 'N/A' && photo !== '-') {
            imgEl.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photo) : photo;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.src = window.generateLocalAvatar ? window.generateLocalAvatar(displayName) : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=4f46e5&color=fff`;
            imgEl.classList.remove('hidden');
        }

        const initialsEl = document.getElementById('sidebar-initials');
        if (initialsEl) initialsEl.classList.add('hidden');
    }

    // Cleaner, Gardener & Bus Musrif specific restrictions
    if (role === 'cleaner' || role === 'gardener' || role === 'bus musrif' || role === 'bus_musrif') {
        const scanAssetBtns = document.querySelectorAll('#scan-edit-asset-btn, .scan-asset-btn, [data-action="scan-asset"]');
        scanAssetBtns.forEach(b => {
            b.style.display = 'none';
            b.classList.add('hidden');
        });

        const taskHistoryMenuItem = document.getElementById('menu-task-history') || document.getElementById('menu-tasks-btn') || document.querySelector('[data-menu="task-history"]');
        if (taskHistoryMenuItem && !taskHistoryMenuItem.dataset.modified) {
            taskHistoryMenuItem.dataset.modified = "true";
            taskHistoryMenuItem.innerHTML = `
                <div onclick="if(window.toggleSideMenu) window.toggleSideMenu(); if(window.openAttendanceHistoryModal) window.openAttendanceHistoryModal();" class="flex items-center gap-3 p-4 bg-white/5 rounded-2xl text-white/80 hover:bg-white/10 transition-all cursor-pointer">
                    <i class="fa-solid fa-calendar-days text-amber-400"></i>
                    <span>Attendance History</span>
                </div>
            `;
        }
    }
};

window.updateSideMenuProfile = window.initSidebarProfileAndRestrictions;

// ================================================================ */
// DASHBOARD PROFILE HEADER RENDERER (FIXED v4.4)                 */
// ================================================================ */

window.renderDashboardProfile = function(staffData) {
    const staff = staffData || window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    if (!staff || !staff.mobile) {
        console.warn("⚠️ renderDashboardProfile: No active staff data found.");
        return;
    }

    console.log("👤 Syncing Dashboard Profile Header for:", staff.fullName || staff.name);

    const nameEl = document.getElementById('user-name');
    const idEl = document.getElementById('user-pass-id');
    const branchEl = document.getElementById('user-branch');
    const imgEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.innerText = staff.fullName || staff.name || "Staff Member";
    if (idEl) idEl.innerText = `ID: ${staff.adekPass || staff.adekNumber || '-'}`;
    if (branchEl) {
        branchEl.innerHTML = `<i class="fa-solid fa-location-dot text-indigo-400"></i> ${staff.school || staff.branch || 'Jern Yafoor School'}`;
    }

    if (imgEl) {
        const photo = staff.profilePicUrl || staff.photoUrl || staff.photo;
        const displayName = staff.fullName || staff.name || "U";
        if (photo && photo !== 'N/A' && photo !== '-') {
            imgEl.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photo) : photo;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.src = window.generateLocalAvatar ? window.generateLocalAvatar(displayName) : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4f46e5&color=fff`;
            imgEl.classList.remove('hidden');
        }
    }
};

window.renderDashboard = window.renderDashboardProfile; // Alias for compatibility

// ================================================================ */
// ATTENDANCE HISTORY MODAL (FIXED v4.3)                           */
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
    const staffName = staff.fullName || staff.name || 'Staff';

    modal.innerHTML = `
        <div class="bg-indigo-950 border border-white/10 rounded-[2.5rem] p-8 max-w-lg w-full text-white space-y-6 shadow-2xl max-h-[90vh] flex flex-col fade-in">
            <div class="flex justify-between items-center border-b border-white/5 pb-5">
                <div>
                    <h3 class="text-xl font-black text-amber-400 uppercase tracking-tight">📅 Attendance History</h3>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">${staffName} • ${staff.role || 'User'}</p>
                </div>
                <button onclick="window.closeAttendanceHistoryModal()" class="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors">&times;</button>
            </div>

            <div id="attendance-modal-logs" class="overflow-y-auto space-y-3 pr-2 flex-1 no-scrollbar">
                <div class="flex flex-col items-center justify-center py-12 space-y-4">
                    <i class="fa-solid fa-spinner fa-spin text-amber-400 text-3xl"></i>
                    <p class="text-[10px] font-black uppercase tracking-widest text-white/40">Loading Logs...</p>
                </div>
            </div>

            <button onclick="window.closeAttendanceHistoryModal()" class="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all">Close History</button>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // Declared outside try-catch to ensure availability in catch block
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
                            <span class="font-black text-xs text-white block uppercase tracking-tight">${log.date || 'N/A'}</span>
                            <div class="flex items-center gap-2 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                <span class="text-emerald-400">IN: ${log.timeIn || '--'}</span>
                                <span class="w-1 h-1 bg-white/10 rounded-full"></span>
                                <span class="text-rose-400">OUT: ${log.checkOutTime || log.timeOut || '--'}</span>
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
// MEDIA RENDERING & FALLBACKS (FIXED v4.3)                        */
// ================================================================ */

window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl || driveUrl === 'N/A' || driveUrl === '-' || driveUrl === 'null' || driveUrl === 'undefined') {
        return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    }

    // Direct Data URLs and already formatted links
    if (driveUrl.startsWith('data:image')) return driveUrl;
    if (driveUrl.startsWith('https://lh3.googleusercontent.com')) return driveUrl;

    // Standard HTTP/HTTPS Non-Drive URLs
    if (!driveUrl.includes('drive.google.com') && !driveUrl.includes('docs.google.com') && driveUrl.startsWith('http')) {
        return driveUrl;
    }

    // Google Drive Specific Parsing
    let fileId = null;
    const match = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  driveUrl.match(/([a-zA-Z0-9_-]{28,})/);

    if (match) fileId = match[1];

    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : driveUrl;
};

window.formatDriveImageUrl = window.getDirectDriveImageUrl;

window.openImageZoom = (url) => {
    if (!url || url.includes('placeholder') || url.includes('No+Photo')) return;
    const directUrl = window.getDirectDriveImageUrl(url);
    window.open(directUrl, '_blank');
};

// ================================================================ */
// COMPRESSION & IMAGE HELPERS (FIXED v4.3 - WITH RETRY & SAFARI BUGFIX) */
// ================================================================ */

window.compressImageFile = async (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        try {
            if (!file) {
                return reject(new Error("No file provided for compression"));
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let w = img.width;
                        let h = img.height;

                        // Calculate aspect ratio with Math.floor to avoid fractional canvas bounds
                        if (w > h) {
                            if (w > maxWidth) {
                                h = Math.round(h * (maxWidth / w));
                                w = maxWidth;
                            }
                        } else {
                            if (h > maxHeight) {
                                w = Math.round(w * (maxHeight / h));
                                h = maxHeight;
                            }
                        }

                        canvas.width = Math.max(1, w);
                        canvas.height = Math.max(1, h);

                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            return reject(new Error("Failed to get 2D context"));
                        }

                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

                        // Cleanup Canvas memory context
                        canvas.width = 0;
                        canvas.height = 0;

                        resolve(compressedDataUrl);
                    } catch (err) {
                        reject(err);
                    }
                };

                img.onerror = () => reject(new Error("Failed to decode image data"));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error("Failed to read image file"));
            reader.readAsDataURL(file);
        } catch (err) {
            reject(err);
        }
    });
};

// ✅ FIXED: Compress with retry and exponential fallback
window.compressImageWithRetry = async (file, maxWidth = 800, maxHeight = 800, quality = 0.7, retries = 3) => {
    let lastError = null;
    for (let i = 0; i < retries; i++) {
        try {
            // Quality downgrade on retry attempts to ensure success on memory-constrained devices
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
// APP LAUNCH VIDEO LOGIC (FIXED v4.3)                             */
// ================================================================ */

window.handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');

    if (!overlay || !video) return;

    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') {
        overlay.remove();
        return;
    }

    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';

    let hasHidden = false;
    let safetyTimeout = null;

    const hideOverlay = () => {
        if (hasHidden) return;
        hasHidden = true;

        if (safetyTimeout) clearTimeout(safetyTimeout);
        sessionStorage.setItem('videoPlayedThisSession', 'true');

        overlay.style.transition = 'opacity 0.6s ease-out';
        overlay.style.opacity = '0';

        setTimeout(() => {
            if (overlay && overlay.parentNode) {
                overlay.remove();
            }
        }, 600);
    };

    // Auto-hide fallback after 6 seconds if video gets stuck or is too long
    safetyTimeout = setTimeout(hideOverlay, 6000);

    video.onended = hideOverlay;
    video.onerror = hideOverlay;

    if (skipBtn) {
        skipBtn.onclick = hideOverlay;
    }

    video.play().catch((err) => {
        console.warn("⚠️ Autoplay restricted or failed, hiding video overlay:", err);
        hideOverlay();
    });
};

document.addEventListener('DOMContentLoaded', window.handleLaunchVideo);

window.addEventListener('load', () => {
    setTimeout(() => {
        const o = document.getElementById('launchVideoOverlay');
        if (o) {
            o.style.transition = 'opacity 0.5s ease-out';
            o.style.opacity = '0';
            setTimeout(() => o.remove(), 500);
        }
    }, 6500);
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

        // Execute actual rendering of rows
        this.renderCallback(pageItems, start);

        // Render controls UI
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

        // Bind control events safely
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

// Initialize global paginators object
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

// ================================================================ */
// VIEW SWITCHER (FIXED v4.3 - LAYOUT PRESERVATION)               */
// ================================================================ */

window.showStaffView = function(viewId) {
    console.log(`📂 Switching to view: ${viewId}`);

    const authArea = document.getElementById('staff-auth-area');
    if (authArea) {
        authArea.classList.add('hidden');
        authArea.style.display = 'none';
    }

    const views = [
        'staff-dash-area',
        'security-main-container',
        'tasks-management-section',
        'asset-audit-section',
        'asset-disposal-section',
        'asset-transfer-section',
        'transfer-logs-section'
    ];

    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        // Clear inline display style so element preserves its native flex/grid CSS layout
        target.style.display = '';
    }

    if (viewId === 'tasks-management-section' && typeof window.loadRoleView === 'function') {
        window.loadRoleView(window.currentStaff);
    }

    if (typeof window.initTopBackButton === 'function') {
        window.initTopBackButton();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ================================================================ */
// AUTOMATIC SPINNER ATTACHMENT (FIXED v4.3 - VALIDATION SAFE)    */
// ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Override existing logout buttons
    const attachLogoutListeners = () => {
        const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn, [onclick*="logoutStaff"]');
        logoutBtns.forEach(btn => {
            if (!btn.dataset.logoutBound) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window.executeSecureLogout === 'function') {
                        window.executeSecureLogout();
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

    // Auto-catch all form submit events ONLY IF valid
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
            return; // Don't show spinner if HTML5 form validation fails
        }
        if (typeof window.showGlobalSpinner === 'function') {
            window.showGlobalSpinner("Saving Data...");
        }
    }, true);

    // Auto-catch all primary action buttons with validation check
    const attachButtonListeners = () => {
        document.querySelectorAll('button[type="submit"], .btn-primary, .submit-btn, .btn-submit-transfer').forEach(btn => {
            if (!btn.dataset.spinnerBound) {
                btn.addEventListener('click', (e) => {
                    const form = btn.closest('form');

                    // If button is inside a form, let form submit listener handle spinner safely
                    if (form) {
                        if (form.checkValidity()) {
                            setTimeout(() => {
                                if (typeof window.showGlobalSpinner === 'function') {
                                    window.showGlobalSpinner("Please wait...");
                                }
                            }, 50);
                        }
                    } else {
                        // Standalone buttons (not in forms)
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

    // Observe DOM changes to attach listeners to dynamic elements
    const observer = new MutationObserver(() => {
        attachLogoutListeners();
        attachButtonListeners();
    });

    observer.observe(document.body, { childList: true, subtree: true });
});

// ================================================================ */
// AUTOMATIC SPINNER ATTACHMENT (FIXED v4.3 - VALIDATION SAFE)    */
// ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Override existing logout buttons
    const attachLogoutListeners = () => {
        const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn, [onclick*="logoutStaff"]');
        logoutBtns.forEach(btn => {
            if (!btn.dataset.logoutBound) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window.executeSecureLogout === 'function') {
                        window.executeSecureLogout();
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

    // Auto-catch all form submit events ONLY IF valid
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
            return; // Don't show spinner if HTML5 form validation fails
        }
        if (typeof window.showGlobalSpinner === 'function') {
            window.showGlobalSpinner("Saving Data...");
        }
    }, true);

    // Auto-catch all primary action buttons with validation check
    const attachButtonListeners = () => {
        document.querySelectorAll('button[type="submit"], .btn-primary, .submit-btn, .btn-submit-transfer').forEach(btn => {
            if (!btn.dataset.spinnerBound) {
                btn.addEventListener('click', (e) => {
                    const form = btn.closest('form');

                    // If button is inside a form, let form submit listener handle spinner safely
                    if (form) {
                        if (form.checkValidity()) {
                            setTimeout(() => {
                                if (typeof window.showGlobalSpinner === 'function') {
                                    window.showGlobalSpinner("Please wait...");
                                }
                            }, 50);
                        }
                    } else {
                        // Standalone buttons (not in forms)
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

    // Observe DOM changes to attach listeners to dynamic elements
    const observer = new MutationObserver(() => {
        attachLogoutListeners();
        attachButtonListeners();
    });

    observer.observe(document.body, { childList: true, subtree: true });
});