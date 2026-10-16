import { getInitials } from '../utils';

export default function WorkspaceAvatar({ name, tone = 'primary', size = 'md' }: { name: string; tone?: 'primary' | 'warning' | 'default'; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs';
  const toneClass = tone === 'warning'
    ? 'bg-warning/10 text-warning'
    : tone === 'default'
      ? 'bg-muted text-muted-foreground'
      : 'bg-primary/10 text-primary';

  return (
    <div className={`inline-flex items-center justify-center rounded-2xl font-semibold ${sizeClass} ${toneClass}`}>
      {getInitials(name)}
    </div>
  );
}
