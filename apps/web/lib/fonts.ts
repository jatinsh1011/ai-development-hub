import { Nunito } from 'next/font/google';

/**
 * Rounded display face where "Arial Rounded MT Bold" isn't installed (Windows, Android, Linux).
 * Defined once here so every root layout shares one @font-face set.
 */
export const rounded = Nunito({ subsets: ['latin'], weight: ['800', '900'], variable: '--font-nunito', display: 'swap' });
