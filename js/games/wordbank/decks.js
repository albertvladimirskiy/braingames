import finance from '../../../data/decks/finance.js';
import italian from '../../../data/decks/italian.js';
import russian from '../../../data/decks/russian.js';

export const DECKS = [finance, italian, russian];
export const getDeck = (id) => DECKS.find((d) => d.id === id);
