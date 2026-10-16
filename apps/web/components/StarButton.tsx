'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui';
import { clientApi, getToken } from '@/lib/client';

export function StarButton({ refPath, starred, stars }: { refPath: string; starred: boolean; stars: number }) {
  const [s, setS] = useState({ starred, stars });
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={async () => {
      if (!getToken()) return router.push('/login');
      const r = await clientApi<{ starred: boolean; stars: number }>(`/artifacts/${refPath}/star`, { method: 'POST' });
      if (r.status === 200) setS(r.data);
    }}>
      <span aria-hidden>{s.starred ? '★' : '☆'}</span> {s.starred ? 'Starred on Hub' : 'Star on Hub'} · {s.stars}
    </Button>
  );
}
