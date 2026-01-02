// Firebase Storage Module - File Attachments
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { app } from './firebase-config.js';
import { showAlert } from '../components/modal.js';

// Initialize Storage
const storage = getStorage(app);

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt'
};

// Upload file to Firebase Storage
export async function uploadAttachment(file, eventId) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showAlert(`檔案太大！最大限制 ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        return null;
    }

    // Validate file type
    if (!ALLOWED_TYPES[file.type]) {
        showAlert('不支援此檔案類型！\n支援：圖片、PDF、Word、Excel、TXT');
        return null;
    }

    try {
        // Create unique filename
        const timestamp = Date.now();
        const ext = ALLOWED_TYPES[file.type];
        const filename = `${eventId}_${timestamp}.${ext}`;
        const storagePath = `attachments/${eventId}/${filename}`;

        // Create storage reference
        const storageRef = ref(storage, storagePath);

        // Upload file
        console.log('[Storage] Uploading:', storagePath);
        const snapshot = await uploadBytes(storageRef, file);

        // Get download URL
        const downloadURL = await getDownloadURL(snapshot.ref);

        console.log('[Storage] Upload complete:', downloadURL);

        return {
            name: file.name,
            type: file.type,
            size: file.size,
            path: storagePath,
            url: downloadURL,
            uploadedAt: new Date().toISOString()
        };
    } catch (err) {
        console.error('[Storage] Upload failed:', err);
        showAlert('檔案上傳失敗：' + err.message);
        return null;
    }
}

// Delete file from Firebase Storage
export async function deleteAttachment(storagePath) {
    try {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
        console.log('[Storage] Deleted:', storagePath);
        return true;
    } catch (err) {
        console.error('[Storage] Delete failed:', err);
        return false;
    }
}

// Format file size for display
export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Get file icon based on type
export function getFileIcon(type) {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    return '📎';
}

// Check if file is previewable (images)
export function isPreviewable(type) {
    return type.startsWith('image/');
}

// Export to window
window.uploadAttachment = uploadAttachment;
window.deleteAttachment = deleteAttachment;
window.formatFileSize = formatFileSize;
window.getFileIcon = getFileIcon;
