// A tiny indirection so background services can talk to the customer without
// importing the bot module (which would create an import cycle).

const { createLogger } = require("../lib/logger");

const log = createLogger("notifier");

let sendToUser = null;
let sendToAdmins = null;

function register(handlers) {
  sendToUser = handlers.sendToUser || null;
  sendToAdmins = handlers.sendToAdmins || null;
}

async function notifyUser(userId, text, options) {
  if (!sendToUser) return;
  try {
    await sendToUser(userId, text, options);
  } catch (err) {
    log.warn(`Could not notify user ${userId}: ${err.message}`);
  }
}

async function notifyAdmins(text, options) {
  if (!sendToAdmins) return;
  try {
    await sendToAdmins(text, options);
  } catch (err) {
    log.warn(`Could not notify admins: ${err.message}`);
  }
}

module.exports = { register, notifyUser, notifyAdmins };
