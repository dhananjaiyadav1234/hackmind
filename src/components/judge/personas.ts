import { Briefcase, Cpu, Flame, Handshake, Lightbulb, Package, type LucideIcon } from 'lucide-react';
import type { JudgePersona } from '../../../shared/types';

export const PERSONA_META: Record<JudgePersona, { icon: LucideIcon; blurb: string; color: string }> = {
  technical: { icon: Cpu, blurb: 'Digs into architecture, trade-offs and what breaks at 3am.', color: 'text-info bg-info/15 border-info/30' },
  innovation: { icon: Lightbulb, blurb: 'Asks what is genuinely new, and why it was not done before.', color: 'text-warn bg-warn/15 border-warn/30' },
  business: { icon: Briefcase, blurb: 'Wants a real user, a real market, and a reason anyone pays.', color: 'text-good bg-good/15 border-good/30' },
  sponsor: { icon: Handshake, blurb: 'Checks the sponsor tech is used meaningfully, not name-dropped.', color: 'text-accent-2 bg-accent-2/15 border-accent-2/30' },
  product: { icon: Package, blurb: 'Cares about the user flow, scope discipline and the demo.', color: 'text-[#b3aaff] bg-accent/15 border-accent/30' },
  aggressive: { icon: Flame, blurb: 'Interrupts, doubts everything, and pushes on your weakest claim.', color: 'text-bad bg-bad/15 border-bad/30' },
};

export const MIN_ANSWER_CHARS = 15;
