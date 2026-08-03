// ================================================
// EXPORT MODULE - COMPLETE FINAL VERSION
// ✅ ALL FUNCTIONS EXPORTED WITH UNDERSCORE PREFIX
// ✅ SILENT CORS FALLBACK - FORCED HTTPS
// ================================================

// ✅ FIXED: FileSaver.js Fallback
// Ensures reports can be downloaded even if the FileSaver CDN is blocked or fails.
if (typeof saveAs === 'undefined') {
    window.saveAs = function(blob, filename) {
        try {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
        } catch (e) {
            console.error("Fallback download failed:", e);
            alert("Download failed. Please try again.");
        }
    };
    console.warn("⚠️ FileSaver.js not loaded - using fallback download");
}

// ✅ FIXED: Robust image fetch with multiple fallbacks & forced https
const getImageBuffer = async (url) => {
    if (!url || !url.includes('http') || url.includes('placeholder')) return null;

    // Force https
    let cleanUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url;

    // Array of URL formats to try
    const urlFormats = [
        (u) => u, // Original
        (u) => u.replace('lh3.googleusercontent.com/d/', 'drive.google.com/uc?export=view&id='),
        (u) => {
            const match = u.match(/[-\w]{25,}/);
            return match ? `https://lh3.googleusercontent.com/d/${match[0]}` : null;
        }
    ];

    for (const format of urlFormats) {
        try {
            const formattedUrl = format(cleanUrl);
            if (!formattedUrl) continue;

            const response = await fetch(formattedUrl, {
                mode: 'cors',
                headers: {
                    'Accept': 'image/*',
                    'Cache-Control': 'no-cache'
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                return await blob.arrayBuffer();
            }
        } catch (e) {
            console.debug("Image fetch attempt failed:", e.message);
        }
    }

    // ✅ SILENT RETURN - Excel continues without image
    console.warn("⚠️ Could not fetch image:", url);
    return null;
};

const addImageToSheet = (workbook, sheet, buffer, col, row, width = 100, height = 50) => {
    if (!buffer) return;
    try {
        const imageId = workbook.addImage({
            buffer: buffer,
            extension: 'jpeg',
        });
        sheet.addImage(imageId, {
            tl: { col: col, row: row },
            ext: { width: width, height: height },
            editAs: 'oneCell'
        });
    } catch (e) {
        console.warn("⚠️ ExcelJS addImage fail:", e.message);
    }
};

// ================================================
// ✅ EXPORT: Visitor + Staff Report
// ================================================
window._downloadExcelReport = async () => {
    try {
        if (!window.adminData || window.adminData.length === 0) {
            if (window.refreshDashboardData) await window.refreshDashboardData();
            if (!window.adminData || window.adminData.length === 0) return alert("No data to export.");
        }

        const workbook = new ExcelJS.Workbook();
        const vSheet = workbook.addWorksheet('Visitor Logs');
        const sSheet = workbook.addWorksheet('Staff Attendance');

        vSheet.columns = [
            { header: 'Pass No', key: 'id', width: 22 },
            { header: 'Full Name', key: 'name', width: 22 },
            { header: 'Mobile', key: 'mobile', width: 22 },
            { header: 'Company', key: 'company', width: 22 },
            { header: 'Purpose', key: 'purpose', width: 22 },
            { header: 'Date', key: 'date', width: 22 },
            { header: 'In-Time', key: 'timeIn', width: 22 },
            { header: 'Out-Time', key: 'timeOut', width: 22 },
            { header: 'Status', key: 'status', width: 22 },
            { header: 'Signature', key: 'sig', width: 22 }
        ];

        sSheet.columns = [
            { header: 'Pass No', key: 'id', width: 22 },
            { header: 'Full Name', key: 'name', width: 22 },
            { header: 'Mobile', key: 'mobile', width: 22 },
            { header: 'Branch', key: 'school', width: 22 },
            { header: 'Role', key: 'role', width: 22 },
            { header: 'Date', key: 'date', width: 22 },
            { header: 'In-Time', key: 'timeIn', width: 22 },
            { header: 'Out-Time', key: 'timeOut', width: 22 },
            { header: 'Status', key: 'status', width: 22 },
            { header: 'Signature', key: 'sig', width: 22 }
        ];

        const visitors = window.adminData.filter(r => r.type === 'visitor');
        const staff = window.adminData.filter(r => r.type === 'staff');

        for (let i = 0; i < visitors.length; i++) {
            const v = visitors[i];
            vSheet.addRow({ id: v.id, name: v.name, mobile: v.mobile, company: v.company, purpose: v.purpose, date: v.date, timeIn: v.timeIn, timeOut: v.outTime || "-", status: v.status });
            if (v.signatureUrl) {
                const buf = await getImageBuffer(v.signatureUrl);
                if (buf) addImageToSheet(workbook, vSheet, buf, 9, i + 1);
            }
        }

        for (let i = 0; i < staff.length; i++) {
            const s = staff[i];
            sSheet.addRow({ id: s.adekPass || s.mobile, name: s.name, mobile: s.mobile, school: s.branch, role: s.role, date: s.date, timeIn: s.timeIn, timeOut: s.checkOutTime || "-", status: s.status });
            if (s.signatureUrl) {
                const buf = await getImageBuffer(s.signatureUrl);
                if (buf) addImageToSheet(workbook, sSheet, buf, 9, i + 1);
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Portal_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// ================================================
// ✅ EXPORT: Task Report
// ================================================
window._exportTaskReportExcel = async () => {
    try {
        if (!window.appCache.tasks) return alert("No task data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Tasks');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 20 },
            { header: 'School', key: 'school', width: 20 },
            { header: 'Location', key: 'loc', width: 20 },
            { header: 'Details', key: 'det', width: 30 },
            { header: 'Raised By', key: 'by', width: 20 },
            { header: 'Status', key: 'stat', width: 15 }
        ];

        const tasks = window.appCache.tasks;
        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            sheet.addRow({ id: t.id, school: t.assignedSchool, loc: t.location, det: t.details, by: t.raisedByName, stat: t.status });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Task_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// ================================================
// ✅ EXPORT: Asset Register
// ================================================
window._downloadMasterAssetReport = async () => {
    try {
        if (!window.appCache.assets) return alert("No asset data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Assets');
        sheet.columns = [
            { header: 'Barcode', key: 'bc', width: 20 },
            { header: 'Description', key: 'desc', width: 30 },
            { header: 'Location', key: 'loc', width: 25 },
            { header: 'Condition', key: 'cond', width: 15 }
        ];

        window.appCache.assets.forEach(a => {
            if (a.assetStatus !== 'Disposed') sheet.addRow({ bc: a.assetBarcode, desc: a.assetDescription, loc: a.locationName, cond: a.assetCondition });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Asset_Register_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// ================================================
// ✅ EXPORT: Disposed Assets
// ================================================
window._downloadDisposedAssetReport = async () => {
    try {
        if (!window.appCache.assets) return alert("No asset data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Disposal');
        sheet.columns = [
            { header: 'Barcode', key: 'bc', width: 20 },
            { header: 'Reason', key: 're', width: 30 },
            { header: 'Disposed By', key: 'by', width: 20 }
        ];

        window.appCache.assets.forEach(a => {
            if (a.assetStatus === 'Disposed') sheet.addRow({ bc: a.assetBarcode, re: a.disposalReason, by: a.disposedBy });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Disposal_Logs_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// ================================================
// ✅ EXPORT: Transfer Logs
// ================================================
window._exportTransferReport = async () => {
    try {
        if (!window.appCache.transfers) return alert("No transfer data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Transfers');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 20 },
            { header: 'Barcode', key: 'bc', width: 20 },
            { header: 'Collector', key: 'co', width: 20 }
        ];

        window.appCache.transfers.forEach(t => {
            sheet.addRow({ id: t.transferId, bc: t.assetBarcode, co: t.collectorName });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Transfer_Logs_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

console.log("✅ export_module.js loaded (UNDERSCORE PREFIX & CORS FIXED)");
