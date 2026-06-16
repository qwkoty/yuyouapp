import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 是否全屏展示（顶层用 true，局部用 false） */
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * 全局错误边界：捕获子树渲染异常与懒加载 chunk 加载失败，避免白屏。
 * 提供"重新加载"按钮恢复。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获错误:', error, info);
  }

  handleReload = () => {
    // 清除错误状态并强制重新加载（懒加载 chunk 失效时需要刷新页面）
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isChunkError =
      this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
      this.state.error?.message?.includes('Importing a module script failed');

    const containerClass = this.props.fullScreen
      ? 'min-h-screen bg-surface-950 flex flex-col items-center justify-center'
      : 'flex flex-col items-center justify-center py-20';

    return (
      <div className={containerClass}>
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {isChunkError ? '页面加载失败' : '页面出错了'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {isChunkError ? '资源已更新，请刷新页面获取最新版本' : '请尝试刷新页面，若问题持续请联系客服'}
            </p>
          </div>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 btn-primary rounded-2xl text-sm font-bold"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
