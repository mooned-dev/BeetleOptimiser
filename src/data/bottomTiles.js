// 7 top tiles (existing Auslogics-style quick-access) + 4 system tools below
// them. Matches Auslogics BoostSpeed dashboard tile arrangement with
// Internet/Disk Explorer/Task Manager/Add-ons Manager added - the rest of
// their tools (Win10 Protectors, Force Uninstall, Browser Protection check)
// are covered by other tabs/right-sidebar nav.

import {
  HardDrives, Trash, RocketLaunch, GlobeHemisphereWest,
  ArrowsClockwise, Copy, PlusCircle, Lightning, FolderOpen,
  Cpu, PuzzlePiece, Eraser, TreeEvergreen, Link, Archive, BellRinging, FileArrowDown,
  Compass, ClockClockwise,
} from '@phosphor-icons/react';

export const BOTTOM_TILES = [
  { id: 'ssd',        Icon: HardDrives,        line1: 'SSD',        line2: 'Optimizer',   isNew: true },
  { id: 'uninstall',  Icon: Trash,             line1: 'Uninstall',  line2: 'Manager' },
  { id: 'startup',    Icon: RocketLaunch,      line1: 'Startup',    line2: 'Manager' },
  { id: 'browser',    Icon: GlobeHemisphereWest, line1: 'Browser',  line2: 'Protection' },
  { id: 'driver',     Icon: ArrowsClockwise,   line1: 'Driver',     line2: 'Updater' },
  { id: 'duplicate',  Icon: Copy,              line1: 'Duplicates', line2: 'Finder' },
  { id: 'add',        Icon: PlusCircle,        line1: 'Add',        line2: 'tool' },

  // Second row: 8 system tools.
  { id: 'internet',   Icon: Lightning,         line1: 'Internet',   line2: 'Speed Up' },
  { id: 'disk-explorer', Icon: FolderOpen,      line1: 'Disk',       line2: 'Explorer' },
  { id: 'task-manager',  Icon: Cpu,             line1: 'Task',       line2: 'Manager' },
  { id: 'addons',        Icon: PuzzlePiece,    line1: 'Add-ons',    line2: 'Manager' },
  { id: 'wiper',         Icon: Eraser,          line1: 'Free Space', line2: 'Wiper' },
  { id: 'slimmer',       Icon: TreeEvergreen,   line1: 'Windows',    line2: 'Slimmer' },
  { id: 'mode',          Icon: Lightning,       line1: 'Mode',       line2: 'Switcher' },
  { id: 'integrator',    Icon: Link,            line1: 'Shell',      line2: 'Integrator' },
  { id: 'regdefrag',     Icon: Archive,         line1: 'Registry',   line2: 'Defrag' },
  { id: 'actioncenter',  Icon: BellRinging,     line1: 'Action',     line2: 'Center' },
  { id: 'debuglog',      Icon: FileArrowDown,   line1: 'Debug',      line2: 'Log' },
  { id: 'diskpriority',  Icon: Lightning,       line1: 'Disk',       line2: 'Priority' },
  { id: 'backupcleaner', Icon: Trash,           line1: 'Backup',     line2: 'Cleaner' },
  { id: 'defragboot',    Icon: ClockClockwise,  line1: 'Defrag',     line2: 'on Boot' },
  { id: 'bho',           Icon: Compass,        line1: 'Browser',    line2: 'BHO' },
];
