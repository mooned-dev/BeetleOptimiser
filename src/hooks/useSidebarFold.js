import { useState } from 'react';

export function useSidebarFold(initial = false) {
  const [folded, setFolded] = useState(initial);
  const toggle = () => setFolded(f => !f);
  return { folded, toggle };
}
