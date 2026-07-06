// Right sidebar items in exact Auslogics order.
// No "My" prefix, no Store, no Tools (per user spec).
//
// Each item has an `action` field telling RightSidebar what to do on
// click: 'tab:<Name>' switches the active tab to that page, 'noop' just
// highlights (reserved for future nav targets that don't exist yet).
import {
  Star, Question, ChatCircleDots, DownloadSimple,
  CalendarBlank, Lifebuoy,
} from '@phosphor-icons/react';

export const NAV_ITEMS = [
  { id: 'pc',          label: 'PC',                    Icon: Star,                action: 'tab:Dashboard' },
  { id: 'questions',   label: 'Questions',             Icon: Question,            action: 'tab:Ask a Question' },
  { id: 'advisor',     label: 'Advisor',               Icon: ChatCircleDots,      action: 'tab:Advisor' },
  { id: 'reports',     label: 'Reports',               Icon: DownloadSimple,      action: 'tab:Reports' },
  { id: 'maintenance', label: 'Automatic Maintenance', Icon: CalendarBlank,       action: 'tab:Maintain' },
  { id: 'rescue',      label: 'Rescue Center',         Icon: Lifebuoy,            action: 'tab:Care Center' },
];
