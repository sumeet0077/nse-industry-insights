const names = ['Copper', 'Defence & Aerospace', 'Railways & Infrastructure', 'Power T&D', 'Life Insurance', 'General Insurance', 'Private Banking', 'PSU Banking'];
const sorted = [...names].sort((a,b) => a.localeCompare(b));
console.log(sorted);
