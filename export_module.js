// --- EXCEL EXPORT MODULE ---
window.downloadExcelReport = () => {
    try {
        if (!window.adminData) return alert("No data to export");
        const staffLogs = window.adminData.filter(r => r.type === 'staff').map(r => ({
            "Type": "Staff",
            "Mobile Number": r.mobileNumber || r.mobile || r.id || '-',
            "Full Name": r.fullName || r.name,
            "ADC Pass Number": r.adcPassNumber || '-',
            "Company Name": r.companyName || '-',
            "School Name": r.schoolName || '-',
            "Position": r.position || r.role || '-',
            "Company ID": r.companyIdNumber || '-',
            "Date": r.date,
            "In-Time": r.timeIn,
            "Out-Time": (r.checkOutTime || r.timeOut) ? (r.checkOutTime || r.timeOut) : (r.status === 'completed' ? 'RECORDED' : 'ACTIVE'),
            "Status": r.status,
            "Signature (In)": window.getDirectDriveImageUrl(r.signatureUrl || r.signature)
        }));
        const visitorLogs = window.adminData.filter(r => r.type === 'visitor').map(r => ({
            "Type": "Visitor",
            "Visitor ID": r.id || '-',
            "Visitor Name": r.name,
            "Mobile": r.mobile || '-',
            "Company": r.company || '-',
            "Purpose of Visit": r.purpose || '-',
            "Date": r.date,
            "In-Time": r.timeIn,
            "Out-Time": r.timeOut || '-',
            "Status": r.status,
            "Signature": window.getDirectDriveImageUrl(r.signatureUrl || r.signature)
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffLogs), "Staff Attendance");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitorLogs), "Visitor Log");
        XLSX.writeFile(wb, `Attendance_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Export Error:", e); }
};

window.exportTaskReportExcel = () => {
    try {
        if (!window.adminTasks) return alert("No task data to export");
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head></head>
            <body>
            <table border="1">
                <tr style="background-color: #10b981; color: white; font-weight: bold; height: 40px;">
                    <th>Task ID</th><th>School / Building</th><th>Area / Location</th><th>Assigned Dept / Role</th><th>Raised By</th><th>Raised Date</th><th>Raised Time</th><th>RT Technician</th><th>Closed Date</th><th>Closed Time</th><th>Status</th><th>Rejection Reason</th><th>Before Photo</th><th>After Photo</th>
                </tr>`;

        window.adminTasks.forEach(t => {
            const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
            const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
            const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
            const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;
            html += `
                <tr style="height: 80px; vertical-align: middle;">
                    <td>${t.id}</td><td>${t.schoolBuilding || '-'}</td><td>${t.location}</td><td>${t.targetRole}</td><td>${t.raisedByName || 'Admin'}</td>
                    <td>${rDT ? rDT.toLocaleDateString() : '-'}</td><td>${rDT ? rDT.toLocaleTimeString() : '-'}</td><td>${t.solvedByName || '-'}</td>
                    <td>${cDT ? cDT.toLocaleDateString() : '-'}</td><td>${cDT ? cDT.toLocaleTimeString() : '-'}</td>
                    <td style="font-weight: bold;">${t.status}</td><td>${t.rejectionReason || 'N/A'}</td>
                    <td width="100" align="center">${bImg.includes('http') ? `<img src="${bImg}" width="70" height="70">` : 'No Photo'}</td>
                    <td width="100" align="center">${aImg.includes('http') && !aImg.includes('No+Photo') ? `<img src="${aImg}" width="70" height="70">` : 'No Photo'}</td>
                </tr>`;
        });
        html += '</table></body></html>';
        const url = 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(html);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Task_Audit_Report_${Date.now()}.xls`;
        link.click();
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
            { header: '27. Old School Name', key: 'f27', width: 25 },
            { header: '28. Transaction No', key: 'f28', width: 20 },
            { header: '29. Asset Useful Life', key: 'f29', width: 15 },
            { header: '30. Asset Vendor Name', key: 'f30', width: 25 },
            { header: '31. Old Asset Barcode', key: 'f31', width: 20 },
            { header: '32. FAR Old Asset Barcode', key: 'f32', width: 30 },
            { header: '33. Invoice No', key: 'f33', width: 20 },
            { header: '34. DN No', key: 'f34', width: 20 },
            { header: '35. Remarks', key: 'f35', width: 30 },
            { header: '36. Physical Asset Register No', key: 'f36', width: 25 },
            { header: '37. Fixed Asset Register No', key: 'f37', width: 25 },
            { header: '38. Mapping Criteria', key: 'f38', width: 20 },
            { header: '39. Audit Photo (After)', key: 'f39', width: 40 },
            { header: '40. Disposal Photo (Before)', key: 'f40', width: 40 }
        ];

        window.allAssets.forEach(a => {
            sheet.addRow({
                f1: a.assetBarcode, f2: a.serialNo, f3: a.modelDescription, f4: a.assetCondition, f5: a.priceStatus,
                f6: a.unitCost, f7: a.assetDescription, f8: a.serviceDate, f9: a.manufacturer, f10: a.majorCategory,
                f11: a.subMajorCategory, f12: a.subMinorCategory, f13: a.dofMajor, f14: a.dofMinor, f15: a.category,
                f16: a.classification, f17: a.locationName, f18: a.esisId, f19: a.buildingName, f20: a.roomName,
                f21: a.roomNo, f22: a.currentRoomBarcode, f23: a.floorNo, f24: a.floorDescription, f25: a.barcodeStatus,
                f26: a.assetStatus, f27: a.oldSchoolName, f28: a.transactionNo, f29: a.usefulLife, f30: a.vendorName,
                f31: a.oldBarcode, f32: a.farBarcode, f33: a.invoiceNo, f34: a.dnNo, f35: a.remarks,
                f36: a.physRegNo, f37: a.fixedAssetRegNo, f38: a.mappingCriteria,
                f39: a.initialAuditPhoto || "",
                f40: a.disposalDamagedPhoto || ""
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Master_Asset_Register_${Date.now()}.xlsx`);
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
