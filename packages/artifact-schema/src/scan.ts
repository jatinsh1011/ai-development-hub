import type { ArtifactFile } from './types.js';

export type Severity = 'info' | 'warn' | 'high';
export interface Finding { severity: Severity; rule: string; file: string; line: number; message: string }

const RULES: { rule: string; severity: Severity; re: RegExp; message: string }[] = [
  { rule: 'pipe-to-shell', severity: 'high', re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, message: 'Downloads and pipes remote content into a shell' },
  { rule: 'destructive-rm', severity: 'high', re: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\*)/i, message: 'Recursive delete of a broad path' },
  { rule: 'encoded-exec', severity: 'high', re: /base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh|eval\s*\(\s*(atob|Buffer\.from)/i, message: 'Executes decoded/obfuscated content' },
  { rule: 'credential-access', severity: 'high', re: /(~|\$HOME|\/home\/\w+)\/\.(ssh|aws|gnupg|config\/gcloud)|id_rsa|id_ed25519|credentials\.json/i, message: 'References credential or key files' },
  { rule: 'env-exfil', severity: 'warn', re: /(printenv|process\.env\b[^\n]*(fetch|http)|env\s*\|\s*(curl|nc))/i, message: 'Reads environment variables near network calls' },
  { rule: 'sudo', severity: 'warn', re: /\bsudo\b/, message: 'Requests elevated privileges' },
  { rule: 'chmod-777', severity: 'warn', re: /chmod\s+(-R\s+)?777/, message: 'Overly broad file permissions' },
  { rule: 'prompt-injection', severity: 'warn', re: /(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts?|rules)|do not (tell|reveal to) the user/i, message: 'Looks like a prompt-injection phrase' },
  { rule: 'hidden-unicode', severity: 'warn', re: /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/, message: 'Contains invisible/bidirectional Unicode characters' },
  { rule: 'external-url', severity: 'info', re: /https?:\/\/(?!github\.com|docs\.|localhost)[^\s)"']+/i, message: 'References an external URL' },
];

export function scanFiles(files: ArtifactFile[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (f.encoding === 'base64') continue;
    const lines = f.content.split('\n');
    lines.forEach((text, i) => {
      for (const r of RULES) if (r.re.test(text)) out.push({ severity: r.severity, rule: r.rule, file: f.path, line: i + 1, message: r.message });
    });
    if (/(^|\/)scripts\//.test(f.path)) out.push({ severity: 'info', rule: 'bundled-script', file: f.path, line: 1, message: 'Bundled script (never executed by aidev)' });
  }
  return out;
}

export const highestSeverity = (fs: Finding[]): Severity | 'clean' =>
  fs.some((f) => f.severity === 'high') ? 'high' : fs.some((f) => f.severity === 'warn') ? 'warn' : fs.length ? 'info' : 'clean';
