import type { TreeNode } from '@/core/telarc/verify';

const DX = 16;
const DY = 46;

export interface Layout {
  pos: { x: number; y: number }[];
  width: number;
  height: number;
}

/** Árbol "ordenado": cada hoja recibe la siguiente columna; cada padre se centra sobre sus hijos. */
export function layoutTree(nodes: TreeNode[]): Layout {
  const children: number[][] = nodes.map(() => []);
  for (const n of nodes)
    if (n.parent >= 0 && n.parent < nodes.length) children[n.parent]!.push(n.id);
  const pos = nodes.map(() => ({ x: 0, y: 0 }));
  let col = 0;
  let maxDepth = 0;
  // DFS iterativo en post-orden (el árbol puede ser profundo).
  const stack: [number, number][] = nodes.length ? [[0, 0]] : [];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    const [id, idx] = top;
    const kids = children[id]!;
    if (idx < kids.length) {
      top[1]++;
      stack.push([kids[idx]!, 0]);
      continue;
    }
    stack.pop();
    const depth = nodes[id]!.depth;
    maxDepth = Math.max(maxDepth, depth);
    pos[id]!.y = depth * DY;
    pos[id]!.x =
      kids.length === 0 ? col++ * DX : (pos[kids[0]!]!.x + pos[kids[kids.length - 1]!]!.x) / 2;
  }
  return { pos, width: Math.max(col, 1) * DX, height: maxDepth * DY };
}
