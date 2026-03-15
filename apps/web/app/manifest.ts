import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TRD Agent Spawn / Ingest System',
    short_name: 'TRD Spawn',
    description: 'OpenClaw topic orchestration and ingest dashboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#06b6d4',
    icons: [
      {
        src: '/trdlogoblue.webp',
        sizes: '512x512',
        type: 'image/webp',
      },
      {
        src: '/trdlogoblue.webp',
        sizes: '192x192',
        type: 'image/webp',
      },
    ],
  };
}
