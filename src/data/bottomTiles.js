// 7 bottom tool tiles - matches Auslogics BoostSpeed dashboard.
// Icon on top, 2-line label below (vertical layout).
import {
  HardDrives, Trash, RocketLaunch, GlobeHemisphereWest,
  ArrowsClockwise, Copy, PlusCircle,
} from '@phosphor-icons/react';

export const BOTTOM_TILES = [
  { id: 'ssd',        Icon: HardDrives,          line1: 'SSD',        line2: 'Optimizer',   isNew: true },
  { id: 'uninstall',  Icon: Trash,               line1: 'Uninstall',  line2: 'Manager' },
  { id: 'startup',    Icon: RocketLaunch,        line1: 'Startup',    line2: 'Manager' },
  { id: 'browser',    Icon: GlobeHemisphereWest, line1: 'Browser',    line2: 'Protection' },
  { id: 'driver',     Icon: ArrowsClockwise,     line1: 'Driver',     line2: 'Updater' },
  { id: 'duplicate',  Icon: Copy,                line1: 'Duplicates', line2: 'Finder' },
  { id: 'add',        Icon: PlusCircle,          line1: 'Add',        line2: 'tool' },
];
