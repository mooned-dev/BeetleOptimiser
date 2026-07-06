import { useState } from 'react';

export function useTheme() {
  const [isLight, setIsLight] = useState(false);
  return { isLight, toggle: () => setIsLight(v => !v) };
}
