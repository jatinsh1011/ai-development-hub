import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ARTIFACT_TYPES, validateArtifact, type ArtifactFile } from '@aidev/artifact-schema';
import { exists } from '@aidev/provider-adapters';

export interface ProjectInfo { git: boolean; github: boolean; languages: string[]; frameworks: string[] }

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const info: ProjectInfo = { git: await exists(path.join(cwd, '.git')), github: false, languages: [], frameworks: [] };
  if (info.git) {
    const cfg = await fs.readFile(path.join(cwd, '.git', 'config'), 'utf8').catch(() => '');
    info.github = /github\.com/.test(cfg) || (await exists(path.join(cwd, '.github')));
  }
  const pkg = await fs.readFile(path.join(cwd, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    info.languages.push(deps.typescript || (await exists(path.join(cwd, 'tsconfig.json'))) ? 'typescript' : 'javascript');
    for (const [k, f] of [['react', 'react'], ['next', 'next'], ['@nestjs/core', 'nestjs'], ['vue', 'vue'], ['@mui/material', 'mui'], ['jest', 'jest'], ['vitest', 'vitest']] as const) if (deps[k]) info.frameworks.push(f);
  }
  const pom = await fs.readFile(path.join(cwd, 'pom.xml'), 'utf8').catch(() => '');
  const gradle = await fs.readFile(path.join(cwd, 'build.gradle'), 'utf8').catch(() => (fs.readFile(path.join(cwd, 'build.gradle.kts'), 'utf8').catch(() => '')));
  if (pom || gradle) { info.languages.push('java'); if (/spring-boot/.test(pom + gradle)) info.frameworks.push('spring-boot'); }
  if (await exists(path.join(cwd, 'Dockerfile'))) info.frameworks.push('docker');
  if ((await exists(path.join(cwd, 'k8s'))) || (await exists(path.join(cwd, 'helm')))) info.frameworks.push('kubernetes');
  return info;
}

export function recommend(info: ProjectInfo): { ref: string; why: string }[] {
  const r: { ref: string; why: string }[] = [{ ref: 'pr-review', why: 'general' }];
  if (info.github) r.push({ ref: 'github', why: 'GitHub remote detected' });
  if (info.frameworks.includes('react')) r.push({ ref: 'react-19-migration', why: 'React project' }, { ref: 'rtl-migration', why: 'React project' });
  if (info.frameworks.includes('mui')) r.push({ ref: 'mui7-migration', why: 'Material UI' });
  if (info.frameworks.includes('spring-boot')) r.push({ ref: 'spring-boot-debugger', why: 'Spring Boot project' });
  if (info.frameworks.includes('docker')) r.push({ ref: 'docker-debugging', why: 'Dockerfile found' });
  if (info.frameworks.includes('kubernetes')) r.push({ ref: 'kubernetes-troubleshooting', why: 'Kubernetes manifests found' });
  if (info.languages.length) r.push({ ref: 'test-generation-agent', why: 'tests' });
  return r;
}

const IGNORE = new Set(['node_modules', '.git', '.aidev', 'dist', '.next', '.DS_Store']);

export async function readArtifactDir(dir: string): Promise<ArtifactFile[]> {
  const out: ArtifactFile[] = [];
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (IGNORE.has(e.name) || e.isSymbolicLink()) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const buf = await fs.readFile(full);
        if (buf.includes(0)) continue; // binary files are not supported in the MVP
        out.push({ path: path.relative(dir, full).split(path.sep).join('/'), content: buf.toString('utf8') });
      }
    }
  };
  await walk(dir);
  return out;
}

export function scaffold(type: string, name: string, author: string): ArtifactFile[] {
  if (!ARTIFACT_TYPES.includes(type as any)) throw new Error(`unknown type "${type}" (${ARTIFACT_TYPES.join(', ')})`);
  const manifest: Record<string, unknown> = {
    name, type, version: '0.1.0', description: `Describe what ${name} does and when to use it.`, author, license: 'MIT',
    tags: [], compatibility: { copilot: true, claudeCode: true, codex: true }, permissions: type === 'prompt' || type === 'instruction' ? [] : ['read-files'], dependencies: {},
  };
  const files: ArtifactFile[] = [];
  if (type === 'agent') { manifest.agent = { tools: ['read', 'search'] }; files.push({ path: 'agent.md', content: `You are ${name}.\n\n## Process\n1. ...\n` }); }
  if (type === 'skill') files.push({ path: 'SKILL.md', content: `---\nname: ${name}\ndescription: ${manifest.description}\n---\n\n# ${name}\n\n1. ...\n` });
  if (type === 'prompt') files.push({ path: 'prompt.md', content: 'Describe the task for the model here.\n' });
  if (type === 'instruction') files.push({ path: 'instruction.md', content: '- Rule one.\n' });
  if (type === 'workflow') files.push({ path: 'workflow.md', content: '# Workflow\n\n1. ...\n' });
  if (type === 'mcp') { manifest.permissions = ['network', 'env-vars']; manifest.mcp = { transport: 'stdio', command: 'npx', args: ['-y', 'your-mcp-package'], env: {} }; }
  if (type === 'plugin' || type === 'bundle') manifest.dependencies = { skills: [], mcps: [] };
  files.unshift({ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' });
  files.push({ path: 'README.md', content: `# ${name}\n\n${manifest.description}\n` });
  return files;
}

export { validateArtifact };
