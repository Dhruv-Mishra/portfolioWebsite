export function getPublicEnv(name: string): string | undefined {
  const importMetaEnv = import.meta.env as Record<string, string | undefined>;
  return importMetaEnv[name] ?? importMetaEnv[name.replace(/^NEXT_PUBLIC_/, 'PUBLIC_')];
}

export function getPublicFlag(name: string): boolean {
  return getPublicEnv(name) === 'true';
}