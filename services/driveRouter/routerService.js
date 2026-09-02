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
async function handleIncomingMedia({ message, buffer, lineUserId, userId, curriculum, sendPush, driveOnly = false }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty file buffer');
  }

  const { ext, typeLabel, mimeType, originalName } = inferMediaMeta(message);

  // 1. Resolve active course with 30-min grace period
  const subjectInfo = scheduleService.resolveCurrentSubject(curriculum);
  console.log(`📂 [DriveRouter] Resolved subject: [${subjectInfo.matchedCode}] → ${subjectInfo.category} at ${subjectInfo.timeStr}`);

  // 2. Resolve target subject folder in Google Drive (Flat structure v2)
  let folderId = null;
  if (config.hasDriveConfig) {
    try {
      folderId = await driveService.resolveSubjectFolder(subjectInfo.category, subjectInfo.subCategory);
      console.log(`📁 [DriveRouter] Resolved Drive folder ID: ${folderId} for category: ${subjectInfo.category}`);
    } catch (driveErr) {
      console.error('⚠️ Could not resolve Google Drive subject folder:', driveErr.message);
      // Re-throw so caller sees real error reason
      throw new Error(`Google Drive folder error: ${driveErr.message}`);
    }
  } else {
    throw new Error('Google Drive not configured (GOOGLE_DRIVE_PARENT_ID or Service Account missing)');
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
      throw new Error(`Drive upload failed: ${upErr.message}`);
    }
  }

  // 5. Enqueue into Session Manager
  const fileEntry = {
    buffer,
    mimeType,
    ext,
    typeLabel,
    filename: originalName || driveFilename, // fixed: aiSummarizer expects "filename"
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

  const sessionKey = sessionManager.getSessionKey(subjectInfo);

  if (!driveOnly) {
    // Start debounce queue for AI Summary
    sessionManager.addFileToSession(subjectInfo, fileEntry, meta, async (sKey, subj, sessionFiles, sessionMeta) => {
      await finalizeLectureSession(sKey, subj, sessionFiles, sessionMeta);
    });
  } else {
    // driveOnly mode: register file in session store but cancel auto-timer
    sessionManager.addFileToSession(subjectInfo, fileEntry, meta, async (sKey, subj, sessionFiles, sessionMeta) => {
      await finalizeLectureSession(sKey, subj, sessionFiles, sessionMeta);
    });
    sessionManager.cancelSession(sessionKey); // stop the debounce timer
  }

  return {
    subjectInfo,
    driveFilename,
    fileUploadResult,
    sessionKey
  };
}

/**
 * Builds interactive LINE Flex Message with direct Drive Link & Action Buttons
 */
function buildDriveUploadFlex({ driveFilename, courseName, matchedCode, category, webViewLink, sessionKey, driveOnlyMode = false }) {
  const isUnsorted = matchedCode === 'UNSORTED';
  const headerBg = isUnsorted ? '#475569' : '#0F766E';
  const headerTitle = isUnsorted ? '📁 บันทึกเข้า 00_General_Unsorted' : `📁 บันทึกเข้า ${category}`;

  const buttons = [];

  // Big primary button to open file in Drive
  if (webViewLink) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: headerBg,
      height: 'sm',
      action: {
        type: 'uri',
        label: '🔗 เปิดดูใน Google Drive',
        uri: webViewLink
      }
    });
  }

  // Action choice buttons
  if (!driveOnlyMode) {
    buttons.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'sm',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          color: '#E0F2FE',
          height: 'sm',
          action: {
            type: 'postback',
            label: '⚡ สรุป AI ทันที',
            data: `action=summarize_now&key=${encodeURIComponent(sessionKey)}`
          }
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: {
            type: 'postback',
            label: '📁 แค่ขึ้น Drive',
            data: `action=drive_only&key=${encodeURIComponent(sessionKey)}`
          }
        }
      ]
    });
  }

  return {
    type: 'flex',
    altText: `📁 บันทึกเข้า Google Drive แล้ว: ${driveFilename}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerBg,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR DRIVE ROUTER', color: '#CCFBF1', size: 'xxs', weight: 'bold', letterSpacing: '1px' },
          { type: 'text', text: headerTitle, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: 'md',
            paddingAll: '12px',
            contents: [
              { type: 'text', text: `📚 วิชา: ${courseName || matchedCode}`, weight: 'bold', size: 'sm', color: '#0F766E', wrap: true },
              { type: 'text', text: `📁 โฟลเดอร์: ${category}`, size: 'xs', color: '#475569', margin: 'xs' },
              { type: 'text', text: `📄 ไฟล์: ${driveFilename}`, size: 'xxs', color: '#64748B', margin: 'xs', wrap: true }
            ]
          },
          ...(driveOnlyMode ? [
            {
              type: 'text',
              text: '✅ โหมดบันทึกอย่างเดียว (แตะปุ่มด้านล่างหากต้องการสรุป AI)',
              size: 'xxs',
              color: '#059669',
              margin: 'md'
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              margin: 'sm',
              action: {
                type: 'postback',
                label: '⚡ สรุป AI ไฟล์นี้',
                data: `action=summarize_now&key=${encodeURIComponent(sessionKey)}`
              }
            }
          ] : [
            {
              type: 'text',
              text: '⚡ สรุปทันที หรือ แค่อัพโหลดเข้า Drive:',
              size: 'xxs',
              weight: 'bold',
              color: '#475569',
              margin: 'md'
            }
          ])
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: buttons
      }
    }
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
    const driveLinkLine = summaryDriveLink ? `\n\n🔗 เปิดไฟล์สรุปใน Google Drive:\n${summaryDriveLink}` : '';

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
  finalizeLectureSession,
  buildDriveUploadFlex
};
