import type { JudgePersona } from '../../../shared/types';
import { cn } from '../../lib/format';
import { PERSONA_META } from './personas';

export function PersonaAvatar({ persona, size = 'md' }: { persona: JudgePersona; size?: 'sm' | 'md' }) {
  const { icon: Icon, color } = PERSONA_META[persona];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full border', color, size === 'sm' ? 'h-7 w-7' : 'h-10 w-10')} aria-hidden>
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
    </span>
  );
}
