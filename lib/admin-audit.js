const { pool } = require("../db");

function normalizeJsonDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  return details;
}

async function logAdminAction({ actor, actionType, status = "success", targetUser = null, details = null }, db = pool) {
  await db.query(`
    INSERT INTO admin_action_log (
      actor_user_id,
      actor_username,
      actor_email,
      actor_access,
      action_type,
      status,
      target_user_id,
      target_username,
      target_email,
      details
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
  `, [
    actor?.id || null,
    actor?.username || null,
    actor?.email || null,
    actor?.access || "unknown",
    actionType,
    status,
    targetUser?.id || null,
    targetUser?.username || null,
    targetUser?.email || null,
    JSON.stringify(normalizeJsonDetails(details)),
  ]);
}

function mapAdminActionRow(row) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    actorEmail: row.actor_email,
    actorAccess: row.actor_access,
    actionType: row.action_type,
    status: row.status,
    targetUserId: row.target_user_id,
    targetUsername: row.target_username,
    targetEmail: row.target_email,
    details: row.details || {},
    createdAt: row.created_at,
  };
}

module.exports = {
  logAdminAction,
  mapAdminActionRow,
};
