/** The three generative card styles a person can choose to share (R5). */
export const CARD_STYLES = ['huella', 'cordillera', 'constelacion'] as const;

export type CardStyle = (typeof CARD_STYLES)[number];
