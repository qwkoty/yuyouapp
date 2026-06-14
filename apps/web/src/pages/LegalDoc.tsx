import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, FileText } from 'lucide-react';

export default function LegalDoc({ type }: { type: 'terms' | 'privacy' }) {
  const navigate = useNavigate();
  const isTerms = type === 'terms';

  return (
    <div className="min-h-screen bg-surface-950 relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary-500/[0.05] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 md:px-12 py-8 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 p-2.5 rounded-xl bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08] transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>

        <div className="card-elevated rounded-3xl p-6 md:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center">
              {isTerms ? <FileText className="w-6 h-6 text-primary-400" /> : <Shield className="w-6 h-6 text-primary-400" />}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {isTerms ? '服务条款' : '隐私政策'}
              </h1>
              <p className="text-sm text-gray-400 mt-1">最后更新：2026年6月14日</p>
            </div>
          </div>

          {isTerms ? (
            <div className="prose prose-invert max-w-none text-gray-300 space-y-5 text-sm leading-relaxed">
              <section>
                <h2 className="text-lg font-bold text-white mb-2">1. 服务说明</h2>
                <p>遇友（以下简称"本平台"）是一款基于地理位置的限时破冰社交应用，致力于帮助用户在 88 秒倒计时机制下进行真实、高效的社交匹配。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">2. 用户行为规范</h2>
                <p>用户在使用本平台时需遵守国家法律法规，不得发布违法违规、淫秽色情、暴力恐怖、虚假欺诈等内容。禁止骚扰、辱骂、威胁其他用户。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">3. 账号管理</h2>
                <p>用户应妥善保管账号和验证码，不得将账号转让、出借给他人使用。如发现账号被盗或异常，应立即联系客服。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">4. 隐私保护</h2>
                <p>本平台尊重并保护用户隐私，详见《隐私政策》。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">5. 内容版权</h2>
                <p>用户在本平台发布的内容由用户本人承担责任，本平台对相关内容不承担担保责任。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">6. 服务变更与终止</h2>
                <p>本平台保留随时修改或终止服务的权利，重大变更将提前 7 天通知用户。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">7. 免责声明</h2>
                <p>本平台不对用户之间的线下交往产生的任何后果承担责任。请用户在社交过程中保持警惕，注意人身和财产安全。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">8. 法律适用</h2>
                <p>本条款的解释、效力及争议解决均适用中华人民共和国法律。</p>
              </section>
            </div>
          ) : (
            <div className="prose prose-invert max-w-none text-gray-300 space-y-5 text-sm leading-relaxed">
              <section>
                <h2 className="text-lg font-bold text-white mb-2">1. 信息收集范围</h2>
                <p>我们收集以下信息以提供基本服务：手机号（用于登录验证）、头像、昵称、性别、出生日期、所在地区，以及您主动填写的个人简介、兴趣标签等。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">2. 信息使用</h2>
                <p>收集的信息仅用于：账号注册与登录、匹配推荐、用户间展示、内容审核、安全保障。我们不会将您的个人信息用于推送广告或出售给第三方。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">3. 信息存储与保护</h2>
                <p>您的数据存储在加密的 PostgreSQL 数据库中，传输过程使用 HTTPS 加密。我们采取合理的技术措施保护您的信息安全。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">4. 信息共享</h2>
                <p>我们不会与第三方共享您的个人信息，除非：获得您的明确同意；根据法律法规或政府主管部门要求。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">5. 您的权利</h2>
                <p>您有权查看、更正、删除您的个人信息。您可以在「我的-编辑资料」中修改，或联系客服申请账号注销。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">6. Cookie 与本地存储</h2>
                <p>本平台使用 localStorage 保存您的登录状态和偏好设置，不使用第三方追踪 Cookie。</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-white mb-2">7. 联系方式</h2>
                <p>如有隐私相关问题，可通过应用内反馈或邮件联系我们。</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
