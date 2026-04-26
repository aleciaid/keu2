import { db, getDeviceUUID } from '../db/database';

/**
 * Send webhook notification asynchronously (non-blocking)
 */
export async function sendWebhook(event, data) {
  try {
    const webhookUrlSetting = await db.settings.get('webhookUrl');
    const webhookEnabledSetting = await db.settings.get('webhookEnabled');

    if (!webhookEnabledSetting?.value || !webhookUrlSetting?.value) {
      return { sent: false, reason: 'disabled' };
    }

    const url = webhookUrlSetting.value;
    const deviceUUID = await getDeviceUUID();
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      deviceUUID,
      data,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const status = response.ok ? 'success' : 'failed';

    // Log webhook result
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'webhook_sent',
      details: { event, status, statusCode: response.status, url },
      createdAt: new Date().toISOString(),
    });

    return { sent: true, status, statusCode: response.status };
  } catch (error) {
    // Log webhook error
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'webhook_failed',
      details: { event, error: error.message },
      createdAt: new Date().toISOString(),
    });

    return { sent: false, status: 'failed', error: error.message };
  }
}

/**
 * Test webhook URL connectivity
 */
export async function testWebhook(url) {
  try {
    const deviceUUID = await getDeviceUUID();
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      deviceUUID,
      data: { message: 'Webhook test from FinanceTracker' },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return { success: response.ok, statusCode: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
