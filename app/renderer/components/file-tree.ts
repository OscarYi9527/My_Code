export interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const p of paths) {
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      let node = current.find((n) => n.name === parts[i]);
      if (!node) {
        node = { name: parts[i], path: parts.slice(0, i + 1).join('/'), isDirectory: !isLast, children: isLast ? undefined : [] };
        current.push(node);
      }
      if (!isLast && node.children) {
        current = node.children;
      }
    }
  }
  return root;
}

export function renderFileTree(nodes: TreeNode[], onSelect: (node: TreeNode) => void): string {
  const renderNode = (node: TreeNode, depth: number): string => {
    const indent = '  '.repeat(depth);
    const icon = node.isDirectory ? '📁' : '📄';
    const onClick = `onclick="document.dispatchEvent(new CustomEvent('file-select',{detail:{path:'${escapeAttr(node.path)}',name:'${escapeAttr(node.name)}',isDirectory:${node.isDirectory}}}))"`;
    let html = `${indent}<div class="tree-node" ${onClick} style="padding-left:${depth * 16 + 8}px">`;
    html += `<span class="tree-icon">${icon}</span>`;
    html += `<span class="tree-name">${escapeHtml(node.name)}</span>`;
    html += `</div>`;
    if (node.children) {
      for (const child of node.children) {
        html += renderNode(child, depth + 1);
      }
    }
    return html;
  };

  let html = '<div class="file-tree">';
  for (const node of nodes) {
    html += renderNode(node, 0);
  }
  html += '</div>';
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
