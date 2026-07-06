import { useState } from 'react';

export function useActiveNav(initial = 'pc') {
  const [active, setActive] = useState(initial);
  return { active, setActive };
}
