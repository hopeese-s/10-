// services/driveRouter/driveService.js
// Google Drive v3 integration with Service Account authentication & folder caching

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { google } = require('googleapis');
const { GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_PARENT_ID } = require('./config');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',          // full drive access (needed for shared folders)
  'https://www.googleapis.com/auth/drive.file'      // fallback scope
];

let _driveClient = null;
const _folderCache = new Map(); // Cache "parentId_folderName" -> folderId

/**
 * Initializes and returns the authenticated Google Drive client
 */
function getDriveClient() {
  if (_driveClient) return _driveClient;

  let auth = null;
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = typeof GOOGLE_SERVICE_ACCOUNT_JSON === 'object'
        ? GOOGLE_SERVICE_ACCOUNT_JSON
        : JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES
      });
    } catch (e) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  if (!auth) {
    const localKeyPath = path.join(__dirname, '../../service_account.json');
    if (fs.existsSync(localKeyPath)) {
      auth = new google.auth.GoogleAuth({
        keyFile: localKeyPath,
        scopes: SCOPES
      });
    }
  }

  if (!auth) {
    throw new Error('Google Drive Service Account not configured (missing GOOGLE_SERVICE_ACCOUNT_JSON or service_account.json)');
  }

  _driveClient = google.drive({ version: 'v3', auth });
  return _driveClient;
}

/**
 * Searches for a folder by name within parentId; creates it if not found.
 */
async function findOrCreateFolder(name, parentId) {
  const cacheKey = `${parentId}__${name}`;
  if (_folderCache.has(cacheKey)) {
    return _folderCache.get(cacheKey);
  }

  const drive = getDriveClient();
  const query = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });

  const files = res.data.files || [];
  if (files.length > 0) {
    const folderId = files[0].id;
    _folderCache.set(cacheKey, folderId);
    return folderId;
  }

  // Create folder
  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id, webViewLink'
  });

  const newFolderId = createRes.data.id;
  _folderCache.set(cacheKey, newFolderId);
  return newFolderId;
}

/**
 * Resolves or creates subject folder in Google Drive (Flat structure v2)
 */
async function resolveSubjectFolder(category, subCategory = null) {
  if (!GOOGLE_DRIVE_PARENT_ID) {
    throw new Error('GOOGLE_DRIVE_PARENT_ID is not configured');
  }

  let folderId = await findOrCreateFolder(category, GOOGLE_DRIVE_PARENT_ID);
  if (subCategory) {
    folderId = await findOrCreateFolder(subCategory, folderId);
  }
  return folderId;
}

/**
 * Uploads a Buffer to Google Drive with automatic retry on transient error
 */
async function uploadBuffer(buffer, driveFilename, mimeType, folderId) {
  const drive = getDriveClient();
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = Readable.from(buffer);
      const res = await drive.files.create({
        requestBody: {
          name: driveFilename,
          parents: [folderId]
        },
        media: {
          mimeType,
          body: stream
        },
        fields: 'id, name, webViewLink, webContentLink'
      });

      return {
        fileId: res.data.id,
        name: res.data.name,
        webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`
      };
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Drive upload attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw new Error(`Google Drive upload failed after 3 attempts: ${lastError ? lastError.message : 'Unknown error'}`);
}

/**
 * Uploads a local file to Google Drive
 */
async function uploadLocalFile(localPath, driveFilename, mimeType, folderId) {
  const buffer = fs.readFileSync(localPath);
  return await uploadBuffer(buffer, driveFilename, mimeType, folderId);
}

module.exports = {
  getDriveClient,
  findOrCreateFolder,
  resolveSubjectFolder,
  uploadBuffer,
  uploadLocalFile
};
