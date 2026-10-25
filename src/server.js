const path = require('node:path');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
// WEB_DIR=web serves the SPA too, so `npm start` is the whole app locally.
const webDir = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : undefined;
// One JSON line per request on stdout; CloudWatch Logs turns these into metrics (see ship-it-demo-infra).
const log = (line) => process.stdout.write(line + '\n');
createApp({ webDir, log }).listen(port, () => console.log(`status-board listening on ${port}`));
