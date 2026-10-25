const path = require('node:path');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
// WEB_DIR=web serves the SPA too, so `npm start` is the whole app locally.
const webDir = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : undefined;
createApp({ webDir }).listen(port, () => console.log(`status-board listening on ${port}`));
