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
// ✅ EXPORT: Contractor Report
// ================================================
window._downloadContractorExcelReport = async () => {
    try {
        if (!window.appCache.contractors || window.appCache.contractors.length === 0) {
            if (window.refreshDashboardData) await window.refreshDashboardData();
        }
        const contractors = window.appCache.contractors || [];
        if (contractors.length === 0) return alert("No contractor data to export.");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Contractor Logs');

        sheet.columns = [
            { header: 'Badge No', key: 'contractorId', width: 22 },
            { header: 'Full Name', key: 'name', width: 22 },
            { header: 'Mobile', key: 'mobile', width: 22 },
            { header: 'Company', key: 'company', width: 22 },
            { header: 'Work Details', key: 'purpose', width: 22 },
            { header: 'Date', key: 'date', width: 22 },
            { header: 'In-Time', key: 'timeIn', width: 22 },
            { header: 'Out-Time', key: 'timeOut', width: 22 },
            { header: 'Status', key: 'status', width: 22 },
            { header: 'Signature', key: 'sig', width: 22 }
        ];

        for (let i = 0; i < contractors.length; i++) {
            const c = contractors[i];
            sheet.addRow({
                contractorId: c.contractorId,
                name: c.name,
                mobile: c.mobile,
                company: c.company,
                purpose: c.purpose,
                date: c.date,
                timeIn: c.timeIn,
                timeOut: c.outTime || "-",
                status: c.status
            });
            if (c.signatureUrl) {
                const buf = await getImageBuffer(c.signatureUrl);
                if (buf) addImageToSheet(workbook, sheet, buf, 9, i + 1);
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Contractor_Report_${Date.now()}.xlsx`);
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
// ✅ EXPORT: Asset Register (DYNAMIC HEADER SYSTEM)
// ================================================
window._downloadMasterAssetReport = async () => {
    try {
        const assets = window.appCache?.assets || [];
        if (assets.length === 0) return alert("No asset data to export!");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Asset Master Register');

        // 1. DYNAMIC HEADER EXTRACTION
        // We look at the first record to find all unique keys
        const sample = assets[0];
        const excludeKeys = [
            'updatedAt', 'createdAt', 'assetBarcode', 'barcode',
            'initialAuditPhotoData', 'disposalPhotoData', 'assetStatus',
            'auditPhotoUrl', 'disposalPhotoUrl', 'photoUrl', 'assetCondition',
            'lastAuditTimestamp', 'lastAuditBy', 'lastTransferId', 'lastDisposalTimestamp'
        ];

        // Always ensure Barcode is first if available, then dynamic headers
        const barcodeKey = assets.some(a => a.assetBarcode) ? 'assetBarcode' : (assets.some(a => a.barcode) ? 'barcode' : null);
        const dynamicKeys = Object.keys(sample).filter(k => !excludeKeys.includes(k));

        const finalHeaderKeys = [];
        if (barcodeKey) finalHeaderKeys.push(barcodeKey);
        finalHeaderKeys.push(...dynamicKeys);

        // 2. BUILD COLUMNS DYNAMICALLY
        sheet.columns = finalHeaderKeys.map(k => ({
            header: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1').trim(),
            key: k,
            width: 25
        }));

        // 3. MAP DATA & ADD ROWS
        // Filter out disposed assets for the master register
        const activeAssets = assets.filter(a => a.assetStatus !== 'Disposed');
        activeAssets.forEach(a => {
            const rowData = {};
            finalHeaderKeys.forEach(k => {
                const val = a[k];
                rowData[k] = (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
            });
            sheet.addRow(rowData);
        });

        // 4. GENERATE FILE
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Asset_Master_Export_${Date.now()}.xlsx`);
        console.log("✅ Dynamic Asset Export Generated.");

    } catch (e) {
        console.error("❌ Export Error:", e);
        alert("Export failed: " + e.message);
    }
};

// ================================================
// ✅ EXPORT: Disposed Assets (DYNAMIC HEADER SYSTEM)
// ================================================
window._downloadDisposedAssetReport = async () => {
    try {
        const assets = window.appCache?.assets || [];
        const disposed = assets.filter(a => a.assetStatus === 'Disposed');
        if (disposed.length === 0) return alert("No disposal data to export!");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Disposal Registry');

        const sample = disposed[0];
        const excludeKeys = ['updatedAt', 'createdAt', 'initialAuditPhotoData', 'disposalPhotoData', 'auditPhotoUrl', 'disposalPhotoUrl', 'photoUrl'];
        const dynamicKeys = Object.keys(sample).filter(k => !excludeKeys.includes(k));

        sheet.columns = dynamicKeys.map(k => ({
            header: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1').trim(),
            key: k,
            width: 25
        }));

        disposed.forEach(a => {
            const rowData = {};
            dynamicKeys.forEach(k => {
                const val = a[k];
                rowData[k] = (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
            });
            sheet.addRow(rowData);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Asset_Disposal_Export_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// ================================================
// ✅ EXPORT: Transfer Logs (DYNAMIC HEADER SYSTEM)
// ================================================
window._exportTransferReport = async () => {
    try {
        const transfers = window.appCache?.transfers || [];
        if (transfers.length === 0) return alert("No transfer logs to export!");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Movement Logs');

        const sample = transfers[0];
        const excludeKeys = ['securitySignatureUrl', 'receivedSignatureUrl', 'transferPhotoUrl', 'auditPhotoUrl', 'auditPhoto'];
        const dynamicKeys = Object.keys(sample).filter(k => !excludeKeys.includes(k));

        sheet.columns = dynamicKeys.map(k => ({
            header: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1').trim(),
            key: k,
            width: 25
        }));

        transfers.forEach(t => {
            const rowData = {};
            dynamicKeys.forEach(k => {
                const val = t[k];
                rowData[k] = (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
            });
            sheet.addRow(rowData);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Asset_Movement_Export_${Date.now()}.xlsx`);
    } catch (e) { console.error(e); }
};

// Aliases for non-prefixed calls from UI
window.downloadExcelReport = window._downloadExcelReport;
window.downloadContractorExcelReport = window._downloadContractorExcelReport;
window.exportTaskReportExcel = window._exportTaskReportExcel;
window.downloadMasterAssetReport = window._downloadMasterAssetReport;
window.downloadDisposedAssetReport = window._downloadDisposedAssetReport;
window.exportTransferReport = window._exportTransferReport;

console.log("✅ export_module.js loaded (UNDERSCORE PREFIX & CORS FIXED)");
