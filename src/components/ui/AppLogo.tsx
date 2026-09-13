'use client';

import React, { memo, useMemo } from 'react';
import AppImage from './AppImage';
import VayoMark from './VayoMark';

interface AppLogoProps {
  src?: string; // Legacy raster image source (optional) — omit to use the official VAYO mark
  size?: number; // Size for icon/image
  className?: string; // Additional classes
  onClick?: () => void; // Click handler
}

const AppLogo = memo(function AppLogo({
  src,
  size = 64,
  className = '',
  onClick,
}: AppLogoProps) {
  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['flex items-center'];
    if (onClick) classes.push('cursor-pointer hover:opacity-80 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {src ? (
        <AppImage
          src={src}
          alt="Logo" 
          width={size}
          height={size}
          className="flex-shrink-0"
          priority={true}
          unoptimized={src.endsWith('.svg')}
        />
      ) : (
        <VayoMark size={size} className="flex-shrink-0 rounded-lg" />
      )}
    </div>
  );
});

export default AppLogo;

