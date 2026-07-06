// Top tab labels and icons in exact Auslogics order.
// Store and All Tools were removed per user spec - the user said
// "no need store or all tools tabs or even on side menues".
import {
  House, MagnifyingGlass, Briefcase, Trash, GearSix, ShieldCheck, Calendar,
  Clock, ClipboardText, Shield, Lifebuoy, Question,
} from '@phosphor-icons/react';

export const TABS = [
  { label: 'Dashboard',     Icon: House },
  { label: 'Scanner',       Icon: MagnifyingGlass },
  { label: 'Advisor',       Icon: Briefcase },
  { label: 'Clean Up',      Icon: Trash },
  { label: 'Optimize',      Icon: GearSix },
  { label: 'Protect',       Icon: ShieldCheck },
  { label: 'Maintain',      Icon: Calendar },
  { label: 'My Tasks',      Icon: Clock },
  { label: 'Reports',       Icon: ClipboardText },
  { label: 'Win10 Protector', Icon: Shield },
  { label: 'Care Center',   Icon: Lifebuoy },
  { label: 'Ask a Question', Icon: Question },
];
