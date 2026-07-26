// Helper to fetch image and convert to ArrayBuffer for ExcelJS
const getImageBuffer = async (url) => {
    if (!url || !url.includes('http') || url.includes('placeholder')) return null;
    try {
        const directUrl = window.getDirectDriveImageUrl(url);
        // Using a proxy or direct fetch depending on CORS.
        // Note: Google Drive lh3/uc links usually allow CORS for web origins.
        const response = await fetch(directUrl, { mode: 'cors' });
        if (!response.ok) throw new Error("Fetch failed");
        const blob = await response.blob();
        return await blob.arrayBuffer();
    } catch (e) {
        console.warn("Excel Image Buffer Error:", e, url);
        return null;
    }
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
    } catch (e) { console.error("ExcelJS addImage fail:", e); }
};

window.downloadExcelReport = async () => {
    try {
        if (!window.adminData) return alert("No data to export");

        const workbook = new ExcelJS.Workbook();

        // --- 1. VISITOR LOGS WORKSHEET ---
        const vSheet = workbook.addWorksheet('Visitor Logs');
        const vCols = [
            { header: 'Visitor ID / Pass No', key: 'id' },
            { header: 'Full Name', key: 'name' },
            { header: 'Mobile', key: 'mobile' },
            { header: 'Company', key: 'company' },
            { header: 'Purpose of Visit', key: 'purpose' },
            { header: 'Date', key: 'date' },
            { header: 'In-Time', key: 'timeIn' },
            { header: 'Out-Time', key: 'timeOut' },
            { header: 'Status', key: 'status' },
            { header: 'Signature', key: 'sig', width: 22 }
        ];
        vSheet.columns = vCols.map(c => ({ ...c, width: c.width || 22 }));

        // --- 2. STAFF ATTENDANCE WORKSHEET ---
        const sSheet = workbook.addWorksheet('Staff Attendance');
        const sCols = [
            { header: 'Staff ID / Pass No', key: 'id' },
            { header: 'Full Name', key: 'name' },
            { header: 'Mobile', key: 'mobile' },
            { header: 'Department / Company', key: 'company' },
            { header: 'School Branch', key: 'school' },
            { header: 'Position', key: 'role' },
            { header: 'Date', key: 'date' },
            { header: 'In-Time', key: 'timeIn' },
            { header: 'Out-Time', key: 'timeOut' },
            { header: 'Status', key: 'status' },
            { header: 'Signature', key: 'sig', width: 22 }
        ];
        sSheet.columns = sCols.map(c => ({ ...c, width: c.width || 22 }));

        // Global Professional Styling Helper
        const formatExecutiveSheet = (sheet) => {
            const headerRow = sheet.getRow(1);
            headerRow.height = 35;
            headerRow.eachCell((cell) => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };
            });
        };

        formatExecutiveSheet(vSheet);
        formatExecutiveSheet(sSheet);

        const visitors = window.adminData.filter(r => r.type === 'visitor');
        const staff = window.adminData.filter(r => r.type === 'staff');

        // Process Visitors
        for (let i = 0; i < visitors.length; i++) {
            const r = visitors[i];
            const sigUrl = r.checkInSignature || r.checkInSignatureUrl || r.signatureUrl || r.signature;
            const outTimeDisplay = (r.timeOut || r.checkOutTime) ? (r.timeOut || r.checkOutTime) : "-";

            const row = vSheet.addRow({
                id: r.id || "-", name: r.name || "-", mobile: r.mobile || "-",
                company: r.company || "-", purpose: r.purpose || "-",
                date: r.date || "-", timeIn: r.timeIn || "-", timeOut: outTimeDisplay,
                status: r.status || "-", sig: ""
            });
            row.height = 65;
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };
            });

            if (sigUrl) {
                const buffer = await getImageBuffer(sigUrl);
                if (buffer) {
                    const imageId = workbook.addImage({ buffer, extension: 'png' });
                    vSheet.addImage(imageId, {
                        tl: { col: 9, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
        }

        // Process Staff
        for (let i = 0; i < staff.length; i++) {
            const r = staff[i];
            const sigUrl = r.checkInSignature || r.checkInSignatureUrl || r.signatureUrl || r.signature;
            const outTime = (r.checkOutTime || r.timeOut || r.outTime) ? (r.checkOutTime || r.timeOut || r.outTime) : (r.status === 'completed' || r.status === 'checked_out' || r.status === 'SIGNED OUT' ? 'RECORDED' : 'ACTIVE');

            const row = sSheet.addRow({
                id: r.adcPassNumber || r.adekPass || r.mobile || "-", name: r.name || "-", mobile: r.mobile || "-",
                company: r.department || r.company || "-", school: r.schoolBranch || r.branch || "-",
                role: r.position || r.role || "-", date: r.date || "-", timeIn: r.timeIn, timeOut: outTime,
                status: r.status || "-", sig: ""
            });
            row.height = 65;
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };
            });

            if (sigUrl) {
                const buffer = await getImageBuffer(sigUrl);
                if (buffer) {
                    const imageId = workbook.addImage({ buffer, extension: 'png' });
                    sSheet.addImage(imageId, {
                        tl: { col: 10, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
        }

        // Final Auto-Adjust Column Widths
        [vSheet, sSheet].forEach(sheet => {
            sheet.columns.forEach(column => {
                let maxLen = column.header.length;
                sheet.getColumn(column.key).eachCell({ includeEmpty: true }, cell => {
                    const len = cell.value ? cell.value.toString().length : 0;
                    if (len > maxLen) maxLen = len;
                });
                column.width = Math.max(22, maxLen + 10);
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Portal_Executive_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Export Error:", e); }
};

window.exportTaskReportExcel = async () => {
    try {
        if (!window.adminTasks) return alert("No task data to export");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Task Audit Report');

        sheet.columns = [
            { header: 'TASK ID', key: 'id', width: 22 },
            { header: 'SCHOOL', key: 'school', width: 25 },
            { header: 'AREA', key: 'area', width: 20 },
            { header: 'DETAILS', key: 'details', width: 35 },
            { header: 'DEPT', key: 'dept', width: 18 },
            { header: 'RAISED BY', key: 'raisedBy', width: 20 },
            { header: 'RAISED DATE', key: 'rDate', width: 15 },
            { header: 'RAISED TIME', key: 'rTime', width: 15 },
            { header: 'FIXED BY', key: 'fixedBy', width: 20 },
            { header: 'CLOSED DATE', key: 'cDate', width: 15 },
            { header: 'CLOSED TIME', key: 'cTime', width: 15 },
            { header: 'STATUS', key: 'status', width: 15 },
            { header: 'REASON', key: 'reason', width: 20 },
            { header: 'BEFORE', key: 'before', width: 22 },
            { header: 'AFTER', key: 'after', width: 22 }
        ];

        // Format Executive Header
        const headerRow = sheet.getRow(1);
        headerRow.height = 35;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        for (let i = 0; i < window.adminTasks.length; i++) {
            const t = window.adminTasks[i];
            const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
            const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;

            const row = sheet.addRow({
                id: t.id,
                school: t.assignedSchool || t.schoolName || "-",
                area: t.location || "-",
                details: t.details || t.description || "-",
                dept: t.assignedRole || t.targetRole || "-",
                raisedBy: t.raisedByName || "Admin",
                rDate: rDT ? rDT.toLocaleDateString() : "-",
                rTime: rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "-",
                fixedBy: t.solvedByName || "-",
                cDate: cDT ? cDT.toLocaleDateString() : "-",
                cTime: cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "-",
                status: t.status,
                reason: t.rejectionReason || "N/A",
                before: "", after: ""
            });

            row.height = 65;
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };
            });

            // Embed Task Photos
            const bUrl = t.beforePhotoUrl || t.beforePhoto || t.taskPhoto;
            const aUrl = t.afterPhotoUrl || t.afterPhoto;

            if (bUrl) {
                const bBuffer = await getImageBuffer(bUrl);
                if (bBuffer) {
                    const imgId = workbook.addImage({ buffer: bBuffer, extension: 'jpeg' });
                    sheet.addImage(imgId, {
                        tl: { col: 13, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
            if (aUrl) {
                const aBuffer = await getImageBuffer(aUrl);
                if (aBuffer) {
                    const imgId = workbook.addImage({ buffer: aBuffer, extension: 'jpeg' });
                    sheet.addImage(imgId, {
                        tl: { col: 14, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Task_Audit_Full_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Task Export Error:", e); }
};

window.downloadMasterAssetReport = async () => {
    try {
        if (!window.allAssets) return alert("No asset data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Master Asset Register');

        sheet.columns = [
            { header: '1. Asset Barcode', key: 'f1', width: 20 },
            { header: '2. Serial No.', key: 'f2', width: 20 },
            { header: '3. Model Description', key: 'f3', width: 30 },
            { header: '4. Asset Condition', key: 'f4', width: 15 },
            { header: '5. Price Status', key: 'f5', width: 15 },
            { header: '6. Asset Unit Cost', key: 'f6', width: 15 },
            { header: '7. Asset Description', key: 'f7', width: 30 },
            { header: '8. Date Place in Service', key: 'f8', width: 20 },
            { header: '9. Manufacturer', key: 'f9', width: 20 },
            { header: '10. Major Category', key: 'f10', width: 20 },
            { header: '11. Sub Major Category', key: 'f11', width: 20 },
            { header: '12. Sub Minor Category', key: 'f12', width: 20 },
            { header: '13. DOF Major', key: 'f13', width: 15 },
            { header: '14. DOF Minor', key: 'f14', width: 15 },
            { header: '15. Category', key: 'f15', width: 15 },
            { header: '16. Classification', key: 'f16', width: 20 },
            { header: '17. Location Name', key: 'f17', width: 20 },
            { header: '18. School ESIS ID', key: 'f18', width: 15 },
            { header: '19. School Building', key: 'f19', width: 25 },
            { header: '20. Room Name', key: 'f20', width: 20 },
            { header: '21. Room No', key: 'f21', width: 15 },
            { header: '22. Room Barcode', key: 'f22', width: 20 },
            { header: '23. Floor No', key: 'f23', width: 10 },
            { header: '24. Floor Description', key: 'f24', width: 20 },
            { header: '25. Barcode Status', key: 'f25', width: 15 },
            { header: '26. Asset Status', key: 'f26', width: 15 },
            { header: '27. Old School Name', key: 'f27', width: 25 },
            { header: '28. Transaction No', key: 'f28', width: 20 },
            { header: '29. Asset Useful Life', key: 'f29', width: 15 },
            { header: '30. Asset Vendor Name', key: 'f30', width: 25 },
            { header: '31. Old Asset Barcode', key: 'f31', width: 20 },
            { header: '32. FAR Old Asset Barcode', key: 'f32', width: 30 },
            { header: '33. Invoice No', key: 'f33', width: 20 },
            { header: '34. DN No', key: 'f34', width: 20 },
            { header: '35. Remarks', key: 'f35', width: 30 },
            { header: '36. Physical Reg No', key: 'f36', width: 25 },
            { header: '37. Fixed Asset Reg No', key: 'f37', width: 25 },
            { header: '38. Mapping Criteria', key: 'f38', width: 20 },
            { header: '39. Audit Photo', key: 'f39', width: 22 },
            { header: '40. Disposal Photo', key: 'f40', width: 22 }
        ];

        // Format Executive Header
        const headerRow = sheet.getRow(1);
        headerRow.height = 35;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        for (let i = 0; i < window.allAssets.length; i++) {
            const a = window.allAssets[i];
            const row = sheet.addRow({
                f1: a.assetBarcode, f2: a.serialNo, f3: a.modelDescription, f4: a.assetCondition, f5: a.priceStatus,
                f6: a.unitCost, f7: a.assetDescription, f8: a.serviceDate, f9: a.manufacturer, f10: a.majorCategory,
                f11: a.subMajorCategory, f12: a.subMinorCategory, f13: a.dofMajor, f14: a.dofMinor, f15: a.category,
                f16: a.classification, f17: a.locationName, f18: a.esisId, f19: a.buildingName, f20: a.roomName,
                f21: a.roomNo, f22: a.currentRoomBarcode, f23: a.floorNo, f24: a.floorDescription, f25: a.barcodeStatus,
                f26: a.assetStatus, f27: a.oldSchoolName, f28: a.transactionNo, f29: a.usefulLife, f30: a.vendorName,
                f31: a.oldBarcode, f32: a.farBarcode, f33: a.invoiceNo, f34: a.dnNo, f35: a.remarks,
                f36: a.physRegNo, f37: a.fixedAssetRegNo, f38: a.mappingCriteria,
                f39: "", f40: ""
            });

            row.height = 65;
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };
            });

            // Embed Asset Photos
            const iUrl = a.initialAuditPhoto || a.auditPhotoUrl;
            const dUrl = a.disposalDamagedPhoto || a.disposalPhotoUrl;

            if (iUrl) {
                const iBuffer = await getImageBuffer(iUrl);
                if (iBuffer) {
                    const imgId = workbook.addImage({ buffer: iBuffer, extension: 'jpeg' });
                    sheet.addImage(imgId, {
                        tl: { col: 38, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
            if (dUrl) {
                const dBuffer = await getImageBuffer(dUrl);
                if (dBuffer) {
                    const imgId = workbook.addImage({ buffer: dBuffer, extension: 'jpeg' });
                    sheet.addImage(imgId, {
                        tl: { col: 39, row: i + 1, colOff: 20, rowOff: 10 },
                        ext: { width: 100, height: 50 },
                        editAs: 'oneCell'
                    });
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Master_Asset_Executive_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Asset Export Error:", e); }
};

window.downloadDisposedAssetReport = async () => {
    try {
        const disposed = window.allAssets.filter(a => a.assetStatus === 'Disposed');
        if (!disposed.length) return alert("No disposed assets to export!");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Asset Disposal List');

        sheet.columns = [
            { header: '1. Asset Barcode', key: 'f1', width: 20 },
            { header: '2. Serial No.', key: 'f2', width: 20 },
            { header: '3. Model Description', key: 'f3', width: 30 },
            { header: '4. Asset Condition', key: 'f4', width: 15 },
            { header: '5. Price Status', key: 'f5', width: 15 },
            { header: '6. Asset Unit Cost', key: 'f6', width: 15 },
            { header: '7. Asset Description', key: 'f7', width: 30 },
            { header: '8. Date Place in Service', key: 'f8', width: 20 },
            { header: '9. Manufacturer', key: 'f9', width: 20 },
            { header: '10. Major Category', key: 'f10', width: 20 },
            { header: '11. Sub Major Category', key: 'f11', width: 20 },
            { header: '12. Sub Minor Category', key: 'f12', width: 20 },
            { header: '13. DOF Major', key: 'f13', width: 15 },
            { header: '14. DOF Minor', key: 'f14', width: 15 },
            { header: '15. Category', key: 'f15', width: 15 },
            { header: '16. Classification [Asset Name]', key: 'f16', width: 20 },
            { header: '17. Location Name', key: 'f17', width: 20 },
            { header: '18. School ESIS ID', key: 'f18', width: 15 },
            { header: '19. School Building Name', key: 'f19', width: 25 },
            { header: '20. Room Name', key: 'f20', width: 20 },
            { header: '21. Room No', key: 'f21', width: 15 },
            { header: '22. Room Barcode', key: 'f22', width: 20 },
            { header: '23. Floor No', key: 'f23', width: 10 },
            { header: '24. Floor Description', key: 'f24', width: 20 },
            { header: '25. Barcode Status', key: 'f25', width: 15 },
            { header: '26. Asset Status', key: 'f26', width: 15 },
            { header: 'Disposal Reason', key: 'reason', width: 30 },
            { header: 'Scrap Location', key: 'loc', width: 25 },
            { header: 'Disposed By', key: 'by', width: 20 },
            { header: 'Disposal Date', key: 'date', width: 15 },
            { header: 'Audit Photo (After)', key: 'photo_before', width: 40 },
            { header: 'Disposal Photo (Before)', key: 'photo_after', width: 40 }
        ];

        disposed.forEach(a => {
            sheet.addRow({
                f1: a.assetBarcode, f2: a.serialNo, f3: a.modelDescription, f4: a.assetCondition, f5: a.priceStatus,
                f6: a.unitCost, f7: a.assetDescription, f8: a.serviceDate, f9: a.manufacturer, f10: a.majorCategory,
                f11: a.subMajorCategory, f12: a.subMinorCategory, f13: a.dofMajor, f14: a.dofMinor, f15: a.category,
                f16: a.classification, f17: a.locationName, f18: a.esisId, f19: a.buildingName, f20: a.roomName,
                f21: a.roomNo, f22: a.currentRoomBarcode, f23: a.floorNo, f24: a.floorDescription, f25: a.barcodeStatus,
                f26: a.assetStatus,
                reason: a.disposalReason || "-",
                loc: a.scrapLocation || "-",
                by: a.disposedBy || "-",
                date: a.disposalDate || "-",
                photo_before: a.initialAuditPhoto || "",
                photo_after: a.disposalDamagedPhoto || ""
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Disposed_Assets_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Disposal Export Error:", e); }
};
