
const cron = require('node-cron');
const mongoose = require('mongoose');
const Source = require('../models/Source');
const { logEventSafe, AUDIT_EVENTS } = require('./auditLogger');
const mlOrchestrator = require('./mlOrchestrator');

let cronTask = null;
let lastRunTimestamp = null;

/**
 * Checks all sources (and facts, if model registered) for upcoming expiration
 * or expired shelf-life.
 *
 * @param {object} [options]
 * @param {Date} [options.now=new Date()] - Reference timestamp (useful for testing)
 * @param {number} [options.warningDays=30] - Warning threshold in days (FR-KB-04 default: 30)
 * @returns {Promise<{ checkedAt: Date, warningsGenerated: number, expiredCount: number, details: Array }>}
 */
async function checkExpiringItems({ now = new Date(), warningDays = 30 } = {}) {
  const currentDate = new Date(now);
  const warningThreshold = new Date(currentDate.getTime() + warningDays * 24 * 60 * 60 * 1000);

  const results = {
    checkedAt: currentDate,
    warningsGenerated: 0,
    expiredCount: 0,
    details: [],
  };

  try {
    // 1. Process sources expiring within the warning window or already expired
    const candidateSources = await Source.find({
      expiryDate: { $ne: null, $lte: warningThreshold },
      status: { $nin: ['expired', 'superseded'] },
    }).lean();

    for (const source of candidateSources) {
      const expiry = new Date(source.expiryDate);
      const isExpired = expiry <= currentDate;

      if (isExpired) {
        // Update the ML index first so expired passages become ineligible before
        // MongoDB records the terminal status. If the index is unavailable, leave
        // the source status unchanged so the next scheduler run can retry. The
        // retriever still treats date-expired passages as Outdated, never current.
        if (process.env.ML_SERVICE_URL) {
          try {
            await mlOrchestrator.updateSourceMetadata({
              sourceId: source._id,
              orgId: source.orgId,
              status: 'expired',
              expiryDate: source.expiryDate,
              ownerName: source.ownerName,
              version: source.version,
            });
          } catch (syncErr) {
            console.error('[shelfLifeScheduler] Could not synchronize expiry to ML index:', syncErr.message);
            results.details.push({
              id: source._id,
              type: 'source',
              fileName: source.fileName,
              status: 'expiry_sync_failed',
              expiryDate: source.expiryDate,
            });
            continue;
          }
        }

        // Only transition the database after the ML index has been updated.
        await Source.updateOne(
          { _id: source._id, orgId: source.orgId },
          { $set: { status: 'expired' } }
        );

        await logEventSafe({
          orgId: source.orgId,
          actor: source.owner || null,
          eventType: 'source_expired',
          entityType: 'source',
          entityId: source._id,
          metadata: {
            fileName: source.fileName,
            expiryDate: source.expiryDate,
            expiredAt: currentDate,
            previousStatus: source.status,
          },
        });

        results.expiredCount += 1;
        results.details.push({
          id: source._id,
          type: 'source',
          fileName: source.fileName,
          status: 'expired',
          expiryDate: source.expiryDate,
        });
      } else {
        // Expiring soon: calculate remaining shelf-life days
        const msRemaining = expiry.getTime() - currentDate.getTime();
        const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

        await logEventSafe({
          orgId: source.orgId,
          actor: source.owner || null,
          eventType: AUDIT_EVENTS.EXPIRY_WARNING || 'expiry_warning',
          entityType: 'source',
          entityId: source._id,
          metadata: {
            fileName: source.fileName,
            expiryDate: source.expiryDate,
            daysRemaining,
            warningThresholdDays: warningDays,
            ownerName: source.ownerName || null,
          },
        });

        results.warningsGenerated += 1;
        results.details.push({
          id: source._id,
          type: 'source',
          fileName: source.fileName,
          status: 'expiring_soon',
          daysRemaining,
          expiryDate: source.expiryDate,
        });
      }
    }

    // 2. Also check Fact model if registered in Mongoose (for future Fact model integration)
    if (mongoose.models.Fact) {
      const candidateFacts = await mongoose.models.Fact.find({
        expiryDate: { $ne: null, $lte: warningThreshold },
        status: { $nin: ['expired', 'superseded'] },
      }).lean();

      for (const fact of candidateFacts) {
        const expiry = new Date(fact.expiryDate);
        const isExpired = expiry <= currentDate;

        if (isExpired) {
          await mongoose.models.Fact.updateOne({ _id: fact._id }, { $set: { status: 'expired' } });
          await logEventSafe({
            orgId: fact.orgId,
            actor: fact.owner || null,
            eventType: 'fact_expired',
            entityType: 'fact',
            entityId: fact._id,
            metadata: { statement: fact.statement, expiryDate: fact.expiryDate },
          });
          results.expiredCount += 1;
        } else {
          const daysRemaining = Math.max(1, Math.ceil((expiry.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));
          await logEventSafe({
            orgId: fact.orgId,
            actor: fact.owner || null,
            eventType: 'expiry_warning',
            entityType: 'fact',
            entityId: fact._id,
            metadata: { statement: fact.statement, expiryDate: fact.expiryDate, daysRemaining },
          });
          results.warningsGenerated += 1;
        }
      }
    }

    lastRunTimestamp = currentDate;
  } catch (err) {
    console.error('[shelfLifeScheduler] Error during expiration check:', err.message);
  }

  return results;
}

/**
 * Starts the daily node-cron background task.
 * Default cron expression: '0 0 * * *' (midnight daily).
 *
 * @param {string} [schedule] - Cron pattern string
 * @returns {cron.ScheduledTask}
 */
function startShelfLifeScheduler(schedule) {
  const cronExpression =
    schedule || process.env.SHELF_LIFE_CRON_SCHEDULE || '0 0 * * *';

  if (cronTask) {
    console.log('[shelfLifeScheduler] Task already running, stopping existing task first.');
    stopShelfLifeScheduler();
  }

  console.log(`[shelfLifeScheduler] Initializing daily shelf-life cron (${cronExpression})…`);

  cronTask = cron.schedule(
    cronExpression,
    async () => {
      console.log('[shelfLifeScheduler] Running daily shelf-life inspection…');
      const summary = await checkExpiringItems();
      console.log(
        `[shelfLifeScheduler] Check complete: ${summary.warningsGenerated} warnings, ${summary.expiredCount} expired.`
      );
    },
    {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    }
  );

  return cronTask;
}

/**
 * Stops the active node-cron scheduler task.
 */
function stopShelfLifeScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('[shelfLifeScheduler] Daily shelf-life cron stopped.');
  }
}

/**
 * Returns current scheduler operational status.
 */
function getSchedulerStatus() {
  return {
    running: Boolean(cronTask),
    lastRun: lastRunTimestamp,
  };
}

module.exports = {
  checkExpiringItems,
  startShelfLifeScheduler,
  stopShelfLifeScheduler,
  getSchedulerStatus,
};
