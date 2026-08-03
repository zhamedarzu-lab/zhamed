-- Remap journal entry colors from old palette values to new ones.
-- Covers both the original values and any intermediate values that
-- briefly existed as replacements during the palette iteration.

UPDATE journal_entries SET color = '#e82020' WHERE color = '#e05555';
UPDATE journal_entries SET color = '#e55c00' WHERE color = '#e08c3a';
UPDATE journal_entries SET color = '#f5c800' WHERE color = '#e0b04e';
UPDATE journal_entries SET color = '#1fcc55' WHERE color = '#4ecb71';
UPDATE journal_entries SET color = '#2b7fff' WHERE color = '#4eaaee';

-- Intermediate dark variants that briefly lived as the sole replacement
UPDATE journal_entries SET color = '#8b1a1a' WHERE color = '#c0392b';
UPDATE journal_entries SET color = '#a07800' WHERE color = '#c49a2a';
UPDATE journal_entries SET color = '#145c28' WHERE color = '#2ea84e';
UPDATE journal_entries SET color = '#1a3a8a' WHERE color = '#2878c8';

