const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add `flex flex-col max-h-[90vh]` to modal wrappers.
// We target `bg-white` classes with `rounded` and `animate-fade-up` and `overflow-hidden`.
content = content.replace(/className="([^"]*bg-white[^"]*rounded[^"]*w-full overflow-hidden animate-fade-up[^"]*)"/g, (match, classes) => {
    if (!classes.includes('flex flex-col')) {
        let newClasses = classes.replace('overflow-hidden animate-fade-up', 'flex flex-col max-h-[90vh] overflow-hidden animate-fade-up');
        return `className="${newClasses}"`;
    }
    return match;
});

// 2. Remove `max-h-[...]` from any child inner container and add `flex-1`.
// We target `max-h-[70vh]`, `max-h-[75vh]`, etc and `overflow-y-auto custom-scrollbar`.
content = content.replace(/className="([^"]*max-h-\[\d+vh\][^"]*)"/g, (match, classes) => {
    // only do this if it's the scrollable inner container of a modal
    if (classes.includes('overflow-y-auto') && classes.includes('custom-scrollbar')) {
        let newClasses = classes.replace(/max-h-\[\d+vh\]/g, '').replace(/\s+/g, ' ').trim();
        if (!newClasses.includes('flex-1')) {
            newClasses += ' flex-1';
        }
        return `className="${newClasses}"`;
    }
    return match;
});

// 3. For any modals that didn't have max-h on their inner container but now have flex-col wrapper,
// We should make sure their content div has `overflow-y-auto custom-scrollbar flex-1`.
// Let's explicitly check the MasterData modals which don't have max-h-[75vh]
// Such as: <div className="p-6 grid grid-cols-2 gap-5"> -> should be <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto custom-scrollbar flex-1">
// But only inside modals.
// We will replace explicitly:
content = content.replace(/<div className="p-6 grid grid-cols-2 gap-5">/g, '<div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto custom-scrollbar flex-1">');
content = content.replace(/<div className="p-6 flex flex-col gap-4">/g, '<div className="p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1">');
content = content.replace(/<div className="p-6 flex flex-col gap-5">/g, '<div className="p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar flex-1">');
content = content.replace(/<div className="p-6">/g, '<div className="p-6 overflow-y-auto custom-scrollbar flex-1">');


fs.writeFileSync('src/App.jsx', content, 'utf8');
console.log('App.jsx modal classes updated.');
