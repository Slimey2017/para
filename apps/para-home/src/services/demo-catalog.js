// PARA no longer ships fake/built-in demo games.
// ParaStore and connected libraries are the source of installable games.
export const DEMOS = Object.freeze([]);

export const demoById = (id) => DEMOS.find((demo) => demo.id === id) || null;
export const demoByRoute = (route) => DEMOS.find((demo) => demo.route === route) || null;
