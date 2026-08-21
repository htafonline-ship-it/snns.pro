/**
 * Utility functions for handling WhatsApp-style image and file attachments
 */

export interface ProcessedAttachment {
  type: 'image' | 'file' | 'audio';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Format bytes into human readable format (KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Compress an image file to an optimized JPEG data URL to fit seamlessly in Firestore
 */
export async function processImageFile(file: File, maxWidth = 1200, quality = 0.82): Promise<ProcessedAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Approximate base64 size
        const stringLength = dataUrl.length - 'data:image/jpeg;base64,'.length;
        const sizeInBytes = 4 * Math.ceil(stringLength / 3) * 0.562489633438363;

        resolve({
          type: 'image',
          url: dataUrl,
          name: file.name || `image_${Date.now()}.jpg`,
          size: Math.round(sizeInBytes),
          mimeType: 'image/jpeg',
        });
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Process a document, audio or generic file
 */
export async function processGenericFile(file: File): Promise<ProcessedAttachment> {
  // Check file size (limit to 700KB for Firestore base64 storage)
  if (file.size > 750 * 1024) {
    throw new Error('حجم الملف كبير جداً (الحد الأقصى المسموح 750 كيلوبايت لضمان سرعة الإرسال)');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const isAudio = file.type.startsWith('audio/');
      resolve({
        type: isAudio ? 'audio' : 'file',
        url: dataUrl,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
