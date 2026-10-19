// The saved weekly searches and the last Monday run, in Netlify Blobs (df-weekly).
import { getStore } from '@netlify/blobs';

export const MAX_WEEKLY = 8;
export const weeklyStore = () => getStore({ name: 'df-weekly', consistency: 'strong' });
