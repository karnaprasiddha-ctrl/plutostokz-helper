// src/utils/permissions.js

const { PermissionsBitField } = require('discord.js');
const { config } = require('../config');

/** True if the member is staff (has STAFF_ROLE_ID) or is a server administrator. */
function isStaff(member) {
  if (!member) return false;
  try {
    if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  } catch {
    // ignore
  }
  if (!config.staffRoleId) return false;
  return member.roles?.cache?.has(config.staffRoleId) ?? false;
}

module.exports = { isStaff };
