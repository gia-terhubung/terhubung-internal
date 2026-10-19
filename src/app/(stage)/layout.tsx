import { Bricolage_Grotesque } from 'next/font/google';
import { requireInternalAdmin } from '@/services/auth.service';

// Stage headline face: the brand's Bricolage Grotesque, variable with the
// width axis so names can be set condensed (wdth 75) for projector legibility.
const stageFont = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['wdth', 'opsz'],
  variable: '--font-stage',
  display: 'swap',
});

export default async function StageLayout({ children }: { children: React.ReactNode }) {
  await requireInternalAdmin();
  return <div className={stageFont.variable}>{children}</div>;
}
