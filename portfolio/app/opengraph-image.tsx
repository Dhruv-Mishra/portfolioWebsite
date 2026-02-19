import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Dhruv Mishra - Software Engineer Portfolio';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #fdfbf7 0%, #f5f0e8 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Grid lines background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(100,130,180,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100,130,180,0.08) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#312e81',
              letterSpacing: '-2px',
            }}
          >
            Hello World!
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#4b5563',
              maxWidth: '700px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Dhruv Mishra — Software Engineer at Microsoft
          </div>
          <div
            style={{
              fontSize: 18,
              color: '#6366f1',
              marginTop: '8px',
              padding: '6px 18px',
              border: '2px solid #c7d2fe',
              borderRadius: '4px',
              background: '#eef2ff',
            }}
          >
            whoisdhruv.com
          </div>
        </div>

        {/* Tape decoration - top */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%) rotate(1deg)',
            width: 120,
            height: 28,
            background: 'rgba(200,180,120,0.35)',
            borderRadius: '2px',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
