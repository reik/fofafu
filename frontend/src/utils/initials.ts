export function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
