import VayoLoader from '@/components/ui/VayoLoader';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <VayoLoader label="Loading…" />
    </div>
  );
}
