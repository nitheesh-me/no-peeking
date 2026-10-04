import type { Scene } from '../lib/core';
import { logo } from './logo';
import { card } from './card';
import { endcard } from './endcard';
import { titlecollapse } from './titlecollapse';
import { shatter, glitch, blanket } from './transitions';
import { syndrome } from './syndrome';
import { circuit } from './circuit';
import { caption } from './caption';

export const SCENES: Record<string, Scene> = { logo, card, endcard, titlecollapse, shatter, glitch, blanket, syndrome, circuit, caption };
