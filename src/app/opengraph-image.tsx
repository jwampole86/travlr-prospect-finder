import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #071A38 0%, #050A16 100%)',
        }}
      >
        <svg width="140" height="140" viewBox="0 0 64 64">
          <path d="M14 16 L24 16 L32 40 L22 40 Z" fill="#EAF6FF" />
          <path d="M50 16 L40 16 L26 48 L36 48 Z" fill="#169CFF" />
        </svg>
        <div style={{ marginTop: 32, fontSize: 72, fontWeight: 700, color: '#FFFFFF', letterSpacing: 4 }}>VAYO</div>
        <div style={{ marginTop: 12, fontSize: 28, color: '#53657A' }}>AI-Powered Growth for Property Managers</div>
      </div>
    ),
    { ...size }
  );
}
