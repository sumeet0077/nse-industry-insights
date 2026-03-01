const fs = require('fs');
const content = fs.readFileSync('lib/config.ts', 'utf-8');
const match = content.match(/export const INDUSTRIES: IndexConfig\[\] = \[([\s\S]*?)\];/);
if (match) {
    const lines = match[1].split('\n').filter(l => l.includes('title:'));
    const titles = lines.map(l => {
        const titleMatch = l.match(/title:\s*"([^"]+)"/);
        return titleMatch ? titleMatch[1] : null;
    }).filter(t => t);
    console.log("Original Order:", titles);
    console.log("Sorted Order:", [...titles].sort((a,b) => a.localeCompare(b)));
}
