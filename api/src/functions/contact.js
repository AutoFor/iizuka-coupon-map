import { app } from '@azure/functions';
import { EmailClient } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function json(status, body) {
  return {
    status,
    jsonBody: body,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  };
}

let secretBundlePromise = null;

async function loadSecrets() {
  if (secretBundlePromise) return secretBundlePromise;

  secretBundlePromise = (async () => {
    const keyVaultUrl = process.env.KEY_VAULT_URL;

    if (!keyVaultUrl) {
      return {
        connectionString: process.env.ACS_EMAIL_CONNECTION_STRING,
        senderAddress: process.env.ACS_EMAIL_SENDER,
        toAddress: process.env.CONTACT_TO_EMAIL,
      };
    }

    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUrl, credential);

    const connectionStringSecretName =
      process.env.ACS_EMAIL_CONNECTION_STRING_SECRET_NAME || 'ACS-EMAIL-CONNECTION-STRING';
    const senderSecretName =
      process.env.ACS_EMAIL_SENDER_SECRET_NAME || 'ACS-EMAIL-SENDER';
    const toSecretName =
      process.env.CONTACT_TO_EMAIL_SECRET_NAME || 'CONTACT-TO-EMAIL';

    const [connectionStringSecret, senderSecret, toSecret] = await Promise.all([
      client.getSecret(connectionStringSecretName),
      client.getSecret(senderSecretName),
      client.getSecret(toSecretName),
    ]);

    return {
      connectionString: connectionStringSecret.value,
      senderAddress: senderSecret.value,
      toAddress: toSecret.value,
    };
  })();

  return secretBundlePromise;
}

app.http('contact', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      };
    }

    const { connectionString, senderAddress, toAddress } = await loadSecrets();

    if (!connectionString || !senderAddress || !toAddress) {
      context.error('Contact mail environment variables are not configured.');
      return json(500, { error: '送信設定が未完了です。' });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: '送信内容を読み取れませんでした。' });
    }

    const name = String(payload?.name || '').trim();
    const email = String(payload?.email || '').trim();
    const message = String(payload?.message || '').trim();

    if (!message) {
      return json(400, { error: 'お問い合わせ内容を入力してください。' });
    }

    const safeName = name || '未入力';
    const safeEmail = email || '未入力';
    const escapedName = escapeHtml(safeName);
    const escapedEmail = escapeHtml(safeEmail);
    const escapedMessage = escapeHtml(message);
    const plainText = [
      '飯塚クーポンマップからお問い合わせがありました。',
      '',
      `お名前: ${safeName}`,
      `メールアドレス: ${safeEmail}`,
      '',
      'お問い合わせ内容:',
      message,
    ].join('\n');

    const html = `
      <h2>飯塚クーポンマップからお問い合わせがありました。</h2>
      <p><strong>お名前:</strong> ${escapedName}</p>
      <p><strong>メールアドレス:</strong> ${escapedEmail}</p>
      <p><strong>お問い合わせ内容:</strong></p>
      <pre style="white-space:pre-wrap;font-family:inherit;">${escapedMessage}</pre>
    `;

    try {
      const client = new EmailClient(connectionString);
      const poller = await client.beginSend({
        senderAddress,
        content: {
          subject: '飯塚クーポンマップについてのお問い合わせ',
          plainText,
          html,
        },
        recipients: {
          to: [{ address: toAddress }],
        },
        replyTo: email ? [{ address: email, displayName: safeName }] : undefined,
      });

      await poller.pollUntilDone();
      return json(200, { ok: true });
    } catch (error) {
      context.error('Failed to send contact email.', error);
      return json(500, { error: '送信に失敗しました。時間をおいて再度お試しください。' });
    }
  },
});
