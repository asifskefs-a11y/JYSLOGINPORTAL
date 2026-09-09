/**
 * ✅ UNIVERSAL IMAGE PROCESSOR (v1.0)
 * Synchronous global exposure for low-end device reliability.
 */
window.compressImageFile = async (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        try {
            if (!file) return reject(new Error("No file provided"));
            if (!file.type.startsWith('image/')) return reject(new Error("File is not an image"));

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let w = img.width;
                        let h = img.height;

                        if (w <= 0 || h <= 0) {
                            return reject(new Error("Invalid image dimensions"));
                        }

                        // Calculate aspect ratio
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
                        if (!ctx) return reject(new Error("Canvas context failed"));

                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, w, h);

                        // Export as JPEG
                        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

                        // Explicit cleanup
                        canvas.width = 0; canvas.height = 0;

                        resolve(compressedDataUrl);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = () => reject(new Error("Failed to decode image"));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
        } catch (fatal) {
            reject(fatal);
        }
    });
};

console.log("📸 Image Processor (Global) Ready");
