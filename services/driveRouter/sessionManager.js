// services/driveRouter/sessionManager.js
// Debounce and session grouping: combines multiple files from the same class into a single AI summary

const { SESSION_DEBOUNCE_SECONDS } = require('./config');

const _sessions = new Map(); // sessionKey -> { files, subjectInfo, meta, timer }

/**
 * Computes unique session key based on date and subject code
 */
function getSessionKey(subjectInfo) {
  return `${subjectInfo.dateStr}_${subjectInfo.matchedCode}`;
}

/**
 * Adds a file entry to an active session, resetting the debounce timer
 * @param {Object} subjectInfo
 * @param {Object} fileEntry - { buffer, mimeType, driveFilename, webViewLink, ext, originalName }
 * @param {Object} meta - { userId, lineUserId, folderId }
 * @param {Function} onFlush - async callback(sessionKey, subjectInfo, files, meta)
 */
function addFileToSession(subjectInfo, fileEntry, meta, onFlush) {
  const key = getSessionKey(subjectInfo);

  let session = _sessions.get(key);
  if (!session) {
    session = {
      files: [],
      subjectInfo,
      meta,
      timer: null
    };
    _sessions.set(key, session);
  }

  session.files.push(fileEntry);
  session.meta = { ...session.meta, ...meta }; // update meta if provided

  if (session.timer) {
    clearTimeout(session.timer);
  }

  console.log(`⏱️ [DriveRouter] Debounce started for [${key}] (files: ${session.files.length}, timeout: ${SESSION_DEBOUNCE_SECONDS}s)`);

  session.timer = setTimeout(async () => {
    _sessions.delete(key);
    console.log(`🚀 [DriveRouter] Debounce expired for [${key}]. Processing combined session with ${session.files.length} file(s)...`);
    try {
      await onFlush(key, session.subjectInfo, session.files, session.meta);
    } catch (err) {
      console.error(`❌ [DriveRouter] Error during session flush for [${key}]:`, err);
    }
  }, SESSION_DEBOUNCE_SECONDS * 1000);
}

/**
 * Flushes a session immediately (useful for testing or manual flush)
 */
async function flushSessionImmediately(key, onFlush) {
  const session = _sessions.get(key);
  if (!session) return;
  if (session.timer) clearTimeout(session.timer);
  _sessions.delete(key);
  await onFlush(key, session.subjectInfo, session.files, session.meta);
}

/**
 * Gets count of active sessions
 */
function getActiveSessionCount() {
  return _sessions.size;
}

module.exports = {
  getSessionKey,
  addFileToSession,
  flushSessionImmediately,
  getActiveSessionCount
};
