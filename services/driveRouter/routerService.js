// services/driveRouter/routerService.js
// Main Coordinator for E-Calendar Auto Drive Router & AI Summary v2

const path = require('path');
const config = require('./config');
const scheduleService = require('./scheduleService');
const driveService = require('./driveService');
const aiSummarizer = require('./aiSummarizer');
const sessionManager = require('./sessionManager');

const MIME_MAP = {
  pdf: 'application/pdf',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};

/**
 * Infers file extension and type label from LINE message
 */
function inferMediaMeta(message) {
  let ext = 'bin';
  let typeLabel = 'Doc';
  const originalName = message.fileName || '';

  if (originalName && originalName.includes('.')) {
    ext = originalName.split('.').pop().toLowerCase();
  }

  const msgType = (message.type || '').toLowerCase();
  if (msgType === 'audio') {
    if (ext === 'bin') ext = 'm4a';
    typeLabel = 'Audio';
  } else if (msgType === 'image') {
    if (ext === 'bin') ext = 'jpg';
    typeLabel = 'Image';
  } else if (msgType === 'file') {
    if (ext === 'pdf') {
      typeLabel = 'Slide';
    } else {
      typeLabel = 'Doc';
    }
  }

  const mimeType = MIME_MAP[ext] || 'application/octet-stream';
  return { ext, typeLabel, mimeType, originalName };
}

/**
 * Main handler for incoming media file from LINE
 * @param {Object} params
 * @param {Object} params.message - LINE event.message
 * @param {Buffer} params.buffer - Downloaded content binary buffer
 * @param {string} params.lineUserId - LINE User ID
 * @param {string} params.userId - Internal system user ID
 * @param {Array} params.curriculum - User's curriculum array
 * @param {Function} params.sendPush - Function to send push notification to lineUserId
 */
async function handleIncomingMedia({ message, buffer, lineUserId, userId, curriculum, sendPush }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty file buffer');
  }

  const { ext, typeLabel, mimeType, originalName } = inferMediaMeta(message);

  // 1. Resolve active course with 30-min grace period
  const subjectInfo = scheduleService.resolveCurrentSubject(curriculum);

  // 2. Resolve target subject folder in Google Drive (Flat structure v2)
  let folderId = null;
  if (config.hasDriveConfig) {
    try {
      folderId = await driveService.resolveSubjectFolder(subjectInfo.category, subjectInfo.subCategory);
    } catch (driveErr) {
      console.error('⚠️ Could not resolve Google Drive subject folder:', driveErr.message);
    }
  }

  // 3. Format flat filename: {YYYY-MM-DD}_{HHMM}_{Type}_{ShortID}.{ext}
  const cleanId = (message.id || Date.now().toString()).slice(-6);
  const cleanOriginal = originalName ? `_${path.parse(originalName).name.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '')}` : '';
  const driveFilename = `${subjectInfo.dateStr}_${subjectInfo.sessionTime}_${typeLabel}${cleanOriginal}_${cleanId}.${ext}`;

  // 4. Upload original file to Google Drive IMMEDIATELY (Fail-safe: original never lost)
  let fileUploadResult = null;
  if (folderId) {
    try {
      console.log(`📤 [DriveRouter] Uploading original file to Drive: "${driveFilename}" in folder [${subjectInfo.category}]...`);
      fileUploadResult = await driveService.uploadBuffer(buffer, driveFilename, mimeType, folderId);
      console.log(`✅ [DriveRouter] Original uploaded successfully: ${fileUploadResult.webViewLink}`);
    } catch (upErr) {
      console.error(`❌ [DriveRouter] Failed to upload original file "${driveFilename}":`, upErr.message);
    }
  }

  // 5. Enqueue into Session Manager (Debounce 150s for multi-file lectures)
  const fileEntry = {
    buffer,
    mimeType,
    ext,
    typeLabel,
    driveFilename,
    originalName,
    webViewLink: fileUploadResult ? fileUploadResult.webViewLink : null
  };

  const meta = {
    userId,
    lineUserId,
    folderId,
    sendPush
  };

  sessionManager.addFileToSession(subjectInfo, fileEntry, meta, async (sessionKey, subj, sessionFiles, sessionMeta) => {
    await finalizeLectureSession(sessionKey, subj, sessionFiles, sessionMeta);
  });

  return {
    subjectInfo,
    driveFilename,
    fileUploadResult
  };
}

/**
 * Finalizes the lecture session after debounce completes
 */
async function finalizeLectureSession(sessionKey, subjectInfo, files, meta) {
  const sessionLabel = `${subjectInfo.matchedCode} (${subjectInfo.dateStr})`;
  console.log(`🧠 [DriveRouter] Running Gemini AI summary for session [${sessionLabel}] with ${files.length} file(s)...`);

  // 1. Run Gemini multimodal summary on all files
  const { shortSummary, fullMarkdown } = await aiSummarizer.summarizeSession(files, sessionLabel);

  // 2. Upload AI Markdown summary to Drive (in the same subject folder)
  let summaryDriveLink = null;
  if (meta.folderId) {
    try {
      const mdFilename = `${subjectInfo.dateStr}_${subjectInfo.sessionTime}_AI_Brief_Summary.md`;
      const mdBuffer = Buffer.from(fullMarkdown, 'utf-8');
      const mdUpload = await driveService.uploadBuffer(mdBuffer, mdFilename, 'text/markdown', meta.folderId);
      summaryDriveLink = mdUpload.webViewLink;
      console.log(`📝 [DriveRouter] AI Summary markdown uploaded to Drive: ${summaryDriveLink}`);
    } catch (mdErr) {
      console.warn('⚠️ Could not upload summary .md to Drive:', mdErr.message);
    }
  }

  // 3. Push notification back to LINE user (Stage 2 reply)
  if (typeof meta.sendPush === 'function' && meta.lineUserId) {
    const fileCountStr = files.length === 1 ? '1 ไฟล์' : `${files.length} ไฟล์ (รวมสไลด์+เสียง)`;
    const driveLinkLine = summaryDriveLink ? `\n\n🔗 เปิดไฟล์ใน Google Drive:\n${summaryDriveLink}` : '';

    const pushText = 
      `📚 สรุปเนื้อหาคาบเรียน: ${subjectInfo.courseName || subjectInfo.matchedCode}\n` +
      `📅 วันที่: ${subjectInfo.dateStr} (รหัส: ${subjectInfo.matchedCode})\n` +
      `📦 รวบรวมแล้ว: ${fileCountStr}\n\n` +
      `✨ สรุปสาระสำคัญ:\n${shortSummary.slice(0, 450)}${shortSummary.length > 450 ? '...' : ''}` +
      driveLinkLine;

    try {
      await meta.sendPush(meta.lineUserId, [{ type: 'text', text: pushText }]);
      console.log(`📨 [DriveRouter] Pushed final lecture summary to LINE user [${meta.lineUserId}]`);
    } catch (pushErr) {
      console.error('❌ [DriveRouter] Failed to push summary to LINE user:', pushErr.message);
    }
  }
}

module.exports = {
  inferMediaMeta,
  handleIncomingMedia,
  finalizeLectureSession
};
