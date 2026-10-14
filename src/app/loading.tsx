import AvyroLoader from '@/components/ui/AvyroLoader';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <AvyroLoader label="Loading…" />
    </div>
  );
}
