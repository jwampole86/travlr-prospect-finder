export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <img
          src="/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG"
          alt=""
          className="h-16 w-16 animate-pulse object-contain drop-shadow-sm"
          aria-hidden="true"
        />
        <span className="text-sm text-muted-foreground">Loading TRAVLR…</span>
      </div>
    </div>
  );
}
