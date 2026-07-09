import { readFileSync, writeFileSync } from 'fs';

export function openFile(filePath: string): { content: string; fileName: string; language: string } {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'untitled';
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  return { content, fileName, language: ext };
}

export function saveFile(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf-8');
}
