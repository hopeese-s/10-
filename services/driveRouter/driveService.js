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
      if (credentials && credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      if (credentials && credentials.client_email) {
        console.log(`🔑 [DriveService] Authenticated with Service Account: ${credentials.client_email}`);
      }
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
    fields: 'id, webViewLink',
    supportsAllDrives: true
  });

  const newFolderId = createRes.data.id;
  _folderCache.set(cacheKey, newFolderId);
  return newFolderId;
}

let _cachedParentId = null;

/**
 * Resolves root parent folder ID with auto-discovery:
 * 1. Verifies GOOGLE_DRIVE_PARENT_ID
 * 2. If invalid or missing, searches for shared folder named 'E-Calendar_Study_Space'
 */
async function getRootParentFolderId() {
  if (_cachedParentId) return _cachedParentId;

  const drive = getDriveClient();
  let candidateId = GOOGLE_DRIVE_PARENT_ID;

  // 1. Check if configured ID is valid and accessible
  if (candidateId) {
    try {
      const check = await drive.files.get({
        fileId: candidateId,
        fields: 'id, name, trashed',
        supportsAllDrives: true
      });
      if (check.data && !check.data.trashed) {
        console.log(`📁 [DriveService] Verified root folder by ID: "${check.data.name}" (${check.data.id})`);
        _cachedParentId = check.data.id;
        return _cachedParentId;
      }
    } catch (checkErr) {
      console.warn(`⚠️ Parent ID [${candidateId}] inaccessible: ${checkErr.message}. Attempting auto-discovery...`);
    }
  }

  // 2. Auto-discover shared folder named 'E-Calendar_Study_Space'
  try {
    const listRes = await drive.files.list({
      q: "name = 'E-Calendar_Study_Space' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name, webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      spaces: 'drive'
    });

    const files = listRes.data.files || [];
    if (files.length > 0) {
      console.log(`🎉 [DriveService] Auto-discovered root folder: "${files[0].name}" (${files[0].id})`);
      _cachedParentId = files[0].id;
      return _cachedParentId;
    }
  } catch (searchErr) {
    console.warn('⚠️ Auto-discovery search for E-Calendar_Study_Space failed:', searchErr.message);
  }

  if (candidateId) {
    _cachedParentId = candidateId;
    return _cachedParentId;
  }

  throw new Error('Could not find folder "E-Calendar_Study_Space" in Google Drive. Please ensure the folder is shared with the Service Account email.');
}

/**
 * Resolves or creates subject folder in Google Drive (Flat structure v2)
 */
async function resolveSubjectFolder(category, subCategory = null) {
  const rootId = await getRootParentFolderId();
  let folderId = await findOrCreateFolder(category, rootId);
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
        fields: 'id, name, webViewLink, webContentLink',
        supportsAllDrives: true
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
