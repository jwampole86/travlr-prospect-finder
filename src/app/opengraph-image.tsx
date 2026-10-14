import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const icon = await readFile(path.join(process.cwd(), 'public/brand/avyro-icon.png'));
  const iconSrc = `data:image/png;base64,${icon.toString('base64')}`;
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} width={168} height={168} alt="" />
        <div style={{ marginTop: 32, fontSize: 72, fontWeight: 700, color: '#FFFFFF', letterSpacing: 4 }}>AVYRO AI</div>
        <div style={{ marginTop: 12, fontSize: 28, color: '#53657A' }}>AI-Powered Growth for Property Managers</div>
      </div>
    ),
    { ...size }
  );
}
