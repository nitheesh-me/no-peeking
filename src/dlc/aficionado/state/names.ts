/** Display names for gates and stages (content pack: afi.gate.*, afi.gateHelp.*, afi.stage.*). */
import { t } from '../../../i18n/index';

export const gateName = (k: string): string => t(`afi.gate.${k}`);
export const gateHelp = (k: string): string => t(`afi.gateHelp.${k}`);
export const stageName = (p: string): string => t(`afi.stage.${p}`);
