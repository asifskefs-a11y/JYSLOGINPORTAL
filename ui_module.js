import { SHEETS_URL } from './firebase_config.js';

// --- GLOBAL UTILITIES ---
window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl) return 'https://placehold.co/400x300?text=No+Photo';
    try {
        const idMatch = driveUrl.match(/[-\w]{25,}/);
        if (idMatch && idMatch[0]) return 'https://lh3.googleusercontent.com/d/' + idMatch[0];
    } catch (e) {}
    return driveUrl;
};

window.uploadToDrive = async (payload) => {
    try {
        const type = payload.type || 'task_photo';
        if (type === 'active_asset' || type === 'disposed_asset') {
            payload.folderType = type;
        }
        payload.type = type;
        const response = await fetch(SHEETS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            mode: 'cors'
        });
        const result = await response.json();
        console.log("UPLOAD_DEBUG", "Raw JSON Response: " + JSON.stringify(result));
        if (result.status === 'success' || result.fileUrl || result.signatureUrl) {
            return result;
        } else {
            return { status: 'error', message: result.message || "Upload failed" };
        }
    } catch (e) {
        return { status: 'error', message: e.message };
    }
};

window.compressImageFile = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
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
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.openImageZoom = (url) => { if(!url || url.includes('placeholder')) return; window.open(url, '_blank'); };

// --- GLOBAL NAVIGATION ---
window.showView = (viewId) => {
    try {
        const pageMap = {
            'view-landing': 'index.html',
            'view-visitor': 'visitor.html',
            'view-staff': 'staff-login.html',
            'view-admin-auth': 'admin.html',
            'view-admin-dash': 'admin.html'
        };

        if (pageMap[viewId] && !window.location.pathname.includes(pageMap[viewId])) {
            window.location.href = pageMap[viewId];
            return;
        }

        document.querySelectorAll('.view-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
            s.style.display = 'none';
        });

        const target = document.getElementById(viewId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            target.style.display = 'flex';
        }
        window.scrollTo(0, 0);
        window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
    } catch (e) { console.error("Nav Error:", e); }
};
