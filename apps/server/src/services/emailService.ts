import nodemailer from 'nodemailer';

// 邮件发送配置（可选功能：未配置 SMTP 时，开发环境仍可在页面显示验证码）
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@yuyou.app';

function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  // 未配置时仍然创建 transport，但实际发送会失败
});

// 开发环境或显式开启时，在日志/响应中显示验证码
function isDevOrShowCode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.SHOW_VERIFICATION_CODE === 'true';
}

export async function sendEmailCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    const msg = 'SMTP 未配置，邮件发送不可用';
    if (isDevOrShowCode()) {
      console.warn(`[Email] ${msg}，开发/测试环境将在页面显示验证码: ${code}`);
      return { success: true };
    }
    return { success: false, error: msg };
  }

  try {
    await transporter.sendMail({
      from: `"遇友" <${SMTP_FROM}>`,
      to: email,
      subject: '您的遇友登录验证码',
      text: `您的验证码是：${code}，5分钟内有效。请勿泄露给他人。`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
          <h2 style="color: #111;">遇友登录验证码</h2>
          <p>您好，</p>
          <p>您正在登录/注册遇友账号，本次验证码为：</p>
          <div style="padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">如非本人操作，请忽略此邮件。</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err: any) {
    console.error('[Email] 发送邮件失败:', err);
    if (isDevOrShowCode()) {
      console.warn(`[Email] 邮件发送失败，开发/测试环境在页面显示验证码: ${code}`);
      return { success: true };
    }
    return { success: false, error: '邮件发送失败，请重试' };
  }
}

export { isEmailConfigured, isDevOrShowCode };
