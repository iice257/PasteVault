// Shared limits for encrypted file attachments. Keep in sync with api/_files.js.
export const maxFileBytes = 5 * 1024 * 1024;
export const gcmTagBytes = 16;
export const maxCipherBytes = maxFileBytes + gcmTagBytes;
export const maxAttachmentsPerClip = 10;
export const maxClipboardFileBytes = 25 * 1024 * 1024;
export const maxClipboardFiles = 10;
export const fileRetentionDays = 7;
