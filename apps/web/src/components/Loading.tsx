import React from 'react';

interface LoadingProps {
  fullScreen?: boolean;
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  fullScreen = false,
  text = '加载中...',
  size = 'md',
  className = '',
}) => {
  const spinnerSize = size === 'sm' ? 'loading-spinner-sm' : size === 'lg' ? 'loading-spinner' : 'loading-spinner';
  const containerClass = fullScreen ? 'loading-container-full' : 'loading-container';

  return (
    <div className={`${containerClass} ${className}`}>
      <div className={spinnerSize} />
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
};

export default Loading;
