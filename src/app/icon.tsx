import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #071A38 0%, #050A16 100%)',
          borderRadius: 8,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 64 64">
          <path d="M14 16 L24 16 L32 40 L22 40 Z" fill="#EAF6FF" />
          <path d="M50 16 L40 16 L26 48 L36 48 Z" fill="#169CFF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
