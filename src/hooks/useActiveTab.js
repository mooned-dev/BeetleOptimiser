import { useState } from 'react';

export function useActiveTab(initial = 'Dashboard') {
  const [active, setActive] = useState(initial);
  return { active, setActive };
}
