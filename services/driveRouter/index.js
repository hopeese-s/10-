// services/driveRouter/index.js
// Export interface for E-Calendar Auto Drive Router & AI Summary v2

const config = require('./config');
const scheduleService = require('./scheduleService');
const driveService = require('./driveService');
const aiSummarizer = require('./aiSummarizer');
const sessionManager = require('./sessionManager');
const routerService = require('./routerService');

module.exports = {
  config,
  scheduleService,
  driveService,
  aiSummarizer,
  sessionManager,
  routerService,
  handleIncomingMedia: routerService.handleIncomingMedia,
  resolveCurrentSubject: scheduleService.resolveCurrentSubject,
  buildDriveUploadFlex: routerService.buildDriveUploadFlex
};
