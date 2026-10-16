import { Check } from './ui';

const P = [['copilot', 'Copilot'], ['claudeCode', 'Claude Code'], ['codex', 'Codex']] as const;

export function Compat({ compat, compact }: { compat: Record<string, boolean | undefined>; compact?: boolean }) {
  return (
    <ul className={`flex flex-wrap ${compact ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-1.5'} text-xs`}>
      {P.map(([k, label]) => (
        <li key={k} className={`inline-flex items-center gap-1 ${compat[k] ? 'text-fg' : 'text-muted/50 line-through'}`}>
          {compat[k] ? <span className="text-ok"><Check /></span> : <span className="w-3" />}
          {label}
        </li>
      ))}
    </ul>
  );
}
