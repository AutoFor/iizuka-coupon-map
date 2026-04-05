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

    const applicantType = String(payload?.applicantType || '').trim();
    const category = String(payload?.category || '').trim();
    const company = String(payload?.company || '').trim();
    const replyEmail = String(payload?.replyEmail || '').trim();
    const storeName = String(payload?.storeName || '').trim();
    const fixDetail = String(payload?.fixDetail || '').trim();
    const deleteReason = String(payload?.deleteReason || '').trim();
    const newStoreName = String(payload?.newStoreName || '').trim();
    const storeUrl = String(payload?.storeUrl || '').trim();
    const storeSummary = String(payload?.storeSummary || '').trim();
    const name = String(payload?.name || '').trim();
    const email = String(payload?.email || '').trim();
    const message = String(payload?.message || '').trim();

    if (!applicantType) {
      return json(400, { error: 'お問い合わせ種別を選択してください。' });
    }

    if (!category) {
      return json(400, { error: 'お問い合わせカテゴリを選択してください。' });
    }

    if (applicantType === 'corporate' && !company) {
      return json(400, { error: '御社名を入力してください。' });
    }

    if ((category === '掲載情報の修正' || category === '掲載削除') && !storeName) {
      return json(400, { error: '対象の店舗名を入力してください。' });
    }

    if (category === '掲載情報の修正' && !fixDetail) {
      return json(400, { error: 'どこを直したいかを入力してください。' });
    }

    if (category === '掲載削除' && !deleteReason) {
      return json(400, { error: '削除理由を入力してください。' });
    }

    if (category === '新規掲載' && !newStoreName) {
      return json(400, { error: '新規店舗名を入力してください。' });
    }

    if (!name) {
      return json(400, { error: 'お名前を入力してください。' });
    }

    if (!email) {
      return json(400, { error: 'メールアドレスを入力してください。' });
    }

    if (!message) {
      return json(400, { error: 'お問い合わせ内容を入力してください。' });
    }

    const safeApplicantType = applicantType === 'corporate' ? '法人' : '個人';
    const safeCategory = category;
    const safeCompany = company || '未入力';
    const safeReplyEmail = replyEmail || '未入力';
    const safeStoreName = storeName || '未入力';
    const safeFixDetail = fixDetail || '未入力';
    const safeDeleteReason = deleteReason || '未入力';
    const safeNewStoreName = newStoreName || '未入力';
    const safeStoreUrl = storeUrl || '未入力';
    const safeStoreSummary = storeSummary || '未入力';
    const safeName = name || '未入力';
    const safeEmail = email || '未入力';
    const escapedApplicantType = escapeHtml(safeApplicantType);
    const escapedCategory = escapeHtml(safeCategory);
    const escapedCompany = escapeHtml(safeCompany);
    const escapedReplyEmail = escapeHtml(safeReplyEmail);
    const escapedStoreName = escapeHtml(safeStoreName);
    const escapedFixDetail = escapeHtml(safeFixDetail);
    const escapedDeleteReason = escapeHtml(safeDeleteReason);
    const escapedNewStoreName = escapeHtml(safeNewStoreName);
    const escapedStoreUrl = escapeHtml(safeStoreUrl);
    const escapedStoreSummary = escapeHtml(safeStoreSummary);
    const escapedName = escapeHtml(safeName);
    const escapedEmail = escapeHtml(safeEmail);
    const escapedMessage = escapeHtml(message);
    const plainText = [
      '飯塚クーポンマップからお問い合わせがありました。',
      '',
      `お問い合わせ種別: ${safeApplicantType}`,
      `カテゴリ: ${safeCategory}`,
      `御社名: ${safeCompany}`,
      `御社の返信用メールアドレス: ${safeReplyEmail}`,
      `対象の店舗名: ${safeStoreName}`,
      `どこを直したいか: ${safeFixDetail}`,
      `削除理由: ${safeDeleteReason}`,
      `新規店舗名: ${safeNewStoreName}`,
      `店舗HP・SNS・Google Maps など: ${safeStoreUrl}`,
      `店舗概要: ${safeStoreSummary}`,
      `お名前: ${safeName}`,
      `メールアドレス: ${safeEmail}`,
      '',
      'お問い合わせ内容:',
      message,
    ].join('\n');

    const html = `
      <h2>飯塚クーポンマップからお問い合わせがありました。</h2>
      <p><strong>お問い合わせ種別:</strong> ${escapedApplicantType}</p>
      <p><strong>カテゴリ:</strong> ${escapedCategory}</p>
      <p><strong>御社名:</strong> ${escapedCompany}</p>
      <p><strong>御社の返信用メールアドレス:</strong> ${escapedReplyEmail}</p>
      <p><strong>対象の店舗名:</strong> ${escapedStoreName}</p>
      <p><strong>どこを直したいか:</strong> ${escapedFixDetail}</p>
      <p><strong>削除理由:</strong> ${escapedDeleteReason}</p>
      <p><strong>新規店舗名:</strong> ${escapedNewStoreName}</p>
      <p><strong>店舗HP・SNS・Google Maps など:</strong> ${escapedStoreUrl}</p>
      <p><strong>店舗概要:</strong> ${escapedStoreSummary}</p>
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
          subject: `【${safeCategory}】飯塚クーポンマップへのお問い合わせ`,
          plainText,
          html,
        },
        recipients: {
          to: [{ address: toAddress }],
        },
        replyTo: (email || replyEmail)
          ? [{ address: email || replyEmail, displayName: safeName }]
          : undefined,
      });

      await poller.pollUntilDone();
      return json(200, { ok: true });
    } catch (error) {
      context.error('Failed to send contact email.', error);
      return json(500, { error: '送信に失敗しました。時間をおいて再度お試しください。' });
    }
  },
});
